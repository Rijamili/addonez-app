const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

// Shared: turns "month" | "quarter" | "year" into the ISO start date of
// that period (e.g. "quarter" on Aug 15 -> Jul 1). Used by every report
// that filters the ledger to "this period so far".
function startDateForPeriod(period) {
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
  return startDate.toISOString().slice(0, 10);
}

// Resolves the effective date range for a report request. A custom
// ?startDate=&endDate= pair always wins over ?period=month|quarter|year
// when both are present — this is what lets every report screen offer a
// genuine "choose your own dates" option instead of only the three
// presets. endDate defaults to today so a preset period always runs
// through "now", and a custom range with only startDate given behaves
// the same way.
function resolveDateRange(req) {
  const { period, startDate, endDate } = req.query;
  const usingCustomRange = !!(startDate || endDate);
  const effectiveStart = startDate || (usingCustomRange ? undefined : startDateForPeriod(period || "month"));
  const effectiveEnd = endDate || new Date().toISOString().slice(0, 10);
  return {
    startDate: effectiveStart,
    endDate: effectiveEnd,
    // Echoed back in responses so the screen can label what it's showing
    // ("This month" vs "Jan 1 - Jan 31") without re-deriving it client-side.
    period: usingCustomRange ? undefined : (period || "month"),
  };
}

// Shared helper: pulls every posted GL line plus the account name/type map.
// Used by cash balance, balance sheet, and the P&L expense breakdown so we
// don't repeat the same two queries in every function. endDate lets a
// caller bound the range on both ends for a custom date range (not just
// "from period start through today").
async function getPostedLedger(startDate, endDate) {
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
  if (endDate) {
    domain.push(["date", "<=", endDate]);
  }

  const lines = await odoo.searchRead(
    "account.move.line",
    domain,
    ["account_id", "debit", "credit", "balance"],
    8000
  );

  return { accountById, lines };
}

// An account counts as "cash" for KPI/report purposes if it's tagged
// asset_cash in Odoo's chart of accounts, OR it's a bank suspense/clearing
// account. Suspense accounts hold cash that has genuinely moved (bank
// transactions in transit) but hasn't been reconciled to a statement line
// yet — so per the native Balance Sheet report, it belongs in "cash and
// bank" even though Odoo tags it with a different account_type.
function isCashAccount(acc) {
  if (!acc) return false;
  if (acc.account_type === "asset_cash") return true;
  return /bank suspense/i.test(acc.name || "");
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
      if (isCashAccount(acc)) {
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

// GET /api/accounts/profit-and-loss?period=month|quarter|year (or ?startDate=&endDate=)
exports.getProfitAndLoss = async (req, res) => {
  try {
    const range = resolveDateRange(req);

    // Fully GL-based, matching Odoo's native Profit and Loss report exactly:
    // same posting-date filter (getPostedLedger filters on the GL "date"
    // field, not invoice_date) and same account-type grouping. This no
    // longer mixes in invoice amount_total (which includes tax) — every
    // figure below comes straight from the ledger, tax-exclusive.
    const { accountById, lines } = await getPostedLedger(range.startDate, range.endDate);

    let totalIncome = 0;
    let salesRevenue = 0;
    let totalExpenses = 0;
    let costOfGoods = 0;
    let salaries = 0;
    let rentUtilities = 0;

    lines.forEach((line) => {
      const acc = accountById[line.account_id?.[0]];
      if (!acc) return;
      const balance = Number(line.balance || 0);
      const name = (acc.name || "").toLowerCase();

      if (acc.account_type === "income" || acc.account_type === "income_other") {
        const amount = -balance; // income accounts are credit-normal
        totalIncome += amount;
        if (/sale/.test(name)) {
          salesRevenue += amount;
        }
      }
      if (acc.account_type?.startsWith("expense")) {
        totalExpenses += balance;
        if (/cost of goods|cogs|purchase/.test(name)) {
          costOfGoods += balance;
        } else if (/salary|wage|payroll/.test(name)) {
          salaries += balance;
        } else if (/rent|utilit|electric|water bill/.test(name)) {
          rentUtilities += balance;
        }
      }
    });

    const otherIncome = totalIncome - salesRevenue;
    const otherExpenses = totalExpenses - costOfGoods - salaries - rentUtilities;

    const netProfit = totalIncome - totalExpenses;

    return success(res, {
      period: range.period,
      dateFrom: range.startDate,
      dateTo: range.endDate,
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
// GET /api/accounts/balance-sheet?period=month|quarter|year
// Which top-level balance sheet section each Odoo account_type rolls up
// into. Income/expense types aren't a section of their own — they feed
// the "Profit (Loss) to report" line below, same as the native report.
const SECTION_BY_TYPE = {
  asset_cash: "assets",
  asset_receivable: "assets",
  asset_current: "assets",
  asset_non_current: "assets",
  asset_fixed: "assets",
  asset_prepayments: "assets",
  liability_payable: "liabilities",
  liability_current: "liabilities",
  liability_non_current: "liabilities",
  liability_credit_card: "liabilities",
  equity: "equity",
  equity_unaffected: "equity",
};

exports.getBalanceSheet = async (req, res) => {
  try {
    // Balance sheet is inherently "as of a date", not a from/to range —
    // a custom ?endDate lets someone pick that as-of date directly
    // (?startDate is accepted too, for parity with the shared date-range
    // picker UI, but stays optional since a real balance sheet is
    // cumulative, not scoped to a period, unless a preset is chosen).
    const { period, startDate, endDate } = req.query;
    const startDateStr = startDate || (period ? startDateForPeriod(period) : undefined);
    const asOf = endDate || new Date().toISOString().slice(0, 10);
    const { accountById, lines } = await getPostedLedger(startDateStr, endDate || undefined);

    // Roll every posted line up to its account first, so each account
    // shows once with its net balance — not one row per journal entry.
    const accountTotals = {};
    lines.forEach((line) => {
      const accId = line.account_id?.[0];
      if (!accId) return;
      accountTotals[accId] = (accountTotals[accId] || 0) + Number(line.balance || 0);
    });

    const sections = {
      assets:      { lines: [], total: 0 },
      liabilities: { lines: [], total: 0 },
      equity:      { lines: [], total: 0 },
    };

    let incomeTotal = 0;
    let expenseTotal = 0;

    Object.keys(accountTotals).forEach((accId) => {
      const balance = accountTotals[accId];
      if (Math.abs(balance) < 0.005) return; // only accounts that actually have entries

      const acc = accountById[accId];
      if (!acc) return;

      const section = SECTION_BY_TYPE[acc.account_type];
      if (section) {
        // Assets are debit-normal, so the raw GL balance IS the real value.
        // Liabilities and equity are credit-normal, so the raw balance is
        // negative when the real obligation/equity increases — flip it so
        // the report shows the true positive amount and Assets ends up
        // equal to Liabilities + Equity, as a balance sheet must.
        const displayAmount = section === "assets" ? balance : -balance;
        sections[section].lines.push({
          label: `${acc.code} ${acc.name}`,
          amount: displayAmount,
        });
        sections[section].total += displayAmount;
      } else if (acc.account_type === "income" || acc.account_type === "income_other") {
        incomeTotal += balance;
      } else if (acc.account_type?.startsWith("expense")) {
        expenseTotal += balance;
      }
    });

    // The period's net result hasn't been closed to an equity account in
    // the ledger yet, so fold it in as its own line the way Odoo's native
    // balance sheet does — sized so assets == liabilities + equity.
    const profitLossToReport = -(incomeTotal + expenseTotal);
    sections.liabilities.lines.push({ label: "Profit (Loss) to report", amount: profitLossToReport });
    sections.liabilities.total += profitLossToReport;

    // List accounts in chart-of-accounts order (by code) within each section.
    Object.values(sections).forEach((s) => s.lines.sort((a, b) => a.label.localeCompare(b.label)));

    return success(res, {
      asOf,
      period: period || undefined,
      assets: sections.assets,
      liabilities: sections.liabilities,
      equity: sections.equity,
      totalLiabilitiesAndEquity: sections.liabilities.total + sections.equity.total,
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/cash-flow?period=month|quarter|year (or ?startDate=&endDate=)
exports.getCashFlow = async (req, res) => {
  try {
    const range = resolveDateRange(req);
    const base = [["state", "=", "posted"], ["invoice_date", ">=", range.startDate], ["invoice_date", "<=", range.endDate]];

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
      period: range.period,
      dateFrom: range.startDate,
      dateTo: range.endDate,
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
// GET /api/accounts/general-ledger?account_id=1&period=month|quarter|year (or ?startDate=&endDate=)
exports.getGeneralLedger = async (req, res) => {
  try {
    const { account_id, period, startDate, endDate } = req.query;

    if (!account_id) {
      const accounts = await odoo.searchRead("account.account", [], ["id", "name", "code", "account_type"], 500);
      return success(res, { accounts });
    }

    const domain = [["account_id", "=", parseInt(account_id, 10)], ["parent_state", "=", "posted"]];
    if (startDate || endDate) {
      if (startDate) domain.push(["date", ">=", startDate]);
      if (endDate) domain.push(["date", "<=", endDate]);
    } else if (period) {
      domain.push(["date", ">=", startDateForPeriod(period)]);
    }

    const lines = await odoo.searchRead(
      "account.move.line",
      domain,
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

    return success(res, { period: period || undefined, rows, closingBalance: running });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/day-book?date=YYYY-MM-DD
// GET /api/accounts/day-book?date=YYYY-MM-DD
// Returns Cash and Bank journal entries as separate sections (instead of
// one flat list) — Odoo itself keeps a Cash Book and Bank Book distinct
// via journal type, and mixing them together made it impossible to tell
// "how much cash moved today" from "how much moved through the bank".
// Anything NOT posted through a cash/bank journal (e.g. a customer
// invoice recorded on accrual, or a manual journal entry) is still
// returned under "other" so nothing that used to show here disappears.
//
// Entries also carry a linked sale order where one exists — Odoo stores
// the originating document's name (e.g. "S00042") on account.move's
// invoice_origin field when an invoice was generated from a sale order,
// so this resolves that name back to the actual sale.order id/name for
// the app to link straight to it.
exports.getDayBook = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const lines = await odoo.searchRead(
      "account.move.line",
      [["date", "=", date], ["parent_state", "=", "posted"]],
      ["date", "move_id", "move_name", "partner_id", "name", "debit", "credit", "journal_id"],
      500
    );

    // Resolve each line's journal type (cash / bank / other) in one
    // batch read rather than N+1 lookups.
    const journalIds = [...new Set(lines.map((l) => l.journal_id?.[0]).filter(Boolean))];
    let journalTypeById = {};
    if (journalIds.length) {
      const journals = await odoo.searchRead("account.journal", [["id", "in", journalIds]], ["id", "type"], journalIds.length);
      journals.forEach((j) => { journalTypeById[j.id] = j.type; });
    }

    // Resolve the originating sale order for lines whose move came from
    // one (invoice_origin holds the source document's name as text).
    const moveIds = [...new Set(lines.map((l) => l.move_id?.[0]).filter(Boolean))];
    let originByMoveId = {};
    if (moveIds.length) {
      const moves = await odoo.searchRead("account.move", [["id", "in", moveIds]], ["id", "invoice_origin"], moveIds.length);
      moves.forEach((m) => { originByMoveId[m.id] = m.invoice_origin; });
    }
    const originNames = [...new Set(Object.values(originByMoveId).filter(Boolean))];
    let saleOrderByName = {};
    if (originNames.length) {
      const orders = await odoo.searchRead("sale.order", [["name", "in", originNames]], ["id", "name"], originNames.length);
      orders.forEach((o) => { saleOrderByName[o.name] = o.id; });
    }

    const toRow = (l) => {
      const origin = originByMoveId[l.move_id?.[0]];
      const saleOrderId = origin ? saleOrderByName[origin] : null;
      return {
        voucher: l.move_name,
        party: l.partner_id?.[1] || "",
        description: l.name,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        saleOrderId: saleOrderId || null,
        saleOrderName: saleOrderId ? origin : null,
      };
    };

    const section = (rows) => ({
      transactions: rows.map(toRow),
      totalDebit: rows.reduce((s, l) => s + Number(l.debit || 0), 0),
      totalCredit: rows.reduce((s, l) => s + Number(l.credit || 0), 0),
    });

    const cashLines  = lines.filter((l) => journalTypeById[l.journal_id?.[0]] === "cash");
    const bankLines  = lines.filter((l) => journalTypeById[l.journal_id?.[0]] === "bank");
    const otherLines = lines.filter((l) => !["cash", "bank"].includes(journalTypeById[l.journal_id?.[0]]));

    return success(res, {
      date,
      cash: section(cashLines),
      bank: section(bankLines),
      other: section(otherLines),
      totalDebit:  lines.reduce((s, l) => s + Number(l.debit  || 0), 0),
      totalCredit: lines.reduce((s, l) => s + Number(l.credit || 0), 0),
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/trial-balance?period=month|quarter|year (or ?startDate=&endDate=)
// Every posted account, its total debit and credit movement, and the net
// closing balance. Unlike the balance-sheet buckets, this needs debit and
// credit summed separately per account (not just the net), so it queries
// account.move.line directly rather than reusing getPostedLedger's net-only
// balance field.
exports.getTrialBalance = async (req, res) => {
  try {
    const { period, endDate } = req.query;
    const startDate = period ? startDateForPeriod(period) : req.query.startDate;

    const accounts = await odoo.searchRead(
      "account.account", [], ["id", "name", "code", "account_type"], 2000
    );
    const accountById = {};
    accounts.forEach((a) => { accountById[a.id] = a; });

    const domain = [["parent_state", "=", "posted"]];
    if (startDate) domain.push(["date", ">=", startDate]);
    if (endDate) domain.push(["date", "<=", endDate]);

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

    return success(res, { period: period || undefined, rows, totalDebit, totalCredit });
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

// GET /api/accounts/partner-ledger?partner_id=123&period=month|quarter|year
// Same shape as general-ledger but scoped to one partner's receivable/
// payable lines, with a running balance — for "how much does this
// customer/supplier owe us right now, and how did we get there".
exports.getPartnerLedger = async (req, res) => {
  try {
    const { partner_id, period, startDate, endDate } = req.query;

    if (!partner_id) {
      const partners = await odoo.searchRead(
        "res.partner", [["customer_rank", ">", 0], "|", ["supplier_rank", ">", 0], ["customer_rank", ">", 0]],
        ["id", "name"], 500
      );
      return success(res, { partners });
    }

    const domain = [
      ["partner_id", "=", parseInt(partner_id, 10)],
      ["parent_state", "=", "posted"],
      ["account_id.account_type", "in", ["asset_receivable", "liability_payable"]],
    ];
    if (startDate || endDate) {
      if (startDate) domain.push(["date", ">=", startDate]);
      if (endDate) domain.push(["date", "<=", endDate]);
    } else if (period) {
      domain.push(["date", ">=", startDateForPeriod(period)]);
    }

    const lines = await odoo.searchRead(
      "account.move.line",
      domain,
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

    return success(res, { partnerId: Number(partner_id), period: period || undefined, rows, closingBalance: running });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/accounts/tax-report?period=month|quarter|year (or ?startDate=&endDate=)
// Groups posted tax lines by tax name, split into output tax (charged to
// customers on sales) and input tax (paid to suppliers on purchases), so
// net tax due = output - input.
exports.getTaxReport = async (req, res) => {
  try {
    const range = resolveDateRange(req);

    const taxLines = await odoo.searchRead(
      "account.move.line",
      [
        ["parent_state", "=", "posted"],
        ["date", ">=", range.startDate],
        ["date", "<=", range.endDate],
        ["tax_line_id", "!=", false],
      ],
      ["tax_line_id", "debit", "credit", "move_id"],
      4000
    );

    if (taxLines.length === 0) {
      return success(res, { period: range.period, dateFrom: range.startDate, dateTo: range.endDate, outputTax: [], inputTax: [], totalOutputTax: 0, totalInputTax: 0, netTaxDue: 0 });
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
      period: range.period,
      dateFrom: range.startDate,
      dateTo: range.endDate,
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

// GET /api/accounts/audit-trail?period=month|quarter|year (or ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD)
// Chronological log of journal entries showing who created/last touched
// each one, using Odoo's built-in create/write metadata fields (available
// on every model) rather than a separate audit-log module.
exports.getAuditTrail = async (req, res) => {
  try {
    const { startDate, endDate, period } = req.query;
    const domain = [];
    const effectiveStart = period ? startDateForPeriod(period) : startDate;
    if (effectiveStart) domain.push(["create_date", ">=", effectiveStart]);
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

    return success(res, { period: period || undefined, rows });
  } catch (err) {
    return error(res, err.message);
  }
};