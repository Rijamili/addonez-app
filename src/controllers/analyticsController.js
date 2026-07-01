const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

const STATE_LABELS = {
  draft: "Quotation",
  sent:  "Quotation Sent",
  sale:  "Confirmed",
  done:  "Locked",
  cancel: "Cancelled",
};

exports.getAnalytics = async (req, res) => {
  try {
    // Explicit high limit — the previous version had no limit at all, which
    // silently falls back to OdooService's default of 80. That happened to
    // work while order count stayed under 80, but is the same fragile
    // pattern that caused the sales pagination bug.
    const sales = await odoo.searchRead("sale.order", [], ["amount_total", "state"], 5000);
    const total = sales.reduce((s, o) => s + Number(o.amount_total || 0), 0);

    const counts = {};
    sales.forEach((o) => {
      const label = STATE_LABELS[o.state] || o.state;
      counts[label] = (counts[label] || 0) + 1;
    });
    const ordersByStatus = Object.entries(counts).map(([status, count]) => ({ status, count }));

    return success(res, { totalRevenue: total, totalOrders: sales.length, ordersByStatus });
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