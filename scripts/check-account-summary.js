// Verifies the "Accounts full report" screen's Cash Balance figure,
// which sums account.move.line balances for asset_cash-type accounts.
//
// Run from the backend folder:
//   node scripts/check-accounts-summary.js

require("dotenv").config();
const odoo = require("../src/config/OdooService");

async function main() {
  console.log("Connecting to Odoo using existing app config...\n");
  await odoo.getAdminUid();

  const accounts = await odoo.searchRead("account.account", [], ["id", "name", "account_type"], 2000);
  const accountById = {};
  accounts.forEach((a) => { accountById[a.id] = a; });

  const cashAccountIds = accounts.filter((a) => a.account_type === "asset_cash").map((a) => a.id);
  console.log("=== Cash/bank accounts found ===");
  accounts.filter((a) => a.account_type === "asset_cash").forEach((a) => console.log(`  ${a.id}: ${a.name}`));

  const lines = await odoo.searchRead(
    "account.move.line",
    [["parent_state", "=", "posted"]],
    ["account_id", "debit", "credit", "balance"],
    8000
  );

  let cashBalance = 0;
  const perAccount = {};
  lines.forEach((line) => {
    const acc = accountById[line.account_id?.[0]];
    if (acc?.account_type === "asset_cash") {
      cashBalance += Number(line.balance || 0);
      perAccount[acc.name] = (perAccount[acc.name] || 0) + Number(line.balance || 0);
    }
  });

  console.log("\n=== Balance per cash/bank account ===");
  Object.entries(perAccount).forEach(([name, bal]) => console.log(`  ${name}: ₹${bal.toFixed(2)}`));

  console.log(`\nTotal Cash Balance (should match app): ₹${cashBalance.toFixed(2)}`);

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});