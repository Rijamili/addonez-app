// Shows detailed invoice + payment data for three specific completed
// calendar periods:
//   - Last month:   June 2026
//   - Last quarter: Q2 2026 (Apr 1 - Jun 30)
//   - Last year:    2025 (Jan 1 - Dec 31)
//
// This is different from the app's rolling 30/90/365-day windows — these
// are fixed calendar periods that have already fully closed.
//
// Run from the backend folder:
//   node scripts/check-calendar-periods.js

require("dotenv").config();
const odoo = require("../src/config/OdooService");

const PERIODS = [
  { label: "Last month — June 2026",     start: "2026-06-01", end: "2026-06-30" },
  { label: "Last quarter — Q2 2026",     start: "2026-04-01", end: "2026-06-30" },
  { label: "Last year — 2025",           start: "2025-01-01", end: "2025-12-31" },
];

async function reportPeriod({ label, start, end }) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(label, `(${start} to ${end})`);
  console.log("=".repeat(60));

  const dateRange = [["date", ">=", start], ["date", "<=", end]];
  const invoiceDateRange = [["invoice_date", ">=", start], ["invoice_date", "<=", end]];

  const [customerPayments, supplierPayments, salesInvoices, purchaseInvoices] = await Promise.all([
    odoo.searchRead("account.payment", [["state", "=", "posted"], ...dateRange, ["partner_type", "=", "customer"], ["payment_type", "=", "inbound"]], ["name", "date", "partner_id", "amount"], 200),
    odoo.searchRead("account.payment", [["state", "=", "posted"], ...dateRange, ["partner_type", "=", "supplier"], ["payment_type", "=", "outbound"]], ["name", "date", "partner_id", "amount"], 200),
    odoo.searchRead("account.move", [["state", "=", "posted"], ...invoiceDateRange, ["move_type", "=", "out_invoice"]], ["name", "invoice_date", "partner_id", "amount_total", "payment_state"], 200),
    odoo.searchRead("account.move", [["state", "=", "posted"], ...invoiceDateRange, ["move_type", "=", "in_invoice"]], ["name", "invoice_date", "partner_id", "amount_total", "payment_state"], 200),
  ]);

  const sum = (rows, field) => rows.reduce((s, r) => s + Number(r[field] || 0), 0);

  console.log("\n-- Cash flow (based on account.payment) --");
  console.log("Customer payments received:");
  customerPayments.forEach((p) => console.log(`  ${p.name} | ${p.date} | ${p.partner_id?.[1]} | ${p.amount}`));
  console.log("Supplier payments made:");
  supplierPayments.forEach((p) => console.log(`  ${p.name} | ${p.date} | ${p.partner_id?.[1]} | ${p.amount}`));

  const cashFromSales = sum(customerPayments, "amount");
  const cashPaidSuppliers = sum(supplierPayments, "amount");
  console.log(`\nCash from sales:        ${cashFromSales}`);
  console.log(`Cash paid to suppliers: -${cashPaidSuppliers}`);
  console.log(`Net operating activities: ${cashFromSales - cashPaidSuppliers}`);

  console.log("\n-- P&L (based on invoice_date, accrual) --");
  console.log("Sales invoices:");
  salesInvoices.forEach((i) => console.log(`  ${i.name} | ${i.invoice_date} | ${i.partner_id?.[1]} | ${i.amount_total} | ${i.payment_state}`));
  console.log("Purchase invoices:");
  purchaseInvoices.forEach((i) => console.log(`  ${i.name} | ${i.invoice_date} | ${i.partner_id?.[1]} | ${i.amount_total} | ${i.payment_state}`));

  console.log(`\nSales revenue:    ${sum(salesInvoices, "amount_total")}`);
  console.log(`Cost of goods:    ${sum(purchaseInvoices, "amount_total")}`);
}

async function main() {
  console.log("Connecting to Odoo using existing app config...");

  // Warm up the connection with a single call first. OdooConfigService
  // caches config on first successful load, but if several queries fire
  // in parallel before that first load finishes, the later ones can read
  // a still-null config (a genuine race condition in the config loader,
  // separate from any data issue). Doing one call up front avoids it.
  await odoo.getAdminUid();

  for (const period of PERIODS) {
    await reportPeriod(period);
  }
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});