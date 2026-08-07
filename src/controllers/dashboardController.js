const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");
const { isOwnDataOnly } = require("../config/dataScope");
const { getInstalledModules } = require("../config/moduleAccessService");
exports.getDashboard = async (req, res) => {
  try {
    const { uid } = req.user;
    const ownScope = isOwnDataOnly(req);
    const installedModules = await getInstalledModules(req.tenant?.id);

const hasProject =
  installedModules.includes("project") ||
  installedModules.includes("project_enterprise");

    // Revenue must reflect posted invoices only — not draft sale orders.
    // Filtering on state = "posted" also means a later cancellation
    // (state -> "cancel") drops the invoice out of this sum automatically.
    const postedInvoiceDomain = [["move_type", "=", "out_invoice"], ["state", "=", "posted"]];
    // Employee tier sees only THEIR OWN numbers here — previously this
    // endpoint had no per-user scoping at all, so any logged-in
    // employee saw the whole company's revenue/order counts on login.
    const orderDomain = ownScope ? [["state", "in", ["sale", "done"]], ["user_id.id", "=", uid]] : [["state", "in", ["sale", "done"]]];
    const quoteDomain = ownScope ? [["state", "=", "draft"], ["user_id.id", "=", uid]] : [["state", "=", "draft"]];
    const invoiceDomain = ownScope ? [...postedInvoiceDomain, ["invoice_user_id", "=", uid]] : postedInvoiceDomain;
    const projectDomain = []; // narrowed below for employees, via task membership
    const taskDomain = ownScope ? [["stage_id.fold", "=", false], ["user_ids", "in", [uid]]] : [["stage_id.fold", "=", false]];

    const [orders, quotations, postedInvoices, invoices] = await Promise.all([
  odoo.searchCount("sale.order", orderDomain),
  odoo.searchCount("sale.order", quoteDomain),
  odoo.searchRead("account.move", invoiceDomain, ["amount_total"], 10000),
  odoo.searchCount("account.move", invoiceDomain),
]);

let tasks = 0;
let projects = 0;

if (hasProject) {
  const myTasksForProjects = ownScope
    ? await odoo.searchRead(
        "project.task",
        [["user_ids", "in", [uid]]],
        ["project_id"],
        2000
      )
    : null;

  tasks = await odoo.searchCount("project.task", taskDomain);

  projects = ownScope
    ? new Set(
        (myTasksForProjects || [])
          .map((t) => t.project_id?.[0])
          .filter(Boolean)
      ).size
    : await odoo.searchCount("project.project", []);
}

    const projects = ownScope
      ? new Set((myTasksForProjects || []).map((t) => t.project_id?.[0]).filter(Boolean)).size
      : await odoo.searchCount("project.project", projectDomain);

    const totalRevenue = postedInvoices.reduce((s, o) => s + (o.amount_total || 0), 0);

    return success(res, {
      orders,
      quotations,
      totalRevenue,
      invoices,
      projects,
      tasks,
      status: "Connected",
      scope: ownScope ? "personal" : "company",
    });
  } catch (err) {
    return error(res, err.message);
  }
};