const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getAnalytics = async (req, res) => {
  const { uid } = req.user;
  try {
    // Revenue = posted customer invoices only, not every sale order.
    // A draft order shouldn't move this number, and a cancelled invoice
    // (state = "cancel") is excluded automatically once it's no longer "posted".
    const invoices = await odoo.searchRead(
      "account.move",
      [["move_type", "=", "out_invoice"], ["state", "=", "posted"]],
      ["amount_total"],
      10000
    );
    const total = invoices.reduce((s, o) => s + Number(o.amount_total || 0), 0);
    return success(res, { totalRevenue: total, totalOrders: invoices.length });
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getPredictions = async (req, res) => {
  const { uid } = req.user;
  try {
    // Same fix as getAnalytics: base predictions on posted invoices for
    // this salesperson, not on every sale order regardless of state.
    const invoices = await odoo.searchRead(
      "account.move",
      [["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["invoice_user_id", "=", uid]],
      ["amount_total"],
      50
    );
    const total = invoices.reduce((s, o) => s + Number(o.amount_total || 0), 0);
    return success(res, {
      currentRevenue:  total,
      currentOrders:   invoices.length,
      predictedRevenue: +(total * 1.12).toFixed(2),
      predictedOrders:  Math.round(invoices.length * 1.18),
      growth: "12%",
      insight: total > 0
        ? "Revenue is expected to grow based on recent sales."
        : "Revenue may remain stable based on current sales.",
    });
  } catch (err) {
    return error(res, err.message);
  }
};