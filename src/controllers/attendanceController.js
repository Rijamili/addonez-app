// src/controllers/attendanceController.js
const { success, error } = require("../utils/response");
const svc = require("../services/attendanceService");
const odoo = require("../config/OdooService");

const tenantIdOf = (req) => req.tenant?.id;

// GET /api/attendance/companies
exports.getCompanies = async (req, res) => {
  try {
    const companies = await svc.getCompanies(req.attendanceCompanyIds);
    return success(res, companies);
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/attendance/departments?companyId=
exports.getDepartments = async (req, res) => {
  try {
    const departments = await svc.getDepartments(req.attendanceCompanyIds);
    return success(res, departments);
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/attendance/employees?companyId=&departmentId=&search=
exports.getEmployees = async (req, res) => {
  try {
    const employees = await svc.getEmployees({
      companyIds: req.attendanceCompanyIds,
      departmentId: req.query.departmentId,
      search: req.query.search,
    });
    return success(res, employees);
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/attendance/leaves?companyId=&employeeId=&state=
exports.getLeaves = async (req, res) => {
  try {
    const leaves = await svc.getLeaves({
      companyIds: req.attendanceCompanyIds,
      employeeId: req.query.employeeId ? parseInt(req.query.employeeId, 10) : null,
      state: req.query.state,
    });
    return success(res, leaves);
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/attendance/settings?companyId=
exports.getSettings = async (req, res) => {
  try {
    const companyId = req.attendanceCompanyIds?.[0];
    if (!companyId) return error(res, "companyId is required.", 400);
    const settings = await svc.getSettings(tenantIdOf(req), companyId);
    return success(res, settings);
  } catch (err) {
    return error(res, err.message);
  }
};

// PATCH /api/attendance/settings  (admin only)
exports.updateSettings = async (req, res) => {
  try {
    const { companyId, ...patch } = req.body;
    if (!companyId) return error(res, "companyId is required.", 400);
    const settings = await svc.updateSettings(tenantIdOf(req), parseInt(companyId, 10), patch);
    return success(res, settings, "Attendance settings updated.");
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/attendance/dashboard?companyId=&date=
// Admin with no companyId gets one stats block per visible company plus
// a combined total; everyone else gets a single stats block.
exports.getDashboard = async (req, res) => {
  try {
    const date = req.query.date || svc.todayStr();

    if (req.user.attendanceRole === "admin" && !req.attendanceCompanyIds) {
      const companies = await svc.getCompanies(null);
      const perCompany = await Promise.all(
        companies.map((c) => svc.getDashboardStats({ tenantId: tenantIdOf(req), companyId: c.id, date }))
      );
      const combined = perCompany.reduce(
        (acc, s) => ({
          totalEmployees: acc.totalEmployees + s.totalEmployees,
          presentToday: acc.presentToday + s.presentToday,
          absentToday: acc.absentToday + s.absentToday,
          lateEmployees: acc.lateEmployees + s.lateEmployees,
          leaveRequests: acc.leaveRequests + s.leaveRequests,
        }),
        { totalEmployees: 0, presentToday: 0, absentToday: 0, lateEmployees: 0, leaveRequests: 0 }
      );
      return success(res, {
        date,
        combined,
        companies: perCompany.map((s, i) => ({ ...s, companyName: companies[i].name })),
      });
    }

    const companyId = req.attendanceCompanyIds?.[0];
    if (!companyId) return error(res, "companyId is required.", 400);
    const stats = await svc.getDashboardStats({ tenantId: tenantIdOf(req), companyId, date });
    return success(res, stats);
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/attendance?companyId=&departmentId=&employeeId=&dateFrom=&dateTo=&status=&page=&limit=
exports.getAttendanceList = async (req, res) => {
  try {
    const { departmentId, employeeId, status, page, limit } = req.query;
    let { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) {
      const today = svc.todayStr();
      dateFrom = dateFrom || today;
      dateTo = dateTo || today;
    }

    // Reconcile any punches made directly in Odoo for this range before
    // reading, so the list always reflects reality.
    try {
      const employees = await svc.getEmployees({ companyIds: req.attendanceCompanyIds, departmentId });
      const companyByEmployee = {};
      employees.forEach((e) => { companyByEmployee[e.id] = e.company_id?.[0]; });
      await svc.reconcileFromOdoo({
        tenantId: tenantIdOf(req),
        employeeIds: employees.map((e) => e.id),
        companyByEmployee,
        dateFrom,
        dateTo,
      });
    } catch (reconcileErr) {
      console.warn("getAttendanceList: reconcile skipped:", reconcileErr.message);
    }

    const result = await svc.getAttendanceList({
      tenantId: tenantIdOf(req),
      companyIds: req.attendanceCompanyIds,
      departmentId,
      employeeId: employeeId ? parseInt(employeeId, 10) : null,
      dateFrom,
      dateTo,
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
    return success(res, result);
  } catch (err) {
    return error(res, err.message);
  }
};

// POST /api/attendance/mark  (company/admin)
// body: { employeeId, companyId, date, status, checkIn?, checkOut?, notes? }
exports.markAttendance = async (req, res) => {
  try {
    const { employeeId, companyId, date, status, checkIn, checkOut, notes } = req.body;
    if (!employeeId || !companyId || !date || !status) {
      return error(res, "employeeId, companyId, date and status are required.", 400);
    }
    if (req.attendanceCompanyIds && !req.attendanceCompanyIds.includes(parseInt(companyId, 10))) {
      return error(res, "You don't have access to that company.", 403);
    }
    if (req.user.attendanceRole !== "admin") {
      const withinWindow = await svc.isWithinEditWindow(tenantIdOf(req), companyId, date);
      if (!withinWindow) return error(res, "The edit window for this attendance date has passed.", 403);
    }

    const record = await svc.markAttendance({
      tenantId: tenantIdOf(req),
      companyId: parseInt(companyId, 10),
      employeeId: parseInt(employeeId, 10),
      date,
      status,
      checkIn,
      checkOut,
      notes,
      markedByUserId: req.user.odooUserId,
      source: "company",
    });
    return success(res, record, "Attendance marked.");
  } catch (err) {
    return error(res, err.message);
  }
};

// POST /api/attendance/bulk-mark  (company/admin)
// body: { companyId, date, employeeIds: [...], status }
exports.bulkMarkAttendance = async (req, res) => {
  try {
    const { companyId, date, employeeIds, status } = req.body;
    if (!companyId || !date || !Array.isArray(employeeIds) || !employeeIds.length || !status) {
      return error(res, "companyId, date, employeeIds[] and status are required.", 400);
    }
    if (req.attendanceCompanyIds && !req.attendanceCompanyIds.includes(parseInt(companyId, 10))) {
      return error(res, "You don't have access to that company.", 403);
    }
    if (req.user.attendanceRole !== "admin") {
      const withinWindow = await svc.isWithinEditWindow(tenantIdOf(req), companyId, date);
      if (!withinWindow) return error(res, "The edit window for this attendance date has passed.", 403);
    }

    const result = await svc.bulkMarkAttendance({
      tenantId: tenantIdOf(req),
      companyId: parseInt(companyId, 10),
      date,
      employeeIds: employeeIds.map((id) => parseInt(id, 10)),
      status,
      markedByUserId: req.user.odooUserId,
    });
    return success(res, result, `Marked ${result.success.length} of ${employeeIds.length} employees.`);
  } catch (err) {
    return error(res, err.message);
  }
};

// PATCH /api/attendance/:id
exports.updateAttendance = async (req, res) => {
  try {
    const record = await svc.updateAttendance({
      tenantId: tenantIdOf(req),
      id: parseInt(req.params.id, 10),
      patch: req.body,
      isAdmin: req.user.attendanceRole === "admin",
      companyIds: req.attendanceCompanyIds,
    });
    return success(res, record, "Attendance record updated.");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// DELETE /api/attendance/:id
exports.deleteAttendance = async (req, res) => {
  try {
    await svc.deleteAttendance({
      tenantId: tenantIdOf(req),
      id: parseInt(req.params.id, 10),
      isAdmin: req.user.attendanceRole === "admin",
      companyIds: req.attendanceCompanyIds,
    });
    return success(res, null, "Attendance record deleted.");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// PATCH /api/attendance/:id/approve  (admin, or company for their own company)
exports.approveAttendance = async (req, res) => {
  try {
    const record = await svc.approveAttendance({
      tenantId: tenantIdOf(req),
      id: parseInt(req.params.id, 10),
      approverUserId: req.user.odooUserId,
    });
    return success(res, record, "Attendance approved.");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// GET /api/attendance/reports?companyId=&departmentId=&dateFrom=&dateTo=
exports.getReport = async (req, res) => {
  try {
    const { departmentId } = req.query;
    let { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) {
      const now = new Date();
      dateTo = dateTo || svc.todayStr();
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      dateFrom = dateFrom || from.toISOString().slice(0, 10);
    }
    const report = await svc.getReport({
      tenantId: tenantIdOf(req),
      companyIds: req.attendanceCompanyIds,
      departmentId,
      dateFrom,
      dateTo,
    });
    return success(res, report);
  } catch (err) {
    return error(res, err.message);
  }
};

// ------------------------- Employee self-service -------------------------

// POST /api/attendance/check-in
exports.checkIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};
    const record = await svc.checkIn({
      tenantId: tenantIdOf(req),
      companyId: req.user.employeeCompanyId,
      employeeId: req.user.employeeId,
      latitude,
      longitude,
    });
    return success(res, record, "Checked in.");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// POST /api/attendance/check-out
exports.checkOut = async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};
    const record = await svc.checkOut({
      tenantId: tenantIdOf(req),
      employeeId: req.user.employeeId,
      latitude,
      longitude,
    });
    return success(res, record, "Checked out.");
  } catch (err) {
    return error(res, err.message, 400);
  }
};

// GET /api/attendance/me?dateFrom=&dateTo=  (defaults to current month)
exports.getMyAttendance = async (req, res) => {
  try {
    let { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) {
      const now = new Date();
      dateTo = dateTo || svc.todayStr();
      dateFrom = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    }
    const result = await svc.getMyAttendance({ tenantId: tenantIdOf(req), employeeId: req.user.employeeId, dateFrom, dateTo });
    return success(res, result);
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/attendance/me/today
exports.getMyTodayStatus = async (req, res) => {
  try {
    const today = svc.todayStr();
    const result = await svc.getMyAttendance({ tenantId: tenantIdOf(req), employeeId: req.user.employeeId, dateFrom: today, dateTo: today });
    return success(res, result.records[0] || null);
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/attendance/me/leaves
exports.getMyLeaves = async (req, res) => {
  try {
    const leaves = await svc.getLeaves({ employeeId: req.user.employeeId });
    return success(res, leaves);
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/attendance/me/tasks — surfaces the employee's assigned tasks
// without requiring the separate Projects module screen. Defensive:
// returns [] rather than erroring if Projects isn't installed.
exports.getMyTasks = async (req, res) => {
  try {
    const tasks = await odoo.searchRead(
      "project.task",
      [["user_ids", "in", [req.user.uid]]],
      ["name", "project_id", "stage_id", "date_deadline", "priority"],
      100
    );
    return success(res, tasks);
  } catch (err) {
    return success(res, []); // Projects app not installed / no access — not an error for this widget.
  }
};

// GET /api/attendance/me/projects
exports.getMyProjects = async (req, res) => {
  try {
    const projects = await odoo.searchRead(
      "project.project",
      [["user_id.id", "=", req.user.uid]],
      ["name", "date_start", "date", "task_count"],
      50
    );
    return success(res, projects);
  } catch (err) {
    return success(res, []);
  }
};