const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getAnalytics = async (req, res) => {
  const { uid } = req.user;
  try {
    const sales = await odoo.searchRead("sale.order", [], ["amount_total"]);
    const total = sales.reduce((s, o) => s + Number(o.amount_total || 0), 0);
    return success(res, { totalRevenue: total, totalOrders: sales.length });
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getPredictions = async (req, res) => {
  const { uid } = req.user;
  try {
    const sales = await odoo.searchRead("sale.order", [["user_id.id", "=", uid]], ["amount_total"], 50);
    const total = sales.reduce((s, o) => s + Number(o.amount_total || 0), 0);
    return success(res, {
      currentRevenue:  total,
      currentOrders:   sales.length,
      predictedRevenue: +(total * 1.12).toFixed(2),
      predictedOrders:  Math.round(sales.length * 1.18),
      growth: "12%",
      insight: total > 0
        ? "Revenue is expected to grow based on recent sales."
        : "Revenue may remain stable based on current sales.",
    });
  } catch (err) {
    return error(res, err.message);
  }
};