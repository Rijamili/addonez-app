const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

// Shared helper: pulls every posted GL line plus the account name/type map.
// Used by cash balance, balance sheet, and the P&L expense breakdown so we
// don't repeat the same two queries in every function.
async function getPostedLedger(startDate) {
  const accounts = await odoo.searchRead(
    "account.account",
    [],
    ["id", "name", "code", "account_type"],
    2000
  );
  const accountById = {};
  accounts.forEach((a) => { accountById[a.id] = a; });

  const domain = [["parent_state", "=", "posted"]];
  if (startDate) {
    domain.push(["date", ">=", startDate]);
  }

  const lines = await odoo.searchRead(
    "account.move.line",
    domain,
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
        { key: "profit-and-loss",       label: "Profit and loss" },
        { key: "balance-sheet",         label: "Balance sheet" },
        { key: "cash-flow",             label: "Cash flow statement" },
        { key: "general-ledger",        label: "General ledger" },
        { key: "day-book",              label: "Day book report" },
        { key: "trial-balance",         label: "Trial balance" },
        { key: "aged-partner-balance",  label: "Aged partner balance" },
        { key: "partner-ledger",        label: "Partner ledger" },
        { key: "tax-report",            label: "Tax report" },
        { key: "audit-trail",           label: "Audit trail" },
      ],
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/profit-and-loss?period=month|quarter|year
exports.getProfitAndLoss = async (req, res) => {
  try {
    const period = req.query.period || "month";
    const today = new Date();

    let startDate;
    if (period === "year") {
      startDate = new Date(today.getFullYear(), 0, 1);
    } else if (period === "quarter") {
      const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
      startDate = new Date(today.getFullYear(), quarterStartMonth, 1);
    } else {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    const startDateStr = startDate.toISOString().slice(0, 10);

    const base = [["state", "=", "posted"], ["invoice_date", ">=", startDateStr]];

    const [sales, purchases, { accountById, lines }] = await Promise.all([
      odoo.searchRead("account.move", [...base, ["move_type", "=", "out_invoice"]], ["amount_total", "invoice_date"], 1000),
      odoo.searchRead("account.move", [...base, ["move_type", "=", "in_invoice"]], ["amount_total", "invoice_date"], 1000),
      getPostedLedger(startDateStr),
    ]);

    const salesRevenue = sales.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const costOfGoods  = purchases.reduce((s, r) => s + Number(r.amount_total || 0), 0);

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

    const otherIncome = Math.max(0, totalIncomeGL - salesRevenue);
    const totalIncome = salesRevenue + otherIncome;

    const otherExpenses = Math.max(0, totalExpenseGL - costOfGoods - salaries - rentUtilities);
    const totalExpenses = costOfGoods + salaries + rentUtilities + otherExpenses;

    const netProfit = totalIncome - totalExpenses;

    return success(res, {
      period,
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
// GET /api/accounts/cash-flow?period=month|quarter|year
exports.getCashFlow = async (req, res) => {
  try {
    const period = req.query.period || "month";
    const today = new Date();

    let startDate;
    if (period === "year") {
      startDate = new Date(today.getFullYear(), 0, 1);
    } else if (period === "quarter") {
      const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
      startDate = new Date(today.getFullYear(), quarterStartMonth, 1);
    } else {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    const startDateStr = startDate.toISOString().slice(0, 10);

    const base = [["state", "=", "posted"], ["invoice_date", ">=", startDateStr]];

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
      period,
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

// GET /api/accounts/trial-balance?startDate=YYYY-MM-DD
// Every posted account, its total debit and credit movement, and the net
// closing balance. Unlike the balance-sheet buckets, this needs debit and
// credit summed separately per account (not just the net), so it queries
// account.move.line directly rather than reusing getPostedLedger's net-only
// balance field.
exports.getTrialBalance = async (req, res) => {
  try {
    const { startDate } = req.query;

    const accounts = await odoo.searchRead(
      "account.account", [], ["id", "name", "code", "account_type"], 2000
    );
    const accountById = {};
    accounts.forEach((a) => { accountById[a.id] = a; });

    const domain = [["parent_state", "=", "posted"]];
    if (startDate) domain.push(["date", ">=", startDate]);

    const lines = await odoo.searchRead(
      "account.move.line", domain, ["account_id", "debit", "credit"], 8000
    );

    const totals = {};
    lines.forEach((line) => {
      const id = line.account_id?.[0];
      if (!id) return;
      if (!totals[id]) totals[id] = { debit: 0, credit: 0 };
      totals[id].debit  += Number(line.debit  || 0);
      totals[id].credit += Number(line.credit || 0);
    });

    const rows = Object.keys(totals)
      .map((id) => {
        const acc = accountById[id];
        const { debit, credit } = totals[id];
        return {
          accountId:   Number(id),
          code:        acc?.code || "",
          name:        acc?.name || "Unknown account",
          accountType: acc?.account_type || "",
          debit,
          credit,
          balance: debit - credit,
        };
      })
      .filter((r) => r.debit !== 0 || r.credit !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));

    const totalDebit  = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

    return success(res, { rows, totalDebit, totalCredit });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/aged-partner-balance?type=receivable|payable
// Buckets every still-open invoice (or bill) by how many days past its due
// date it is, grouped by partner. "receivable" = money customers owe us
// (out_invoice/out_refund); "payable" = money we owe suppliers
// (in_invoice/in_refund).
exports.getAgedPartnerBalance = async (req, res) => {
  try {
    const type = req.query.type === "payable" ? "payable" : "receivable";
    const moveTypes = type === "payable" ? ["in_invoice", "in_refund"] : ["out_invoice", "out_refund"];

    const invoices = await odoo.searchRead(
      "account.move",
      [
        ["state", "=", "posted"],
        ["move_type", "in", moveTypes],
        ["payment_state", "not in", ["paid", "reversed"]],
        ["amount_residual", "!=", 0],
      ],
      ["partner_id", "amount_residual", "invoice_date", "invoice_date_due", "name"],
      2000
    );

    const today = new Date();
    const bucketFor = (dueDateStr) => {
      if (!dueDateStr) return "notDue";
      const due = new Date(dueDateStr);
      const daysOverdue = Math.floor((today - due) / (1000 * 60 * 60 * 24));
      if (daysOverdue <= 0)  return "notDue";
      if (daysOverdue <= 30) return "d1To30";
      if (daysOverdue <= 60) return "d31To60";
      if (daysOverdue <= 90) return "d61To90";
      return "d90Plus";
    };

    const byPartner = {};
    invoices.forEach((inv) => {
      const partnerId   = inv.partner_id?.[0] || 0;
      const partnerName = inv.partner_id?.[1] || "Unknown";
      const bucket       = bucketFor(inv.invoice_date_due || inv.invoice_date);
      const amount        = Number(inv.amount_residual || 0);

      if (!byPartner[partnerId]) {
        byPartner[partnerId] = {
          partnerId, partnerName,
          notDue: 0, d1To30: 0, d31To60: 0, d61To90: 0, d90Plus: 0, total: 0,
        };
      }
      byPartner[partnerId][bucket] += amount;
      byPartner[partnerId].total   += amount;
    });

    const rows = Object.values(byPartner).sort((a, b) => b.total - a.total);
    const totals = rows.reduce((acc, r) => {
      ["notDue", "d1To30", "d31To60", "d61To90", "d90Plus", "total"].forEach((k) => {
        acc[k] = (acc[k] || 0) + r[k];
      });
      return acc;
    }, {});

    return success(res, { type, rows, totals });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/partner-ledger?partner_id=123
// Same shape as general-ledger but scoped to one partner's receivable/
// payable lines, with a running balance — for "how much does this
// customer/supplier owe us right now, and how did we get there".
exports.getPartnerLedger = async (req, res) => {
  try {
    const { partner_id } = req.query;

    if (!partner_id) {
      const partners = await odoo.searchRead(
        "res.partner", [["customer_rank", ">", 0], "|", ["supplier_rank", ">", 0], ["customer_rank", ">", 0]],
        ["id", "name"], 500
      );
      return success(res, { partners });
    }

    const lines = await odoo.searchRead(
      "account.move.line",
      [
        ["partner_id", "=", parseInt(partner_id, 10)],
        ["parent_state", "=", "posted"],
        ["account_id.account_type", "in", ["asset_receivable", "liability_payable"]],
      ],
      ["date", "move_name", "name", "debit", "credit"],
      1000
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

    return success(res, { partnerId: Number(partner_id), rows, closingBalance: running });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/tax-report?period=month|quarter|year
// Groups posted tax lines by tax name, split into output tax (charged to
// customers on sales) and input tax (paid to suppliers on purchases), so
// net tax due = output - input.
exports.getTaxReport = async (req, res) => {
  try {
    const period = req.query.period || "month";
    const today = new Date();

    let startDate;
    if (period === "year") {
      startDate = new Date(today.getFullYear(), 0, 1);
    } else if (period === "quarter") {
      const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
      startDate = new Date(today.getFullYear(), quarterStartMonth, 1);
    } else {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }
    const startDateStr = startDate.toISOString().slice(0, 10);

    const taxLines = await odoo.searchRead(
      "account.move.line",
      [
        ["parent_state", "=", "posted"],
        ["date", ">=", startDateStr],
        ["tax_line_id", "!=", false],
      ],
      ["tax_line_id", "debit", "credit", "move_id"],
      4000
    );

    if (taxLines.length === 0) {
      return success(res, { period, outputTax: [], inputTax: [], totalOutputTax: 0, totalInputTax: 0, netTaxDue: 0 });
    }

    const moveIds = [...new Set(taxLines.map((l) => l.move_id?.[0]).filter(Boolean))];
    const moves = await odoo.searchRead("account.move", [["id", "in", moveIds]], ["id", "move_type"], moveIds.length);
    const moveTypeById = {};
    moves.forEach((m) => { moveTypeById[m.id] = m.move_type; });

    const outputTax = {}; // charged on sales (out_invoice/out_refund)
    const inputTax  = {}; // paid on purchases (in_invoice/in_refund)

    taxLines.forEach((line) => {
      const taxName = line.tax_line_id?.[1] || "Unknown tax";
      const moveId  = line.move_id?.[0];
      const moveType = moveTypeById[moveId] || "";
      const amount = Number(line.credit || 0) - Number(line.debit || 0);

      const bucket = moveType.startsWith("out_") ? outputTax : inputTax;
      bucket[taxName] = (bucket[taxName] || 0) + Math.abs(amount);
    });

    const toRows = (obj) => Object.entries(obj).map(([label, amount]) => ({ label, amount }));
    const outputRows = toRows(outputTax);
    const inputRows  = toRows(inputTax);

    const totalOutputTax = outputRows.reduce((s, r) => s + r.amount, 0);
    const totalInputTax  = inputRows.reduce((s, r) => s + r.amount, 0);

    return success(res, {
      period,
      outputTax: outputRows,
      inputTax: inputRows,
      totalOutputTax,
      totalInputTax,
      netTaxDue: totalOutputTax - totalInputTax,
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/audit-trail?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// Chronological log of journal entries showing who created/last touched
// each one, using Odoo's built-in create/write metadata fields (available
// on every model) rather than a separate audit-log module.
exports.getAuditTrail = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const domain = [];
    if (startDate) domain.push(["create_date", ">=", startDate]);
    if (endDate)   domain.push(["create_date", "<=", `${endDate} 23:59:59`]);

    const moves = await odoo.searchRead(
      "account.move",
      domain,
      ["name", "move_type", "state", "amount_total", "create_uid", "create_date", "write_uid", "write_date"],
      300
    );

    moves.sort((a, b) => (b.create_date || "").localeCompare(a.create_date || ""));

    const rows = moves.map((m) => ({
      reference:       m.name,
      type:            m.move_type,
      state:           m.state,
      amount:          Number(m.amount_total || 0),
      createdBy:       m.create_uid?.[1] || "",
      createdAt:       m.create_date,
      lastModifiedBy:  m.write_uid?.[1] || "",
      lastModifiedAt:  m.write_date,
    }));

    return success(res, { rows });
  } catch (err) {
    return error(res, err.message);
  }
};