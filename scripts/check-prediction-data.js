// Verifies the Predictions screen's "Current Revenue" / "Current Orders"
// against the true total for a given salesperson, to confirm the
// limit=50 truncation bug (same pattern as the earlier sales bug).
//
// Run from the backend folder:
//   node scripts/check-predictions-data.js

require("dotenv").config();
const odoo = require("../src/config/OdooService");

async function main() {
  console.log("Connecting to Odoo using existing app config...\n");
  await odoo.getAdminUid();

  const allOrders = await odoo.searchRead(
    "sale.order", [], ["name", "amount_total", "user_id"], 5000
  );

  const bySalesperson = {};
  allOrders.forEach((o) => {
    const person = o.user_id?.[1] || "Unassigned";
    if (!bySalesperson[person]) bySalesperson[person] = [];
    bySalesperson[person].push(o);
  });

  console.log("=== Predictions base numbers, per salesperson ===\n");
  Object.entries(bySalesperson).forEach(([person, orders]) => {
    const trueTotal = orders.reduce((s, o) => s + Number(o.amount_total || 0), 0);
    const first50 = orders.slice(0, 50);
    const oldBuggyTotal = first50.reduce((s, o) => s + Number(o.amount_total || 0), 0);

    console.log(`${person}: ${orders.length} orders`);
    console.log(`  True currentRevenue (fixed):     ₹${trueTotal.toFixed(2)}`);
    console.log(`  True currentOrders (fixed):      ${orders.length}`);
    console.log(`  Old buggy currentRevenue (limit 50): ₹${oldBuggyTotal.toFixed(2)}`);
    console.log(`  Old buggy currentOrders (limit 50):  ${first50.length}`);
    if (orders.length > 50) {
      console.log(`  ⚠️  Was truncated — missing ₹${(trueTotal - oldBuggyTotal).toFixed(2)} from ${orders.length - 50} order(s)`);
    }
    console.log(`  predictedRevenue (fixed): ₹${(trueTotal * 1.12).toFixed(2)}`);
    console.log(`  predictedOrders (fixed):  ${Math.round(orders.length * 1.18)}`);
    console.log("");
  });

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});