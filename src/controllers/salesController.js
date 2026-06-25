const odoo = require("../config/odooClient");
exports.getSales = async (req, res) => {
  try {
    const orders = await odoo.call(req, "sale.order", "search_read", [[]], { fields: ["name", "amount_total", "state"], limit: 10 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
