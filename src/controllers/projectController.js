const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");
const { isOwnDataOnly } = require("../config/dataScope");

exports.getProjects = async (req, res) => {
  const { uid } = req.user;
  try {
    let domain = [];
    if (isOwnDataOnly(req)) {
      // Employee tier: projects they manage OR have at least one task
      // assigned to them in — not just "manager", since most employees
      // are contributors, not project owners.
      const myTasks = await odoo.searchRead("project.task", [["user_ids", "in", [uid]]], ["project_id"], 2000);
      const myProjectIds = [...new Set(myTasks.map((t) => t.project_id?.[0]).filter(Boolean))];
      domain = myProjectIds.length
        ? ["|", ["id", "in", myProjectIds], ["user_id.id", "=", uid]]
        : [["user_id.id", "=", uid]];
    }
    const projects = await odoo.searchRead(
      "project.project", domain,
      ["name", "date_start", "date", "last_update_status", "task_count"], 20
    );
    return success(res, projects);
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getTasks = async (req, res) => {
  const { uid } = req.user;
  try {
    // Employee tier only sees tasks assigned to them — previously this
    // endpoint had NO filter at all, so any logged-in user could see
    // every task across the whole tenant.
    const domain = isOwnDataOnly(req) ? [["user_ids", "in", [uid]]] : [];
    const tasks = await odoo.searchRead(
      "project.task", domain,
      ["name", "project_id", "stage_id", "date_deadline", "priority"], 50
    );
    return success(res, tasks);
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/projects/:id/task-analysis
// Full breakdown of a project's tasks: counts by stage, counts by priority,
// how many are overdue, and what percentage of tasks are in a "closed"
// (done/cancelled) stage.
exports.getTaskAnalysis = async (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    if (!projectId) {
      return error(res, "A valid project id is required", 400);
    }

    if (isOwnDataOnly(req)) {
      const { uid } = req.user;
      const [isManager, hasTask] = await Promise.all([
        odoo.searchCount("project.project", [["id", "=", projectId], ["user_id.id", "=", uid]]),
        odoo.searchCount("project.task", [["project_id", "=", projectId], ["user_ids", "in", [uid]]]),
      ]);
      if (!isManager && !hasTask) {
        return error(res, "You don't have access to this project.", 403);
      }
    }

    const tasks = await odoo.searchRead(
      "project.task",
      [["project_id", "=", projectId]],
      ["name", "stage_id", "date_deadline", "priority"],
      2000
    );

    const totalTasks = tasks.length;

    if (totalTasks === 0) {
      return success(res, {
        projectId, totalTasks: 0,
        byStage: [], byPriority: [],
        overdueCount: 0, completedCount: 0, completionPercent: 0,
        timesheet: { totalHours: 0, byEmployee: [], byTask: [] },
      });
    }

    // Stage names alone don't tell us which stages count as "done" — Odoo
    // tracks that on project.task.type via the "fold" field (folded stages
    // like "Done"/"Cancelled" are treated as closed by Odoo's own kanban
    // and reporting logic). Note: there is no "is_closed" field on this
    // model — that name only exists on other models like CRM/Helpdesk
    // stages, so don't reach for it here.
    const stageIds = [...new Set(tasks.map((t) => t.stage_id?.[0]).filter(Boolean))];
    const stages = stageIds.length
      ? await odoo.searchRead("project.task.type", [["id", "in", stageIds]], ["id", "name", "fold"], stageIds.length)
      : [];
    const stageById = {};
    stages.forEach((s) => { stageById[s.id] = s; });

    const PRIORITY_LABELS = { "0": "Normal", "1": "High" };

    const stageCounts = {};
    const priorityCounts = {};
    let overdueCount = 0;
    let completedCount = 0;

    const today = new Date().toISOString().slice(0, 10);

    tasks.forEach((task) => {
      const stageName = task.stage_id?.[1] || "No stage";
      stageCounts[stageName] = (stageCounts[stageName] || 0) + 1;

      const priorityKey = task.priority || "0";
      const priorityLabel = PRIORITY_LABELS[priorityKey] || `Priority ${priorityKey}`;
      priorityCounts[priorityLabel] = (priorityCounts[priorityLabel] || 0) + 1;

      const stageInfo = stageById[task.stage_id?.[0]];
      const isClosed = !!stageInfo?.fold;
      if (isClosed) completedCount += 1;

      if (!isClosed && task.date_deadline && task.date_deadline < today) {
        overdueCount += 1;
      }
    });

    const byStage = Object.entries(stageCounts)
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count);

    const byPriority = Object.entries(priorityCounts)
      .map(([priority, count]) => ({ priority, count }))
      .sort((a, b) => b.count - a.count);

    const completionPercent = Math.round((completedCount / totalTasks) * 100);

    // Timesheets — Odoo stores these as account.analytic.line rows linked
    // to the project (and optionally a specific task). "unit_amount" is
    // Odoo's field for the logged hours on each entry. If the tenant
    // doesn't have the Timesheets app installed, project_id simply won't
    // exist as a filterable field here and this search will come back
    // empty rather than error — handled below either way.
    let timesheet = { totalHours: 0, byEmployee: [], byTask: [] };
    try {
      const entries = await odoo.searchRead(
        "account.analytic.line",
        [["project_id", "=", projectId]],
        ["employee_id", "task_id", "unit_amount", "date"],
        5000
      );

      const hoursByEmployee = {};
      const hoursByTask = {};
      let totalHours = 0;

      entries.forEach((e) => {
        const hours = e.unit_amount || 0;
        totalHours += hours;

        const employeeName = e.employee_id?.[1] || "Unassigned";
        hoursByEmployee[employeeName] = (hoursByEmployee[employeeName] || 0) + hours;

        const taskName = e.task_id?.[1] || "No task";
        hoursByTask[taskName] = (hoursByTask[taskName] || 0) + hours;
      });

      timesheet = {
        totalHours: Math.round(totalHours * 100) / 100,
        byEmployee: Object.entries(hoursByEmployee)
          .map(([name, hours]) => ({ name, hours: Math.round(hours * 100) / 100 }))
          .sort((a, b) => b.hours - a.hours),
        byTask: Object.entries(hoursByTask)
          .map(([name, hours]) => ({ name, hours: Math.round(hours * 100) / 100 }))
          .sort((a, b) => b.hours - a.hours),
      };
    } catch (tsErr) {
      // Timesheets app likely isn't installed for this tenant — that's
      // fine, task analysis itself still works without it.
      console.log("Timesheet fetch skipped/failed:", tsErr.message);
    }

    return success(res, {
      projectId,
      totalTasks,
      byStage,
      byPriority,
      overdueCount,
      completedCount,
      completionPercent,
      timesheet,
    });
  } catch (err) {
    console.error("getTaskAnalysis failed:", err);
    return error(res, err.message);
  }
};