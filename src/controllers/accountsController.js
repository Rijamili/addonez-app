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
        cashBalance: netProfit, // placeholder until a real bank/cash account is wired in
      },
      reports: [
        { key: "profit-and-loss",    label: "Profit and loss" },
        { key: "balance-sheet",      label: "Balance sheet" },
        { key: "cash-flow",          label: "Cash flow statement" },
        { key: "general-ledger",     label: "General ledger" },
        { key: "day-book",           label: "Day book report" },
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
    const otherIncome    = 0; // wire to a real "other income" journal if/when available
    const totalIncome    = salesRevenue + otherIncome;

    const costOfGoods    = purchases.reduce((s, r) => s + Number(r.amount_total || 0), 0);
    const salaries       = 0; // wire to hr.payslip totals when payroll is enabled
    const rentUtilities  = 0; // wire to a specific expense account if tracked separately
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