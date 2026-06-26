const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getDashboard = async (req, res) => {
  const { uid, partnerId } = req.user;
  try {
    const [orders, quotations, allOrders, invoices, projects, tasks] = await Promise.all([
      odoo.searchCount("sale.order",     [["state", "in", ["sale", "done"]]]),
      odoo.searchCount("sale.order",       [["user_id.id", "=", uid], ["state", "=", "draft"]]),
      odoo.searchRead( "sale.order",       [["user_id.id", "=", uid]], ["amount_total"]),
      odoo.searchCount("account.move",     [["partner_id", "=", partnerId], ["move_type", "=", "out_invoice"], ["state", "=", "posted"]]),
      odoo.searchCount("project.project",  [["user_id.id", "=", uid]]),
      odoo.searchCount("project.task",     [["user_ids.id", "=", uid], ["stage_id.fold", "=", false]]),
    ]);
    const totalRevenue = allOrders.reduce((s, o) => s + (o.amount_total || 0), 0);
    return success(res, { orders, quotations, totalRevenue, invoices, projects, tasks, status: "Connected" });
  } catch (err) {
    return error(res, err.message);
  }
};