const odoo = require("../config/odooClient");
exports.getDashboard = async (req, res) => {
  try {
    const uid = await odoo.authenticate(req);
    const [totalOrders, quotations, orders] = await Promise.all([
      odoo.execute(req, uid, "sale.order", "search_count", [[]]),
      odoo.execute(req, uid, "sale.order", "search_count", [[[["state", "=", "draft"]]]]),
      odoo.execute(req, uid, "sale.order", "search_read", [[]], { fields: ["amount_total"] }),
    ]);
    const totalRevenue = orders.reduce((s, o) => s + (o.amount_total || 0), 0);
    res.json({ totalOrders, quotations, totalRevenue, status: "Connected" });
  } catch (error) {
    res.status(500).json({ status: "Disconnected", error: error.message });
  }
};
