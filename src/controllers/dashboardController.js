const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getDashboard = async (req, res) => {
  try {
    const [orders, quotations, allOrders, invoices, projects, tasks] = await Promise.all([
      odoo.searchCount("sale.order",      [["state", "in", ["sale", "done"]]]),
      odoo.searchCount("sale.order",      [["state", "=", "draft"]]),
      odoo.searchRead( "sale.order",      [], ["amount_total"]),
      odoo.searchCount("account.move",    [["move_type", "=", "out_invoice"], ["state", "=", "posted"]]),
      odoo.searchCount("project.project", []),
      odoo.searchCount("project.task",    [["stage_id.fold", "=", false]]),
    ]);

    const totalRevenue = allOrders.reduce((s, o) => s + (o.amount_total || 0), 0);

    return success(res, {
      orders,
      quotations,
      totalRevenue,
      invoices,
      projects,
      tasks,
      status: "Connected",
    });
  } catch (err) {
    return error(res, err.message);
  }
};