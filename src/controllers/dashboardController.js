const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");
const { isOwnDataOnly } = require("../config/dataScope");

exports.getDashboard = async (req, res) => {
  try {
    const { uid } = req.user;
    const ownScope = isOwnDataOnly(req);
    // TEMPORARY DEBUG TEST
const testOrders = await odoo.searchRead(
  "sale.order",
  [],
  ["id", "name", "state", "amount_total", "company_id"],
  10
);

console.log("========== SALE ORDER TEST ==========");
console.log(JSON.stringify(testOrders, null, 2));
console.log("=====================================");

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

    // Each metric is independently resilient — a tenant that doesn't
    // have the Projects app installed (common on a fresh tenant, e.g.
    // "Object project.task doesn't exist") should just show 0 for
    // Projects/Tasks, not take down Revenue/Orders/Invoices too. Same
    // logic applies if Sales or Accounting isn't installed either —
    // this dashboard should show whatever IS available.
    // const safe = (promise, fallback) => promise.catch((err) => {
    //   console.warn("dashboard: metric failed, degrading to fallback:", err.message);
    //   return fallback;
    // });

    const safe = (promise, fallback, metric) => promise.catch((err) => {
  console.error(`❌ DASHBOARD METRIC FAILED: ${metric}`);
  console.error("Error:", err.message);
  return fallback;
});

    const [orders, quotations, postedInvoices, invoices, myTasksForProjects, tasks] = await Promise.all([
      // safe(odoo.searchCount("sale.order", orderDomain), 0),
      // safe(odoo.searchCount("sale.order", quoteDomain), 0),
      // // Explicit limit — searchRead defaults to 80 records, which would
      // // silently under-count revenue once there are more posted invoices than that.
      // safe(odoo.searchRead("account.move", invoiceDomain, ["amount_total"], 10000), []),
      // safe(odoo.searchCount("account.move", invoiceDomain), 0),
      // ownScope ? safe(odoo.searchRead("project.task", [["user_ids", "in", [uid]]], ["project_id"], 2000), []) : Promise.resolve(null),
      // safe(odoo.searchCount("project.task", taskDomain), 0),
      safe(odoo.searchCount("sale.order", orderDomain), 0, "orders"),
safe(odoo.searchCount("sale.order", quoteDomain), 0, "quotations"),
safe(
  odoo.searchRead(
    "account.move",
    invoiceDomain,
    ["amount_total"],
    10000
  ),
  [],
  "posted invoices"
),
safe(odoo.searchCount("account.move", invoiceDomain), 0, "invoices"),
ownScope
  ? safe(
      odoo.searchRead(
        "project.task",
        [["user_ids", "in", [uid]]],
        ["project_id"],
        2000
      ),
      [],
      "my project tasks"
    )
  : Promise.resolve(null),
safe(odoo.searchCount("project.task", taskDomain), 0, "tasks"),
    ]);

    const projects = ownScope
      ? new Set((myTasksForProjects || []).map((t) => t.project_id?.[0]).filter(Boolean)).size
      : await safe(
    odoo.searchCount("project.project", projectDomain),
    0,
    "projects"
  );

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