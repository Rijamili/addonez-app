// Cross-checks the Dashboard screen's numbers against raw Odoo data.
// Run from the backend folder:
//   node scripts/check-dashboard-data.js

require("dotenv").config();
const odoo = require("../src/config/OdooService");

async function main() {
  console.log("Connecting to Odoo using existing app config...\n");
  await odoo.getAdminUid(); // warm up config before parallel calls

  const [confirmedCount, draftCount, allOrders, invoiceCount] = await Promise.all([
    odoo.searchCount("sale.order", [["state", "in", ["sale", "done"]]]),
    odoo.searchCount("sale.order", [["state", "=", "draft"]]),
    odoo.searchRead("sale.order", [], ["name", "amount_total", "state", "date_order"], 500),
    odoo.searchCount("account.move", [["move_type", "=", "out_invoice"], ["state", "=", "posted"]]),
  ]);

  const totalRevenue = allOrders.reduce((s, o) => s + Number(o.amount_total || 0), 0);

  console.log("=== Dashboard summary (should match app) ===");
  console.log("Confirmed orders (state sale/done):", confirmedCount);
  console.log("Quotations (state draft):          ", draftCount);
  console.log("Total revenue (ALL sale.order, any state):", totalRevenue.toFixed(2));
  console.log("Posted customer invoices:", invoiceCount);

  console.log("\n=== All sale.order records (raw) ===");
  allOrders
    .sort((a, b) => (a.date_order || "").localeCompare(b.date_order || ""))
    .forEach((o) => {
      console.log(`  ${o.name} | ${o.date_order} | state: ${o.state} | ${o.amount_total}`);
    });

  console.log("\n=== Monthly totals (merged across ALL years, matches app's chart logic) ===");
  const months = { Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:0,Jul:0,Aug:0,Sep:0,Oct:0,Nov:0,Dec:0 };
  allOrders.forEach((o) => {
    const m = new Date(o.date_order).toLocaleString("en-US", { month: "short" });
    if (months[m] !== undefined) months[m] += Number(o.amount_total || 0);
  });
  Object.entries(months).forEach(([m, amt]) => console.log(`  ${m}: ${amt.toFixed(2)}`));

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});