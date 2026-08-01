// src/services/attendanceService.js
//
// All the actual business logic for the Attendance module lives here so
// attendanceController stays a thin HTTP layer. Two data sources are
// combined throughout:
//
//   - Odoo (hr.employee, res.company, hr.department, hr.leave,
//     hr.attendance) — the ERP system of record for people/companies and
//     for real clock-in/clock-out events.
//   - Postgres AttendanceRecord/AttendanceSettings (this backend's own
//     DB) — the source of truth for the day's *status* (present / absent
//     / half_day / leave / late), which hr.attendance alone can't express.

const { Op } = require("sequelize");
const odoo = require("../config/OdooService");
const AttendanceRecord = require("../models/AttendanceRecord");
const AttendanceSettings = require("../models/AttendanceSettings");

const todayStr = () => new Date().toISOString().slice(0, 10);
const toDateOnly = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// ---------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------

async function getSettings(tenantId, companyId) {
  const [settings] = await AttendanceSettings.findOrCreate({
    where: { tenant_id: tenantId, company_id: companyId },
    defaults: { tenant_id: tenantId, company_id: companyId },
  });
  return settings;
}

async function updateSettings(tenantId, companyId, patch) {
  const settings = await getSettings(tenantId, companyId);
  const allowed = [
    "lock_hours",
    "late_after",
    "work_start_time",
    "work_end_time",
    "half_day_threshold_hours",
    "require_gps",
  ];
  allowed.forEach((key) => {
    if (patch[key] !== undefined) settings[key] = patch[key];
  });
  await settings.save();
  return settings;
}

// Is `date` (YYYY-MM-DD) still inside the edit window for this company?
async function isWithinEditWindow(tenantId, companyId, date) {
  const settings = await getSettings(tenantId, companyId);
  const cutoff = new Date(`${date}T00:00:00.000Z`);
  cutoff.setHours(cutoff.getHours() + 24 + Number(settings.lock_hours || 0));
  return Date.now() <= cutoff.getTime();
}

// ---------------------------------------------------------------------
// Odoo sync helpers
// ---------------------------------------------------------------------

async function getEmployeeByUserId(odooUserId) {
  const rows = await odoo.searchRead(
    "hr.employee",
    [["user_id", "=", odooUserId]],
    ["id", "name", "work_email", "department_id", "job_id", "company_id", "user_id"],
    1
  );
  return rows[0] || null;
}

async function getEmployees({ companyIds, departmentId, search, limit = 200 }) {
  const domain = [];
  if (companyIds?.length) domain.push(["company_id", "in", companyIds]);
  if (departmentId) domain.push(["department_id", "=", parseInt(departmentId, 10)]);
  if (search) domain.push(["name", "ilike", search]);

  return odoo.searchRead(
    "hr.employee",
    domain,
    [
      "id",
      "name",
      "work_email",
      "mobile_phone",
      "department_id",
      "job_id",
      "company_id",
      "user_id",
      "active",
    ],
    limit,
    0,
    "name asc"
  );
}

async function getCompanies(companyIds) {
  const domain = companyIds?.length ? [["id", "in", companyIds]] : [];
  return odoo.searchRead("res.company", domain, ["id", "name", "email", "phone"], 200, 0, "name asc");
}

async function getDepartments(companyIds) {
  const domain = companyIds?.length ? [["company_id", "in", companyIds]] : [];
  return odoo.searchRead("hr.department", domain, ["id", "name", "company_id", "manager_id"], 200, 0, "name asc");
}

async function getLeaves({ companyIds, employeeId, state }) {
  const domain = [];
  if (employeeId) domain.push(["employee_id", "=", employeeId]);
  if (state) domain.push(["state", "=", state]);
  // hr.leave doesn't carry company_id filtering reliably across every
  // Odoo version, so when scoping by company we first narrow to that
  // company's employee ids.
  if (!employeeId && companyIds?.length) {
    const emps = await odoo.searchRead("hr.employee", [["company_id", "in", companyIds]], ["id"], 2000);
    domain.push(["employee_id", "in", emps.map((e) => e.id)]);
  }
  return odoo.searchRead(
    "hr.leave",
    domain,
    ["id", "employee_id", "holiday_status_id", "date_from", "date_to", "number_of_days", "state"],
    500,
    0,
    "date_from desc"
  );
}

// Is `employeeId` on approved leave covering `date`?
async function isOnApprovedLeave(employeeId, date) {
  const rows = await odoo.searchRead(
    "hr.leave",
    [
      ["employee_id", "=", employeeId],
      ["state", "=", "validate"],
      ["date_from", "<=", `${date} 23:59:59`],
      ["date_to", ">=", `${date} 00:00:00`],
    ],
    ["id"],
    1
  );
  return rows.length > 0;
}

// Creates or updates the hr.attendance row backing a present/half_day/late
// AttendanceRecord. Returns the Odoo id.
async function upsertOdooAttendance({ odooAttendanceId, employeeId, checkIn, checkOut }) {
  const values = {};
  if (checkIn !== undefined) values.check_in = checkIn ? toOdooDateTime(checkIn) : false;
  if (checkOut !== undefined) values.check_out = checkOut ? toOdooDateTime(checkOut) : false;

  if (odooAttendanceId) {
    await odoo.execute("hr.attendance", "write", [[odooAttendanceId], values]);
    return odooAttendanceId;
  }
  const created = await odoo.execute("hr.attendance", "create", [
    { employee_id: employeeId, ...values },
  ]);
  return Array.isArray(created) ? created[0] : created;
}

function toOdooDateTime(dateLike) {
  // Odoo XML-RPC expects "YYYY-MM-DD HH:MM:SS" in UTC.
  const d = new Date(dateLike);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// Finds an open (no check_out yet) hr.attendance row for this employee.
async function findOpenOdooAttendance(employeeId) {
  const rows = await odoo.searchRead(
    "hr.attendance",
    [["employee_id", "=", employeeId], ["check_out", "=", false]],
    ["id", "check_in"],
    1,
    0,
    "check_in desc"
  );
  return rows[0] || null;
}

// ---------------------------------------------------------------------
// Reconciliation — pulls in any hr.attendance punched directly in Odoo
// (outside the app) for a date range and makes sure a local
// AttendanceRecord exists for it, so the two never drift apart.
// ---------------------------------------------------------------------

async function reconcileFromOdoo({ tenantId, employeeIds, companyByEmployee, dateFrom, dateTo }) {
  if (!employeeIds?.length) return;

  const rows = await odoo.searchRead(
    "hr.attendance",
    [
      ["employee_id", "in", employeeIds],
      ["check_in", ">=", `${dateFrom} 00:00:00`],
      ["check_in", "<=", `${dateTo} 23:59:59`],
    ],
    ["id", "employee_id", "check_in", "check_out", "worked_hours"],
    5000
  );

  for (const row of rows) {
    const employeeId = row.employee_id?.[0];
    const date = toDateOnly(row.check_in);
    const companyId = companyByEmployee?.[employeeId];
    if (!employeeId || !date || !companyId) continue;

    const existing = await AttendanceRecord.findOne({
      where: { tenant_id: tenantId, employee_id: employeeId, date },
    });

    if (existing) {
      // Only fill in what's missing — never override a status a human
      // already set locally (e.g. don't turn a manually-corrected
      // "half_day" back into "present" just because Odoo still shows the
      // original punch).
      if (!existing.odoo_attendance_id) {
        existing.odoo_attendance_id = row.id;
        existing.check_in = existing.check_in || row.check_in;
        existing.check_out = existing.check_out || row.check_out || null;
        existing.worked_hours = existing.worked_hours ?? row.worked_hours ?? null;
        await existing.save();
      }
      continue;
    }

    await AttendanceRecord.create({
      tenant_id: tenantId,
      company_id: companyId,
      employee_id: employeeId,
      date,
      status: row.check_out ? "present" : "present",
      check_in: row.check_in,
      check_out: row.check_out || null,
      worked_hours: row.worked_hours || null,
      odoo_attendance_id: row.id,
      source: "odoo",
    });
  }
}

// ---------------------------------------------------------------------
// Marking attendance (company/admin marking someone else's day)
// ---------------------------------------------------------------------

async function markAttendance({
  tenantId,
  companyId,
  employeeId,
  date,
  status,
  checkIn,
  checkOut,
  notes,
  markedByUserId,
  latitude,
  longitude,
  source = "company",
}) {
  let odooAttendanceId = null;

  const existing = await AttendanceRecord.findOne({
    where: { tenant_id: tenantId, employee_id: employeeId, date },
  });

  if (["present", "half_day", "late"].includes(status)) {
    odooAttendanceId = await upsertOdooAttendance({
      odooAttendanceId: existing?.odoo_attendance_id || null,
      employeeId,
      checkIn: checkIn || existing?.check_in || `${date} 09:00:00`,
      checkOut: checkOut || existing?.check_out || null,
    });
  } else {
    odooAttendanceId = existing?.odoo_attendance_id || null;
  }

  const workedHours =
    checkIn && checkOut
      ? Math.max(0, (new Date(checkOut) - new Date(checkIn)) / 3600000)
      : existing?.worked_hours ?? null;

  const values = {
    tenant_id: tenantId,
    company_id: companyId,
    employee_id: employeeId,
    date,
    status,
    check_in: checkIn || existing?.check_in || null,
    check_out: checkOut || existing?.check_out || null,
    worked_hours: workedHours,
    odoo_attendance_id: odooAttendanceId,
    source,
    marked_by_user_id: markedByUserId || null,
    notes: notes !== undefined ? notes : existing?.notes || null,
  };
  if (latitude !== undefined) values.check_in_lat = latitude;
  if (longitude !== undefined) values.check_in_lng = longitude;

  if (existing) {
    await existing.update(values);
    return existing;
  }
  return AttendanceRecord.create(values);
}

async function bulkMarkAttendance({ tenantId, companyId, date, employeeIds, status, markedByUserId }) {
  const results = { success: [], failed: [] };
  for (const employeeId of employeeIds) {
    try {
      const record = await markAttendance({
        tenantId,
        companyId,
        employeeId,
        date,
        status,
        markedByUserId,
        source: "bulk",
      });
      results.success.push({ employeeId, recordId: record.id });
    } catch (err) {
      results.failed.push({ employeeId, error: err.message });
    }
  }
  return results;
}

// ---------------------------------------------------------------------
// Employee self check-in / check-out
// ---------------------------------------------------------------------

async function checkIn({ tenantId, companyId, employeeId, latitude, longitude }) {
  const open = await findOpenOdooAttendance(employeeId);
  if (open) {
    throw new Error("You're already checked in — check out before checking in again.");
  }

  const now = new Date();
  const date = toDateOnly(now);
  const odooAttendanceId = await upsertOdooAttendance({ employeeId, checkIn: now });

  const settings = await getSettings(tenantId, companyId);
  const [lh, lm] = (settings.late_after || "09:30").split(":").map(Number);
  const lateCutoff = new Date(now);
  lateCutoff.setHours(lh, lm, 0, 0);
  const status = now > lateCutoff ? "late" : "present";

  const [record, created] = await AttendanceRecord.findOrCreate({
    where: { tenant_id: tenantId, employee_id: employeeId, date },
    defaults: {
      tenant_id: tenantId,
      company_id: companyId,
      employee_id: employeeId,
      date,
      status,
      check_in: now,
      check_in_lat: latitude ?? null,
      check_in_lng: longitude ?? null,
      odoo_attendance_id: odooAttendanceId,
      source: "mobile",
    },
  });

  if (!created) {
    // Record already existed for today (e.g. company pre-marked it) —
    // fill in the real check-in event on top of it.
    record.status = status;
    record.check_in = now;
    record.check_in_lat = latitude ?? null;
    record.check_in_lng = longitude ?? null;
    record.odoo_attendance_id = odooAttendanceId;
    await record.save();
  }

  return record;
}

async function checkOut({ tenantId, employeeId, latitude, longitude }) {
  const open = await findOpenOdooAttendance(employeeId);
  if (!open) {
    throw new Error("No open check-in was found to check out from.");
  }

  const now = new Date();
  await odoo.execute("hr.attendance", "write", [[open.id], { check_out: toOdooDateTime(now) }]);

  const date = toDateOnly(open.check_in);
  const record = await AttendanceRecord.findOne({ where: { tenant_id: tenantId, employee_id: employeeId, date } });
  if (!record) {
    // Shouldn't normally happen (check-in always creates one), but don't
    // lose the punch if it does.
    return AttendanceRecord.create({
      tenant_id: tenantId,
      company_id: null,
      employee_id: employeeId,
      date,
      status: "present",
      check_in: open.check_in,
      check_out: now,
      odoo_attendance_id: open.id,
      source: "mobile",
    });
  }

  const workedHours = Math.max(0, (now - new Date(record.check_in || open.check_in)) / 3600000);
  const settings = await getSettings(tenantId, record.company_id);
  record.check_out = now;
  record.check_out_lat = latitude ?? null;
  record.check_out_lng = longitude ?? null;
  record.worked_hours = workedHours;
  if (record.status !== "late" && workedHours < Number(settings.half_day_threshold_hours || 4)) {
    record.status = "half_day";
  }
  await record.save();
  return record;
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

async function getAttendanceList({ tenantId, companyIds, departmentId, employeeId, dateFrom, dateTo, status, page = 1, limit = 50 }) {
  const where = { tenant_id: tenantId };
  if (companyIds?.length) where.company_id = { [Op.in]: companyIds };
  if (employeeId) where.employee_id = employeeId;
  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date[Op.gte] = dateFrom;
    if (dateTo) where.date[Op.lte] = dateTo;
  }

  const offset = (page - 1) * limit;
  const { rows, count } = await AttendanceRecord.findAndCountAll({
    where,
    order: [["date", "DESC"]],
    limit,
    offset,
  });

  let records = rows.map((r) => r.toJSON());

  // Enrich with employee name/department from Odoo (best-effort — don't
  // fail the whole list if Odoo is briefly unreachable).
  try {
    const employeeIds = [...new Set(records.map((r) => r.employee_id))];
    if (employeeIds.length) {
      const domain = [["id", "in", employeeIds]];
      if (departmentId) domain.push(["department_id", "=", parseInt(departmentId, 10)]);
      const employees = await odoo.searchRead(
        "hr.employee",
        domain,
        ["id", "name", "department_id", "job_id"],
        employeeIds.length
      );
      const byId = {};
      employees.forEach((e) => { byId[e.id] = e; });
      if (departmentId) {
        records = records.filter((r) => byId[r.employee_id]);
      }
      records = records.map((r) => ({
        ...r,
        employeeName: byId[r.employee_id]?.name || `#${r.employee_id}`,
        department: byId[r.employee_id]?.department_id?.[1] || null,
        jobTitle: byId[r.employee_id]?.job_id?.[1] || null,
      }));
    }
  } catch (err) {
    console.warn("attendanceService.getAttendanceList: employee enrich failed:", err.message);
  }

  return { records, total: count, page, limit };
}

async function getMyAttendance({ tenantId, employeeId, dateFrom, dateTo }) {
  const records = await AttendanceRecord.findAll({
    where: {
      tenant_id: tenantId,
      employee_id: employeeId,
      date: { [Op.gte]: dateFrom, [Op.lte]: dateTo },
    },
    order: [["date", "ASC"]],
  });

  const summary = { present: 0, absent: 0, half_day: 0, leave: 0, late: 0, totalWorkedHours: 0 };
  records.forEach((r) => {
    summary[r.status] = (summary[r.status] || 0) + 1;
    summary.totalWorkedHours += r.worked_hours || 0;
  });
  summary.totalWorkedHours = Math.round(summary.totalWorkedHours * 100) / 100;

  return { records: records.map((r) => r.toJSON()), summary };
}

async function updateAttendance({ tenantId, id, patch, isAdmin, companyIds }) {
  const record = await AttendanceRecord.findOne({ where: { id, tenant_id: tenantId } });
  if (!record) throw new Error("Attendance record not found.");
  if (!isAdmin) {
    if (companyIds?.length && !companyIds.includes(record.company_id)) {
      throw new Error("You don't have access to this record.");
    }
    if (record.locked) throw new Error("This record has been locked and can no longer be edited.");
    const withinWindow = await isWithinEditWindow(tenantId, record.company_id, record.date);
    if (!withinWindow) throw new Error("The edit window for this attendance date has passed.");
  }

  const allowed = ["status", "check_in", "check_out", "notes", "locked"];
  allowed.forEach((key) => {
    if (patch[key] !== undefined) record[key] = patch[key];
  });

  if (patch.check_in !== undefined || patch.check_out !== undefined) {
    const odooAttendanceId = await upsertOdooAttendance({
      odooAttendanceId: record.odoo_attendance_id,
      employeeId: record.employee_id,
      checkIn: patch.check_in !== undefined ? patch.check_in : undefined,
      checkOut: patch.check_out !== undefined ? patch.check_out : undefined,
    });
    record.odoo_attendance_id = odooAttendanceId;
    if (record.check_in && record.check_out) {
      record.worked_hours = Math.max(0, (new Date(record.check_out) - new Date(record.check_in)) / 3600000);
    }
  }

  await record.save();
  return record;
}

async function deleteAttendance({ tenantId, id, isAdmin, companyIds }) {
  const record = await AttendanceRecord.findOne({ where: { id, tenant_id: tenantId } });
  if (!record) throw new Error("Attendance record not found.");
  if (!isAdmin) {
    if (companyIds?.length && !companyIds.includes(record.company_id)) {
      throw new Error("You don't have access to this record.");
    }
    const withinWindow = await isWithinEditWindow(tenantId, record.company_id, record.date);
    if (!withinWindow) throw new Error("The edit window for this attendance date has passed.");
  }

  if (record.odoo_attendance_id) {
    try {
      await odoo.execute("hr.attendance", "unlink", [[record.odoo_attendance_id]]);
    } catch (err) {
      console.warn("deleteAttendance: failed to unlink hr.attendance:", err.message);
    }
  }
  await record.destroy();
  return true;
}

async function approveAttendance({ tenantId, id, approverUserId }) {
  const record = await AttendanceRecord.findOne({ where: { id, tenant_id: tenantId } });
  if (!record) throw new Error("Attendance record not found.");
  record.approved = true;
  record.approved_by_user_id = approverUserId;
  record.approved_at = new Date();
  await record.save();
  return record;
}

// ---------------------------------------------------------------------
// Dashboard / reports
// ---------------------------------------------------------------------

async function getDashboardStats({ tenantId, companyId, date }) {
  const day = date || todayStr();
  const employees = await getEmployees({ companyIds: [companyId] });
  const totalEmployees = employees.length;

  const records = await AttendanceRecord.findAll({
    where: { tenant_id: tenantId, company_id: companyId, date: day },
  });
  const byEmployee = {};
  records.forEach((r) => { byEmployee[r.employee_id] = r.status; });

  let presentToday = 0, absentToday = 0, lateToday = 0, halfDayToday = 0, leaveToday = 0;
  employees.forEach((e) => {
    const status = byEmployee[e.id];
    if (status === "present") presentToday += 1;
    else if (status === "late") { presentToday += 1; lateToday += 1; }
    else if (status === "half_day") { presentToday += 1; halfDayToday += 1; }
    else if (status === "leave") leaveToday += 1;
    else absentToday += 1; // no record yet, or explicit "absent"
  });

  let pendingLeaveRequests = 0;
  try {
    const leaves = await getLeaves({ companyIds: [companyId], state: "confirm" });
    pendingLeaveRequests = leaves.length;
  } catch {
    // hr.leave (Time Off app) may not be installed for this tenant.
  }

  return {
    companyId,
    date: day,
    totalEmployees,
    presentToday,
    absentToday,
    lateEmployees: lateToday,
    halfDayToday,
    leaveToday,
    leaveRequests: pendingLeaveRequests,
  };
}

async function getReport({ tenantId, companyIds, departmentId, dateFrom, dateTo }) {
  const where = { tenant_id: tenantId, date: { [Op.gte]: dateFrom, [Op.lte]: dateTo } };
  if (companyIds?.length) where.company_id = { [Op.in]: companyIds };

  const records = await AttendanceRecord.findAll({ where });

  const byDate = {};
  const byEmployee = {};
  records.forEach((r) => {
    byDate[r.date] = byDate[r.date] || { present: 0, absent: 0, half_day: 0, leave: 0, late: 0 };
    byDate[r.date][r.status] = (byDate[r.date][r.status] || 0) + 1;

    byEmployee[r.employee_id] = byEmployee[r.employee_id] || { present: 0, absent: 0, half_day: 0, leave: 0, late: 0, totalWorkedHours: 0 };
    byEmployee[r.employee_id][r.status] = (byEmployee[r.employee_id][r.status] || 0) + 1;
    byEmployee[r.employee_id].totalWorkedHours += r.worked_hours || 0;
  });

  let employeeNames = {};
  try {
    const ids = Object.keys(byEmployee).map(Number);
    if (ids.length) {
      const domain = departmentId ? [["id", "in", ids], ["department_id", "=", parseInt(departmentId, 10)]] : [["id", "in", ids]];
      const emps = await odoo.searchRead("hr.employee", domain, ["id", "name", "department_id"], ids.length);
      emps.forEach((e) => { employeeNames[e.id] = e.name; });
    }
  } catch {}

  const byDateArr = Object.entries(byDate).map(([date, counts]) => ({ date, ...counts })).sort((a, b) => a.date.localeCompare(b.date));
  const byEmployeeArr = Object.entries(byEmployee)
    .filter(([empId]) => !departmentId || employeeNames[empId] !== undefined)
    .map(([empId, counts]) => ({
      employeeId: Number(empId),
      employeeName: employeeNames[empId] || `#${empId}`,
      ...counts,
      totalWorkedHours: Math.round(counts.totalWorkedHours * 100) / 100,
    }));

  return { dateFrom, dateTo, byDate: byDateArr, byEmployee: byEmployeeArr };
}

module.exports = {
  getSettings,
  updateSettings,
  isWithinEditWindow,
  getEmployeeByUserId,
  getEmployees,
  getCompanies,
  getDepartments,
  getLeaves,
  isOnApprovedLeave,
  reconcileFromOdoo,
  markAttendance,
  bulkMarkAttendance,
  checkIn,
  checkOut,
  getAttendanceList,
  getMyAttendance,
  updateAttendance,
  deleteAttendance,
  approveAttendance,
  getDashboardStats,
  getReport,
  todayStr,
};