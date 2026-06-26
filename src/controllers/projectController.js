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
      "project.task", [["user_ids.id", "=", uid]],
      ["name", "project_id", "stage_id", "date_deadline", "priority"], 50
    );
    return success(res, tasks);
  } catch (err) {
    return error(res, err.message);
  }
};