const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getDashboard = async (req, res) => {
  try {
    // Revenue must reflect posted invoices only — not draft sale orders.
    // Filtering on state = "posted" also means a later cancellation
    // (state -> "cancel") drops the invoice out of this sum automatically.
    const postedInvoiceDomain = [["move_type", "=", "out_invoice"], ["state", "=", "posted"]];

    const [orders, quotations, postedInvoices, invoices, projects, tasks] = await Promise.all([
      odoo.searchCount("sale.order",      [["state", "in", ["sale", "done"]]]),
      odoo.searchCount("sale.order",      [["state", "=", "draft"]]),
      // Explicit limit — searchRead defaults to 80 records, which would
      // silently under-count revenue once there are more posted invoices than that.
      odoo.searchRead( "account.move",    postedInvoiceDomain, ["amount_total"], 10000),
      odoo.searchCount("account.move",    postedInvoiceDomain),
      odoo.searchCount("project.project", []),
      odoo.searchCount("project.task",    [["stage_id.fold", "=", false]]),
    ]);

    const totalRevenue = postedInvoices.reduce((s, o) => s + (o.amount_total || 0), 0);

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