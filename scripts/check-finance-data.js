// Cross-checks the Finance screen's Total Inflow, Total Outflow, and
// invoice paid/pending counts against raw Odoo data.
//
// Run from the backend folder:
//   node scripts/check-finance-data.js

require("dotenv").config();
const odoo = require("../src/config/OdooService");

async function main() {
  console.log("Connecting to Odoo using existing app config...\n");
  await odoo.getAdminUid();

  const base = [["state", "=", "posted"]];
  const [inflows, outflows] = await Promise.all([
    odoo.searchRead("account.move", [...base, ["move_type", "=", "out_invoice"]], ["name", "amount_total", "payment_state", "invoice_date"], 1000),
    odoo.searchRead("account.move", [...base, ["move_type", "=", "in_invoice"]], ["name", "amount_total", "payment_state", "invoice_date"], 1000),
  ]);

  const totalInflow  = inflows.reduce((s, r) => s + Number(r.amount_total || 0), 0);
  const totalOutflow = outflows.reduce((s, r) => s + Number(r.amount_total || 0), 0);

  const paid    = inflows.filter((i) => i.payment_state === "paid").length;
  const pending = inflows.filter((i) => i.payment_state !== "paid").length;

  console.log("=== Finance screen figures ===");
  console.log("Total Inflow (all posted customer invoices, any payment state):", totalInflow.toFixed(2));
  console.log("Total Outflow (all posted vendor bills, any payment state):    ", totalOutflow.toFixed(2));
  console.log("Net:", (totalInflow - totalOutflow).toFixed(2));
  console.log(`Invoices: ${inflows.length} total — ${paid} paid, ${pending} pending`);
  console.log(`Customer invoice count: ${inflows.length} | Vendor bill count: ${outflows.length}`);

  console.log("\n=== All vendor bills (outflow source) ===");
  outflows.forEach((b) => console.log(`  ${b.name} | ${b.invoice_date} | ${b.amount_total} | ${b.payment_state}`));

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});