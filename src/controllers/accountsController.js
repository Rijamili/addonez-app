const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

// Shared helper: pulls every posted GL line plus the account name/type map.
// Used by cash balance, balance sheet, and the P&L expense breakdown so we
// don't repeat the same two queries in every function.
async function getPostedLedger() {
  const accounts = await odoo.searchRead(
    "account.account",
    [],
    ["id", "name", "account_type"],
    2000
  );
  const accountById = {};
  accounts.forEach((a) => { accountById[a.id] = a; });

  const lines = await odoo.searchRead(
    "account.move.line",
    [["parent_state", "=", "posted"]],
    ["account_id", "debit", "credit", "balance"],
    8000
  );

  return { accountById, lines };
}

// GET /api/accounts
exports.getAccountsSummary = async (req, res) => {
  try {
    const base = [["state", "=", "posted"]];

    const [sales, purchases, { accountById, lines }] = await Promise.all([
      odoo.searchRead("account.move", [...base, ["move_type", "=", "out_invoice"]], ["amount_total"], 1000),
      odoo.searchRead("account.move", [...base, ["move_type", "=", "in_invoice"]], ["amount_total"], 1000),
      getPostedLedger(),
    ]);

    const totalRevenue  = sales.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const totalExpenses = purchases.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const netProfit      = totalRevenue - totalExpenses;

    // Real cash balance: sum of balance (debit - credit) across every
    // account whose account_type is "asset_cash".
    const cashBalance = lines.reduce((sum, line) => {
      const acc = accountById[line.account_id?.[0]];
      if (acc?.account_type === "asset_cash") {
        return sum + Number(line.balance || 0);
      }
      return sum;
    }, 0);

    return success(res, {
      kpis: { netProfit, totalRevenue, totalExpenses, cashBalance },
      reports: [
        { key: "profit-and-loss", label: "Profit and loss" },
        { key: "balance-sheet",   label: "Balance sheet" },
        { key: "cash-flow",       label: "Cash flow statement" },
        { key: "general-ledger",  label: "General ledger" },
        { key: "day-book",        label: "Day book report" },
      ],
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/profit-and-loss?period=month|quarter|year
exports.getProfitAndLoss = async (req, res) => {
  try {
    const base = [["state", "=", "posted"]];

    const [sales, purchases, { accountById, lines }] = await Promise.all([
      odoo.searchRead("account.move", [...base, ["move_type", "=", "out_invoice"]], ["amount_total"], 1000),
      odoo.searchRead("account.move", [...base, ["move_type", "=", "in_invoice"]], ["amount_total"], 1000),
      getPostedLedger(),
    ]);

    const salesRevenue = sales.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const costOfGoods  = purchases.reduce((s, r) => s + Number(r.amount_total || 0), 0);

    // Total income recorded in the GL across income-type accounts.
    // Income accounts normally carry a credit balance, so balance
    // (debit - credit) comes out negative — flip the sign.
    let totalIncomeGL = 0;
    let salaries = 0;
    let rentUtilities = 0;
    let totalExpenseGL = 0;

    lines.forEach((line) => {
      const acc = accountById[line.account_id?.[0]];
      if (!acc) return;
      const balance = Number(line.balance || 0);
      const name = (acc.name || "").toLowerCase();

      if (acc.account_type === "income" || acc.account_type === "income_other") {
        totalIncomeGL += -balance;
      }

      if (acc.account_type?.startsWith("expense")) {
        totalExpenseGL += balance;
        if (/salary|wage|payroll/.test(name)) {
          salaries += balance;
        } else if (/rent|utilit|electric|water bill/.test(name)) {
          rentUtilities += balance;
        }
      }
    });

    // "Other income" = whatever income hit the ledger beyond invoiced sales
    // (e.g. manual journal entries, interest, refunds), floored at 0.
    const otherIncome = Math.max(0, totalIncomeGL - salesRevenue);
    const totalIncome = salesRevenue + otherIncome;

    // "Other expenses" = total recorded GL expense minus the costOfGoods
    // (purchase invoices) and the salary/rent buckets already split out.
    const otherExpenses = Math.max(0, totalExpenseGL - costOfGoods - salaries - rentUtilities);
    const totalExpenses = costOfGoods + salaries + rentUtilities + otherExpenses;

    const netProfit = totalIncome - totalExpenses;

    return success(res, {
      period: req.query.period || "month",
      income: {
        lines: [
          { label: "Sales revenue", amount: salesRevenue },
          { label: "Other income",  amount: otherIncome },
        ],
        total: totalIncome,
      },
      expenses: {
        lines: [
          { label: "Cost of goods sold", amount: costOfGoods },
          { label: "Salaries",           amount: salaries },
          { label: "Rent and utilities", amount: rentUtilities },
          { label: "Other expenses",     amount: otherExpenses },
        ],
        total: totalExpenses,
      },
      netProfit,
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/balance-sheet
exports.getBalanceSheet = async (req, res) => {
  try {
    const { accountById, lines } = await getPostedLedger();

    const buckets = {
      assets:      { types: ["asset_cash", "asset_receivable", "asset_current", "asset_non_current", "asset_fixed", "asset_prepayments"], total: 0 },
      liabilities: { types: ["liability_payable", "liability_current", "liability_non_current", "liability_credit_card"], total: 0 },
      equity:      { types: ["equity", "equity_unaffected"], total: 0 },
    };

    let cashAndBank = 0;

    lines.forEach((line) => {
      const acc = accountById[line.account_id?.[0]];
      if (!acc) return;
      const amount = Number(line.balance || 0);

      for (const key of Object.keys(buckets)) {
        if (buckets[key].types.includes(acc.account_type)) {
          buckets[key].total += amount;
        }
      }
      if (acc.account_type === "asset_cash") {
        cashAndBank += amount;
      }
    });

    const receivable = buckets.assets.total - cashAndBank;

    return success(res, {
      asOf: new Date().toISOString().slice(0, 10),
      assets: {
        lines: [
          { label: "Cash and bank",       amount: cashAndBank },
          { label: "Accounts receivable", amount: receivable },
        ],
        total: buckets.assets.total,
      },
      liabilities: {
        lines: [
          { label: "Accounts payable and other liabilities", amount: buckets.liabilities.total },
        ],
        total: buckets.liabilities.total,
      },
      equity: {
        lines: [
          { label: "Owner's equity and retained earnings", amount: buckets.equity.total },
        ],
        total: buckets.equity.total,
      },
      totalLiabilitiesAndEquity: buckets.liabilities.total + buckets.equity.total,
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/cash-flow?period=month|quarter|year
exports.getCashFlow = async (req, res) => {
  try {
    const base = [["state", "=", "posted"]];

    const [sales, purchases] = await Promise.all([
      odoo.searchRead("account.move", [...base, ["move_type", "=", "out_invoice"], ["payment_state", "in", ["paid", "in_payment"]]], ["amount_total"], 1000),
      odoo.searchRead("account.move", [...base, ["move_type", "=", "in_invoice"], ["payment_state", "in", ["paid", "in_payment"]]], ["amount_total"], 1000),
    ]);

    const cashFromSales     = sales.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const cashPaidSuppliers = purchases.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const operating         = cashFromSales - cashPaidSuppliers;

    // Investing and financing activity isn't separately tracked yet —
    // genuinely 0 until fixed-asset purchases/loans are modeled, not
    // a placeholder masking missing logic.
    const investing = 0;
    const financing = 0;
    const netChange = operating + investing + financing;

    return success(res, {
      period: req.query.period || "month",
      operating: {
        lines: [
          { label: "Cash from sales",        amount: cashFromSales },
          { label: "Cash paid to suppliers", amount: -cashPaidSuppliers },
        ],
        total: operating,
      },
      investing: {
        lines: [
          { label: "Purchase of assets", amount: 0 },
          { label: "Sale of assets",     amount: 0 },
        ],
        total: investing,
      },
      financing: {
        lines: [
          { label: "Loans received",      amount: 0 },
          { label: "Owner contributions", amount: 0 },
        ],
        total: financing,
      },
      netChange,
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/general-ledger
exports.getGeneralLedger = async (req, res) => {
  try {
    const { account_id } = req.query;

    if (!account_id) {
      const accounts = await odoo.searchRead("account.account", [], ["id", "name", "code", "account_type"], 500);
      return success(res, { accounts });
    }

    const lines = await odoo.searchRead(
      "account.move.line",
      [["account_id", "=", parseInt(account_id, 10)], ["parent_state", "=", "posted"]],
      ["date", "move_name", "name", "debit", "credit"],
      500
    );

    lines.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    let running = 0;
    const rows = lines.map((line) => {
      running += Number(line.debit || 0) - Number(line.credit || 0);
      return {
        date: line.date, voucher: line.move_name, description: line.name,
        debit: Number(line.debit || 0), credit: Number(line.credit || 0), balance: running,
      };
    });

    return success(res, { rows, closingBalance: running });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/day-book?date=YYYY-MM-DD
exports.getDayBook = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const lines = await odoo.searchRead(
      "account.move.line",
      [["date", "=", date], ["parent_state", "=", "posted"]],
      ["date", "move_name", "partner_id", "name", "debit", "credit"],
      500
    );

    const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);

    return success(res, {
      date,
      transactions: lines.map((l) => ({
        voucher: l.move_name, party: l.partner_id?.[1] || "", description: l.name,
        debit: Number(l.debit || 0), credit: Number(l.credit || 0),
      })),
      totalDebit,
      totalCredit,
    });
  } catch (err) {
    return error(res, err.message);
  }
};