// Checks whether the Sales screen's "Total Sales" figure is actually
// correct, or silently truncated by the /sales endpoint's default
// limit=20 pagination.
//
// Run from the backend folder:
//   node scripts/check-sales-pagination-bug.js

require("dotenv").config();
const odoo = require("../src/config/OdooService");

async function main() {
  console.log("Connecting to Odoo using existing app config...\n");
  await odoo.getAdminUid();

  const allOrders = await odoo.searchRead(
    "sale.order", [], ["name", "amount_total", "user_id"], 1000
  );

  const bySalesperson = {};
  allOrders.forEach((o) => {
    const person = o.user_id?.[1] || "Unassigned";
    if (!bySalesperson[person]) bySalesperson[person] = [];
    bySalesperson[person].push(o);
  });

  console.log("=== Per-salesperson order counts ===\n");
  Object.entries(bySalesperson).forEach(([person, orders]) => {
    const trueTotal = orders.reduce((s, o) => s + Number(o.amount_total || 0), 0);

    // Mimic what the app actually does: only the first 20 (default order,
    // same as Odoo's default sale.order sort — usually id desc)
    const first20 = orders.slice(0, 20);
    const appTotal = first20.reduce((s, o) => s + Number(o.amount_total || 0), 0);

    const flag = orders.length > 20 ? "  ⚠️  MORE THAN 20 ORDERS — app's Total Sales will be WRONG for this user" : "";
    console.log(`${person}: ${orders.length} orders${flag}`);
    console.log(`  True total (all orders):        ₹${trueTotal.toFixed(2)}`);
    console.log(`  App's "Total Sales" (first 20):  ₹${appTotal.toFixed(2)}`);
    if (orders.length > 20) {
      console.log(`  Difference (missing from app):   ₹${(trueTotal - appTotal).toFixed(2)}`);
    }
    console.log("");
  });

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});