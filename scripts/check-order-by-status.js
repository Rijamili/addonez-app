// Verifies the new "Orders by Status" breakdown (used in the Analytics
// screen's pie chart) against raw Odoo sale.order data.
//
// Run from the backend folder:
//   node scripts/check-orders-by-status.js

require("dotenv").config();
const odoo = require("../src/config/OdooService");

const STATE_LABELS = {
  draft: "Quotation",
  sent:  "Quotation Sent",
  sale:  "Confirmed",
  done:  "Locked",
  cancel: "Cancelled",
};

async function main() {
  console.log("Connecting to Odoo using existing app config...\n");
  await odoo.getAdminUid();

  const sales = await odoo.searchRead("sale.order", [], ["name", "state", "amount_total"], 5000);

  const counts = {};
  sales.forEach((o) => {
    const label = STATE_LABELS[o.state] || o.state;
    counts[label] = (counts[label] || 0) + 1;
  });

  console.log("=== Orders by status ===");
  Object.entries(counts).forEach(([status, count]) => console.log(`${status}: ${count}`));
  console.log(`\nTotal orders: ${sales.length}`);
  console.log(`Sum of status counts: ${Object.values(counts).reduce((a, b) => a + b, 0)} (should match total above)`);

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});