// One-off diagnostic script. Reuses the app's existing Odoo connection
// (same credentials your backend already uses) so you don't need to log
// into Odoo yourself.
//
// Run from the backend folder:
//   node scripts/check-cashflow-data.js

require("dotenv").config(); // load the same .env your server.js loads
const odoo = require("../src/config/OdooService");

async function main() {
  console.log("Connecting to Odoo using existing app config...\n");

  const invoices = await odoo.searchRead(
    "account.move",
    [["state", "=", "posted"], ["move_type", "=", "out_invoice"]],
    ["name", "partner_id", "invoice_date", "amount_total", "amount_residual", "payment_state"],
    50
  );

  console.log("=== Customer invoices (posted) ===");
  invoices.forEach((inv) => {
    console.log(
      `${inv.name} | ${inv.invoice_date} | partner: ${inv.partner_id?.[1]} | ` +
      `total: ${inv.amount_total} | amount due: ${inv.amount_residual} | payment_state: ${inv.payment_state}`
    );
  });

  const payments = await odoo.searchRead(
    "account.payment",
    [["state", "=", "posted"]],
    ["name", "date", "partner_id", "partner_type", "payment_type", "amount"],
    50
  );

  console.log("\n=== Payments (posted) ===");
  payments.forEach((p) => {
    console.log(
      `${p.name} | ${p.date} | ${p.partner_type} | ${p.payment_type} | ` +
      `partner: ${p.partner_id?.[1]} | amount: ${p.amount}`
    );
  });

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});