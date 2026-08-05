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
    const domain = [];

    // My Tasks / All Tasks toggle — mirrors Odoo's Tasks menu. Employee
    // tier ALWAYS gets their own tasks only, regardless of what's passed
    // here (role scoping stays authoritative — see dataScope.js).
    // Company/Admin default to "all" and can pass ?scope=mine to see
    // just their own, same as picking "My Tasks" in Odoo.
    if (isOwnDataOnly(req) || req.query.scope === "mine") {
      domain.push(["user_ids", "in", [uid]]);
    }
    if (req.query.projectId) domain.push(["project_id", "=", parseInt(req.query.projectId, 10)]);
    if (req.query.stageId) domain.push(["stage_id", "=", parseInt(req.query.stageId, 10)]);
    if (req.query.priority) domain.push(["priority", "=", req.query.priority]);
    if (req.query.tagId) domain.push(["tag_ids", "in", [parseInt(req.query.tagId, 10)]]);
    if (req.query.search) domain.push(["name", "ilike", req.query.search]);

    const tasks = await odoo.searchRead(
      "project.task", domain,
      ["name", "project_id", "stage_id", "date_deadline", "priority", "tag_ids", "user_ids"], 200
    );

    // Resolve tag ids -> names in one batch read rather than N+1 calls.
    const tagIds = [...new Set(tasks.flatMap((t) => t.tag_ids || []))];
    let tagsById = {};
    if (tagIds.length) {
      const tags = await odoo.searchRead("project.tags", [["id", "in", tagIds]], ["id", "name", "color"], tagIds.length);
      tags.forEach((t) => { tagsById[t.id] = t; });
    }

    return success(
      res,
      tasks.map((t) => ({
        ...t,
        tags: (t.tag_ids || []).map((id) => tagsById[id]).filter(Boolean),
      }))
    );
  } catch (err) {
    return error(res, err.message);
  }
};

// ---------------------------------------------------------------------
// Task handler — create/update/delete, plus a simplified status changer
// (Started / Ongoing / Completed) for employees who don't need to know
// about a project's actual Odoo kanban stage names.
// ---------------------------------------------------------------------

async function assertTaskAccess(req, task) {
  if (!isOwnDataOnly(req)) return;
  const { uid } = req.user;
  if (!(task.user_ids || []).includes(uid)) {
    throw Object.assign(new Error("You can only update tasks assigned to you."), { status: 403 });
  }
}

// Maps our simplified 3-state model onto whatever kanban stages this
// project actually has configured in Odoo (these vary per project — Odoo
// doesn't have a single fixed set of task stages). Tries to match by
// name first (covers the vast majority of real projects — "To Do",
// "In Progress", "Done" and close variants); if nothing matches, falls
// back to position: first stage by sequence = Started, last = Completed,
// anything in between = Ongoing.
const STATUS_KEYWORDS = {
  started:   ["new", "to do", "todo", "backlog", "open", "start"],
  ongoing:   ["progress", "doing", "ongoing", "working", "review"],
  completed: ["done", "complete", "closed", "finished", "cancel"],
};

async function resolveStageId(projectId, statusKey) {
  const stages = await odoo.searchRead(
    "project.task.type",
    [["project_ids", "in", [projectId]]],
    ["id", "name", "sequence"],
    50, 0, "sequence asc"
  );
  if (!stages.length) throw new Error("This project has no task stages configured.");

  const keywords = STATUS_KEYWORDS[statusKey] || [];
  const byKeyword = stages.find((s) => keywords.some((k) => s.name.toLowerCase().includes(k)));
  if (byKeyword) return byKeyword.id;

  // Positional fallback.
  if (statusKey === "started") return stages[0].id;
  if (statusKey === "completed") return stages[stages.length - 1].id;
  return stages[Math.floor(stages.length / 2)].id; // "ongoing" -> a middle stage
}

// POST /api/projects/tasks
// body: { projectId, name, description?, deadline?, priority?, assigneeIds? }
exports.createTask = async (req, res) => {
  try {
    const { uid } = req.user;
    const { projectId, name, description, deadline, priority, assigneeIds } = req.body;
    if (!projectId || !name) return error(res, "projectId and name are required.", 400);

    await assertProjectAccess(req, parseInt(projectId, 10));

    // Employees can only create tasks assigned to themselves — assigning
    // work to OTHER people is a Company/Admin action.
    const finalAssignees = isOwnDataOnly(req)
      ? [uid]
      : (Array.isArray(assigneeIds) && assigneeIds.length ? assigneeIds.map((id) => parseInt(id, 10)) : [uid]);

    const values = {
      project_id: parseInt(projectId, 10),
      name,
      user_ids: [[6, 0, finalAssignees]],
    };
    if (description) values.description = description;
    if (deadline) values.date_deadline = deadline;
    if (priority) values.priority = priority;

    const id = await odoo.execute("project.task", "create", [values]);
    return success(res, { id: Array.isArray(id) ? id[0] : id }, "Task created.");
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
};

// PATCH /api/projects/tasks/:id
// body: any of { name, description, deadline, priority, tagIds }
exports.updateTask = async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const task = await odoo.searchRead("project.task", [["id", "=", taskId]], ["user_ids", "project_id"], 1);
    if (!task.length) return error(res, "Task not found.", 404);
    await assertTaskAccess(req, task[0]);

    const { name, description, deadline, priority, tagIds } = req.body;
    const values = {};
    if (name !== undefined) values.name = name;
    if (description !== undefined) values.description = description;
    if (deadline !== undefined) values.date_deadline = deadline;
    if (priority !== undefined) values.priority = priority;
    if (Array.isArray(tagIds)) values.tag_ids = [[6, 0, tagIds.map((id) => parseInt(id, 10))]];

    await odoo.execute("project.task", "write", [[taskId], values]);
    return success(res, null, "Task updated.");
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
};

// PATCH /api/projects/tasks/:id/status
// body: { status: "started" | "ongoing" | "completed" }
exports.updateTaskStatus = async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { status } = req.body;
    if (!["started", "ongoing", "completed"].includes(status)) {
      return error(res, "status must be one of: started, ongoing, completed.", 400);
    }

    const task = await odoo.searchRead("project.task", [["id", "=", taskId]], ["user_ids", "project_id"], 1);
    if (!task.length) return error(res, "Task not found.", 404);
    await assertTaskAccess(req, task[0]);

    const projectId = task[0].project_id?.[0];
    if (!projectId) return error(res, "This task isn't linked to a project.", 400);

    const stageId = await resolveStageId(projectId, status);
    await odoo.execute("project.task", "write", [[taskId], { stage_id: stageId }]);
    return success(res, { status, stageId }, `Task marked as ${status}.`);
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
};

// DELETE /api/projects/tasks/:id  (Company/Admin only)
exports.deleteTask = async (req, res) => {
  try {
    await odoo.execute("project.task", "unlink", [[parseInt(req.params.id, 10)]]);
    return success(res, null, "Task deleted.");
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/projects/tags
exports.getTags = async (req, res) => {
  try {
    const tags = await odoo.searchRead("project.tags", [], ["id", "name", "color"], 200, 0, "name asc");
    return success(res, tags);
  } catch (err) {
    return error(res, err.message);
  }
};

// POST /api/projects/tags  (Company/Admin only — see roleGate on the route)
exports.createTag = async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name) return error(res, "A tag name is required.", 400);
    const id = await odoo.execute("project.tags", "create", [{ name, color: color ?? 0 }]);
    return success(res, { id: Array.isArray(id) ? id[0] : id, name, color: color ?? 0 }, "Tag created.");
  } catch (err) {
    return error(res, err.message);
  }
};

// DELETE /api/projects/tags/:id  (Company/Admin only)
exports.deleteTag = async (req, res) => {
  try {
    await odoo.execute("project.tags", "unlink", [[parseInt(req.params.id, 10)]]);
    return success(res, null, "Tag deleted.");
  } catch (err) {
    return error(res, err.message);
  }
};

// ---------------------------------------------------------------------
// Customer Ratings — Odoo stores these on rating.rating, linked to
// whichever record was rated (res_model/res_id). Project task ratings
// come in with res_model = "project.task".
// ---------------------------------------------------------------------

async function assertProjectAccess(req, projectId) {
  if (!isOwnDataOnly(req)) return;
  const { uid } = req.user;
  const [isManager, hasTask] = await Promise.all([
    odoo.searchCount("project.project", [["id", "=", projectId], ["user_id.id", "=", uid]]),
    odoo.searchCount("project.task", [["project_id", "=", projectId], ["user_ids", "in", [uid]]]),
  ]);
  if (!isManager && !hasTask) {
    throw Object.assign(new Error("You don't have access to this project."), { status: 403 });
  }
}

// GET /api/projects/:id/ratings
exports.getRatings = async (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    if (!projectId) return error(res, "A valid project id is required.", 400);
    await assertProjectAccess(req, projectId);

    const tasks = await odoo.searchRead("project.task", [["project_id", "=", projectId]], ["id"], 2000);
    const taskIds = tasks.map((t) => t.id);
    if (!taskIds.length) return success(res, { ratings: [], summary: { average: 0, satisfied: 0, okay: 0, notSatisfied: 0, total: 0 } });

    const ratings = await odoo.searchRead(
      "rating.rating",
      [["res_model", "=", "project.task"], ["res_id", "in", taskIds], ["consumed", "=", true]],
      ["rating", "rating_text", "publisher_comment", "create_date", "res_id", "partner_id"],
      500, 0, "create_date desc"
    );

    const summary = { average: 0, satisfied: 0, okay: 0, notSatisfied: 0, total: ratings.length };
    let sum = 0;
    ratings.forEach((r) => {
      sum += r.rating || 0;
      if (r.rating_text === "satisfied") summary.satisfied += 1;
      else if (r.rating_text === "okay") summary.okay += 1;
      else if (r.rating_text === "not_satisfied") summary.notSatisfied += 1;
    });
    summary.average = ratings.length ? Math.round((sum / ratings.length) * 100) / 100 : 0;

    const taskById = {};
    tasks.forEach((t) => { taskById[t.id] = t; });

    return success(res, {
      ratings: ratings.map((r) => ({
        id: r.id,
        rating: r.rating,
        sentiment: r.rating_text,
        comment: r.publisher_comment || null,
        createdAt: r.create_date,
        author: r.partner_id?.[1] || "Anonymous",
        taskId: r.res_id,
      })),
      summary,
    });
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
};

// ---------------------------------------------------------------------
// Tasks Analysis (cross-project reporting — mirrors Odoo's Reporting >
// Tasks Analysis pivot/graph view). Employee tier only ever sees their
// own tasks in this breakdown (dataScope enforced via getTasks-style
// domain below), Company/Admin see everything or one project via
// ?projectId=.
// ---------------------------------------------------------------------

// GET /api/projects/tasks-analysis?projectId=
exports.getTasksAnalysis = async (req, res) => {
  const { uid } = req.user;
  try {
    const domain = isOwnDataOnly(req) ? [["user_ids", "in", [uid]]] : [];
    if (req.query.projectId) domain.push(["project_id", "=", parseInt(req.query.projectId, 10)]);

    const tasks = await odoo.searchRead(
      "project.task", domain,
      ["project_id", "stage_id", "priority", "user_ids"], 5000
    );

    const byProject = {};
    const byStage = {};
    const byPriority = {};
    const byAssignee = {};

    tasks.forEach((t) => {
      const projectName = t.project_id?.[1] || "No project";
      byProject[projectName] = (byProject[projectName] || 0) + 1;

      const stageName = t.stage_id?.[1] || "No stage";
      byStage[stageName] = (byStage[stageName] || 0) + 1;

      const priorityLabel = t.priority === "1" ? "High" : "Normal";
      byPriority[priorityLabel] = (byPriority[priorityLabel] || 0) + 1;
    });

    const assigneeIds = [...new Set(tasks.flatMap((t) => t.user_ids || []))];
    if (assigneeIds.length && !isOwnDataOnly(req)) {
      const users = await odoo.searchRead("res.users", [["id", "in", assigneeIds]], ["id", "name"], assigneeIds.length);
      const nameById = {};
      users.forEach((u) => { nameById[u.id] = u.name; });
      tasks.forEach((t) => {
        (t.user_ids || []).forEach((id) => {
          const name = nameById[id] || `#${id}`;
          byAssignee[name] = (byAssignee[name] || 0) + 1;
        });
      });
    }

    const toArray = (obj) => Object.entries(obj).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

    return success(res, {
      total: tasks.length,
      byProject: toArray(byProject),
      byStage: toArray(byStage),
      byPriority: toArray(byPriority),
      byAssignee: toArray(byAssignee),
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// ---------------------------------------------------------------------
// Project Roles & Activity Types — Configuration screens. Reads are
// open to everyone (needed just to assign/display a role), writes are
// gated to Company/Admin at the route level via requireManagerTier.
// ---------------------------------------------------------------------

// GET /api/projects/roles
exports.getProjectRoles = async (req, res) => {
  try {
    const roles = await odoo.searchRead("project.role", [], ["id", "name"], 200, 0, "name asc");
    return success(res, roles);
  } catch (err) {
    // project.role doesn't exist on Odoo versions before the 17
    // collaborator-roles feature — degrade to an empty, honest list
    // rather than a 500 (same pattern as Manufacturing's optional apps).
    return success(res, []);
  }
};

// POST /api/projects/roles  (Company/Admin only)
exports.createProjectRole = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return error(res, "A role name is required.", 400);
    const id = await odoo.execute("project.role", "create", [{ name }]);
    return success(res, { id: Array.isArray(id) ? id[0] : id, name }, "Role created.");
  } catch (err) {
    return error(res, err.message);
  }
};

// DELETE /api/projects/roles/:id  (Company/Admin only)
exports.deleteProjectRole = async (req, res) => {
  try {
    await odoo.execute("project.role", "unlink", [[parseInt(req.params.id, 10)]]);
    return success(res, null, "Role deleted.");
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/projects/activity-types — read-only: activity types are a
// platform-wide Odoo concept (mail.activity.type), not project-specific,
// so we surface them for planning task follow-ups but don't let the
// mobile app create/delete entries that would affect every other app.
exports.getActivityTypes = async (req, res) => {
  try {
    const types = await odoo.searchRead(
      "mail.activity.type",
      [],
      ["id", "name", "category", "delay_count", "delay_unit"],
      200, 0, "name asc"
    );
    return success(res, types);
  } catch (err) {
    return success(res, []);
  }
};

// ---------------------------------------------------------------------
// Collaborators — assigning a Project Role to a project member.
// ---------------------------------------------------------------------

// GET /api/projects/:id/collaborators
exports.getCollaborators = async (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    if (!projectId) return error(res, "A valid project id is required.", 400);
    await assertProjectAccess(req, projectId);

    const collaborators = await odoo.searchRead(
      "project.collaborator",
      [["project_id", "=", projectId]],
      ["id", "partner_id", "role_id"],
      200
    );
    return success(res, collaborators.map((c) => ({
      id: c.id,
      partnerId: c.partner_id?.[0],
      partnerName: c.partner_id?.[1] || "Unknown",
      roleId: c.role_id?.[0] || null,
      roleName: c.role_id?.[1] || null,
    })));
  } catch (err) {
    // project.collaborator is also a 17+ addition — degrade gracefully.
    if (err.status) return error(res, err.message, err.status);
    return success(res, []);
  }
};

// POST /api/projects/:id/collaborators  (Company/Admin only)
// body: { partnerId, roleId }
exports.assignCollaboratorRole = async (req, res) => {
  try {
    const projectId = parseInt(req.params.id, 10);
    const { partnerId, roleId } = req.body;
    if (!projectId || !partnerId) return error(res, "projectId and partnerId are required.", 400);

    const existing = await odoo.searchRead(
      "project.collaborator",
      [["project_id", "=", projectId], ["partner_id", "=", parseInt(partnerId, 10)]],
      ["id"], 1
    );

    if (existing.length) {
      await odoo.execute("project.collaborator", "write", [[existing[0].id], { role_id: roleId || false }]);
      return success(res, { id: existing[0].id }, "Collaborator role updated.");
    }

    const id = await odoo.execute("project.collaborator", "create", [
      { project_id: projectId, partner_id: parseInt(partnerId, 10), role_id: roleId || false },
    ]);
    return success(res, { id: Array.isArray(id) ? id[0] : id }, "Collaborator added.");
  } catch (err) {
    return error(res, err.message);
  }
};

// DELETE /api/projects/:id/collaborators/:collabId  (Company/Admin only)
exports.removeCollaborator = async (req, res) => {
  try {
    await odoo.execute("project.collaborator", "unlink", [[parseInt(req.params.collabId, 10)]]);
    return success(res, null, "Collaborator removed.");
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