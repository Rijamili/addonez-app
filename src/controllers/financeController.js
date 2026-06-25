const odoo = require("../config/odooClient");
exports.getFinance = async (req, res) => {
  try {
    const invoices = await odoo.call(req, "account.move", "search_read", [[[["move_type", "=", "out_invoice"], ["state", "=", "posted"]]]], { fields: ["name", "amount_total", "payment_state"], limit: 50 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
