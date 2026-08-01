const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");
const { isOwnDataOnly } = require("../config/dataScope");

exports.getAnalytics = async (req, res) => {
  const { uid } = req.user;
  const ownScope = isOwnDataOnly(req);
  try {
    const invoiceDomain = ownScope
      ? [["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["invoice_user_id", "=", uid]]
      : [["move_type", "=", "out_invoice"], ["state", "=", "posted"]];
    const invoices = await odoo.searchRead(
      "account.move",
      invoiceDomain,
      ["amount_total"],
      10000
    );
    const total = invoices.reduce((s, o) => s + Number(o.amount_total || 0), 0);

    // Orders by status — for the "Orders by Status" pie chart. sale.order
    // states map to human labels the client already knows how to color:
    // draft -> Quotation, sent -> Quotation Sent, sale -> Confirmed,
    // done -> Locked, cancel -> Cancelled.
    const STATUS_LABELS = {
      draft:  "Quotation",
      sent:   "Quotation Sent",
      sale:   "Confirmed",
      done:   "Locked",
      cancel: "Cancelled",
    };

    const orderDomain = ownScope ? [["user_id.id", "=", uid]] : [];
    const orders = await odoo.searchRead("sale.order", orderDomain, ["state"], 10000);
    const counts = {};
    orders.forEach((o) => {
      const label = STATUS_LABELS[o.state] || o.state;
      counts[label] = (counts[label] || 0) + 1;
    });
    const ordersByStatus = Object.entries(counts).map(([status, count]) => ({ status, count }));

    return success(res, {
      totalRevenue: total,
      totalOrders: invoices.length,
      ordersByStatus,
    });
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getPredictions = async (req, res) => {
  const { uid } = req.user;
  const ownScope = isOwnDataOnly(req);
  try {
    const domain = ownScope
      ? [["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["invoice_user_id", "=", uid]]
      : [["move_type", "=", "out_invoice"], ["state", "=", "posted"]];
    const invoices = await odoo.searchRead(
      "account.move",
      domain,
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