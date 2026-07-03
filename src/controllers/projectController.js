const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getProjects = async (req, res) => {
  const { uid } = req.user;
  try {
    const projects = await odoo.searchRead(
      "project.project", [["user_id.id", "=", uid]],
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
    const tasks = await odoo.searchRead(
      "project.task", [],
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

    return success(res, {
      projectId,
      totalTasks,
      byStage,
      byPriority,
      overdueCount,
      completedCount,
      completionPercent,
    });
  } catch (err) {
    console.error("getTaskAnalysis failed:", err);
    return error(res, err.message);
  }
};