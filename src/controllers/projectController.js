const odoo = require("../config/odooClient");
exports.getProjects = async (req, res) => {
  try {
    const projects = await odoo.call(req, "project.project", "search_read", [[]], { fields: ["name", "date_start", "date", "last_update_status"], limit: 20 });
    res.json({ projects });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
