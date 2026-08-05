// src/controllers/timesheetController.js
//
// Odoo stores timesheet entries on account.analytic.line (the same model
// used for all analytic/cost-accounting lines — a timesheet entry is
// just one tagged with a project_id). Role scoping follows the same
// pattern as Projects/Attendance: Employee always sees only their own
// (user_id = uid), Company/Admin see everything and can toggle to "My
// Timesheets" via ?scope=mine, matching Odoo's own Timesheets menu.

const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");
const { isOwnDataOnly } = require("../config/dataScope");

const BILLING_TYPE_LABELS = {
  billable_fixed: "Billed at a Fixed Price",
  billable_time: "Billed on Timesheets",
  billable_milestones: "Billed on Milestones",
  billable_manual: "Billed Manually",
  non_billable: "Non-Billable",
};

// GET /api/timesheets?scope=mine|all&projectId=&taskId=&dateFrom=&dateTo=
exports.getTimesheets = async (req, res) => {
  const { uid } = req.user;
  try {
    const domain = [];
    if (isOwnDataOnly(req) || req.query.scope === "mine") {
      domain.push(["user_id", "=", uid]);
    }
    if (req.query.projectId) domain.push(["project_id", "=", parseInt(req.query.projectId, 10)]);
    if (req.query.taskId) domain.push(["task_id", "=", parseInt(req.query.taskId, 10)]);
    if (req.query.dateFrom) domain.push(["date", ">=", req.query.dateFrom]);
    if (req.query.dateTo) domain.push(["date", "<=", req.query.dateTo]);
    // project_id set = this analytic line is a timesheet entry, not some
    // other kind of analytic/cost line sharing the same model.
    domain.push(["project_id", "!=", false]);

    const lines = await odoo.searchRead(
      "account.analytic.line",
      domain,
      ["date", "name", "project_id", "task_id", "employee_id", "unit_amount"],
      500, 0, "date desc"
    );

    const totalHours = lines.reduce((s, l) => s + Number(l.unit_amount || 0), 0);

    return success(res, {
      entries: lines.map((l) => ({
        id: l.id,
        date: l.date,
        description: l.name,
        projectId: l.project_id?.[0] || null,
        projectName: l.project_id?.[1] || "No project",
        taskId: l.task_id?.[0] || null,
        taskName: l.task_id?.[1] || null,
        employeeName: l.employee_id?.[1] || null,
        hours: Number(l.unit_amount || 0),
      })),
      totalHours: Math.round(totalHours * 100) / 100,
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// POST /api/timesheets
// body: { projectId, taskId?, date, description, hours }
exports.createTimesheet = async (req, res) => {
  try {
    const { uid } = req.user;
    const { projectId, taskId, date, description, hours } = req.body;
    if (!projectId || !date || hours === undefined || hours === null) {
      return error(res, "projectId, date and hours are required.", 400);
    }

    const values = {
      project_id: parseInt(projectId, 10),
      date,
      name: description || "/",
      unit_amount: Number(hours),
      user_id: uid,
    };
    if (taskId) values.task_id = parseInt(taskId, 10);

    const id = await odoo.execute("account.analytic.line", "create", [values]);
    return success(res, { id: Array.isArray(id) ? id[0] : id }, "Timesheet entry logged.");
  } catch (err) {
    return error(res, err.message);
  }
};

// PATCH /api/timesheets/:id
exports.updateTimesheet = async (req, res) => {
  try {
    const lineId = parseInt(req.params.id, 10);
    const line = await odoo.searchRead("account.analytic.line", [["id", "=", lineId]], ["user_id"], 1);
    if (!line.length) return error(res, "Timesheet entry not found.", 404);

    if (isOwnDataOnly(req) && line[0].user_id?.[0] !== req.user.uid) {
      return error(res, "You can only edit your own timesheet entries.", 403);
    }

    const { date, description, hours, taskId } = req.body;
    const values = {};
    if (date !== undefined) values.date = date;
    if (description !== undefined) values.name = description;
    if (hours !== undefined) values.unit_amount = Number(hours);
    if (taskId !== undefined) values.task_id = taskId ? parseInt(taskId, 10) : false;

    await odoo.execute("account.analytic.line", "write", [[lineId], values]);
    return success(res, null, "Timesheet entry updated.");
  } catch (err) {
    return error(res, err.message);
  }
};

// DELETE /api/timesheets/:id
exports.deleteTimesheet = async (req, res) => {
  try {
    const lineId = parseInt(req.params.id, 10);
    const line = await odoo.searchRead("account.analytic.line", [["id", "=", lineId]], ["user_id"], 1);
    if (!line.length) return error(res, "Timesheet entry not found.", 404);

    if (isOwnDataOnly(req) && line[0].user_id?.[0] !== req.user.uid) {
      return error(res, "You can only delete your own timesheet entries.", 403);
    }

    await odoo.execute("account.analytic.line", "unlink", [[lineId]]);
    return success(res, null, "Timesheet entry deleted.");
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/timesheets/report?groupBy=employee|project|task|billing_type&dateFrom=&dateTo=
// Company/Admin only (see requireManagerTier on the route) — mirrors
// Odoo's Reporting > By Employee / By Project / By Task / By Billing Type.
exports.getTimesheetReport = async (req, res) => {
  try {
    const groupBy = ["employee", "project", "task", "billing_type"].includes(req.query.groupBy)
      ? req.query.groupBy
      : "employee";

    const domain = [["project_id", "!=", false]];
    if (req.query.dateFrom) domain.push(["date", ">=", req.query.dateFrom]);
    if (req.query.dateTo) domain.push(["date", "<=", req.query.dateTo]);

    const fields = ["employee_id", "project_id", "task_id", "unit_amount"];
    if (groupBy === "billing_type") fields.push("timesheet_invoice_type");

    let lines;
    try {
      lines = await odoo.searchRead("account.analytic.line", domain, fields, 5000);
    } catch (err) {
      // timesheet_invoice_type doesn't exist on every Odoo version/edition
      // (it's tied to the sale_timesheet module) — degrade gracefully
      // rather than 500 the whole report.
      if (groupBy === "billing_type") {
        lines = await odoo.searchRead("account.analytic.line", domain, ["employee_id", "project_id", "task_id", "unit_amount"], 5000);
      } else {
        throw err;
      }
    }

    const buckets = {};
    lines.forEach((l) => {
      let label;
      if (groupBy === "employee") label = l.employee_id?.[1] || "Unassigned";
      else if (groupBy === "project") label = l.project_id?.[1] || "No project";
      else if (groupBy === "task") label = l.task_id?.[1] || "No task";
      else label = BILLING_TYPE_LABELS[l.timesheet_invoice_type] || "Non-Billable";

      buckets[label] = (buckets[label] || 0) + Number(l.unit_amount || 0);
    });

    const rows = Object.entries(buckets)
      .map(([label, hours]) => ({ label, hours: Math.round(hours * 100) / 100 }))
      .sort((a, b) => b.hours - a.hours);

    return success(res, {
      groupBy,
      rows,
      totalHours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
    });
  } catch (err) {
    return error(res, err.message);
  }
};