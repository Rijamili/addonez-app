const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

// GET /api/accounts  →  KPI tiles + the 5-report menu for the Accounts screen
exports.getAccountsSummary = async (req, res) => {
  try {
    const base = [["state", "=", "posted"]];

    const [sales, purchases] = await Promise.all([
      odoo.searchRead(
        "account.move",
        [...base, ["move_type", "=", "out_invoice"]],
        ["amount_total"],
        1000
      ),
      odoo.searchRead(
        "account.move",
        [...base, ["move_type", "=", "in_invoice"]],
        ["amount_total"],
        1000
      ),
    ]);

    const totalRevenue  = sales.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const totalExpenses = purchases.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const netProfit      = totalRevenue - totalExpenses;

    return success(res, {
      kpis: {
        netProfit,
        totalRevenue,
        totalExpenses,
        cashBalance: netProfit,
      },
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

    const [sales, purchases] = await Promise.all([
      odoo.searchRead(
        "account.move",
        [...base, ["move_type", "=", "out_invoice"]],
        ["amount_total", "amount_untaxed", "invoice_date"],
        1000
      ),
      odoo.searchRead(
        "account.move",
        [...base, ["move_type", "=", "in_invoice"]],
        ["amount_total", "invoice_date", "partner_id"],
        1000
      ),
    ]);

    const salesRevenue   = sales.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const otherIncome    = 0;
    const totalIncome    = salesRevenue + otherIncome;

    const costOfGoods    = purchases.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const salaries       = 0;
    const rentUtilities  = 0;
    const otherExpenses  = 0;
    const totalExpenses  = costOfGoods + salaries + rentUtilities + otherExpenses;

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
// Groups every posted journal-item by the parent account's account_type
// into assets / liabilities / equity. Works on Odoo 17+ (account_type field).
exports.getBalanceSheet = async (req, res) => {
  try {
    const accounts = await odoo.searchRead(
      "account.account",
      [],
      ["id", "name", "account_type"],
      2000
    );
    const typeById = {};
    accounts.forEach((a) => { typeById[a.id] = a.account_type; });

    const lines = await odoo.searchRead(
      "account.move.line",
      [["parent_state", "=", "posted"]],
      ["account_id", "balance"],
      5000
    );

    const buckets = {
      assets:      { types: ["asset_cash", "asset_receivable", "asset_current", "asset_non_current", "asset_fixed", "asset_prepayments"], total: 0 },
      liabilities: { types: ["liability_payable", "liability_current", "liability_non_current", "liability_credit_card"], total: 0 },
      equity:      { types: ["equity", "equity_unaffected"], total: 0 },
    };

    lines.forEach((line) => {
      const accId = line.account_id?.[0];
      const type  = typeById[accId];
      if (!type) return;
      const amount = Number(line.balance || 0);
      for (const key of Object.keys(buckets)) {
        if (buckets[key].types.includes(type)) {
          buckets[key].total += amount;
        }
      }
    });

    const cashAndBank = lines.reduce((sum, line) => {
      const type = typeById[line.account_id?.[0]];
      return type === "asset_cash" ? sum + Number(line.balance || 0) : sum;
    }, 0);

    const receivable = buckets.assets.total - cashAndBank;

    return success(res, {
      asOf: new Date().toISOString().slice(0, 10),
      assets: {
        lines: [
          { label: "Cash and bank",        amount: cashAndBank },
          { label: "Accounts receivable",  amount: receivable },
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
      odoo.searchRead(
        "account.move",
        [...base, ["move_type", "=", "out_invoice"], ["payment_state", "in", ["paid", "in_payment"]]],
        ["amount_total"],
        1000
      ),
      odoo.searchRead(
        "account.move",
        [...base, ["move_type", "=", "in_invoice"], ["payment_state", "in", ["paid", "in_payment"]]],
        ["amount_total"],
        1000
      ),
    ]);

    const cashFromSales     = sales.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const cashPaidSuppliers = purchases.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const operating         = cashFromSales - cashPaidSuppliers;

    const investing = 0;
    const financing = 0;
    const netChange = operating + investing + financing;

    return success(res, {
      period: req.query.period || "month",
      operating: {
        lines: [
          { label: "Cash from sales",          amount: cashFromSales },
          { label: "Cash paid to suppliers",   amount: -cashPaidSuppliers },
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
//   no account_id  → returns the list of accounts to pick from
//   with account_id → returns that account's transactions + running balance
exports.getGeneralLedger = async (req, res) => {
  try {
    const { account_id } = req.query;

    if (!account_id) {
      const accounts = await odoo.searchRead(
        "account.account",
        [],
        ["id", "name", "code", "account_type"],
        500
      );
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
        date:        line.date,
        voucher:     line.move_name,
        description: line.name,
        debit:       Number(line.debit || 0),
        credit:      Number(line.credit || 0),
        balance:     running,
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
      ["date", "move_name", "partner_id", "name", "debit", "credit", "move_id"],
      500
    );

    const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);

    return success(res, {
      date,
      transactions: lines.map((l) => ({
        voucher:     l.move_name,
        party:       l.partner_id?.[1] || "",
        description: l.name,
        debit:       Number(l.debit  || 0),
        credit:      Number(l.credit || 0),
      })),
      totalDebit,
      totalCredit,
    });
  } catch (err) {
    return error(res, err.message);
  }
};