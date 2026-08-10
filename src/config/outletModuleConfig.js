// src/config/outletModuleConfig.js
//
// "Outlet Management" is a bespoke, client-specific Odoo module built
// for the Juicy tenant (multi-outlet restaurant chain) — NOT a standard
// Odoo app, so there's no public documentation to reason about its
// model/field names from. Every entry below starts as `null` on
// purpose: outletController checks for that and returns a clear
// "not confirmed yet" response instead of guessing a model name that
// would silently return empty data or a hard 500.
//
// HOW TO FILL THIS IN:
//   1. Hit GET /api/admin/debug/action-info?ids=648,633,... (comma-separate
//      every action id you can find in the URL bar for each Outlet
//      Management screen in Odoo).
//   2. That returns each action's real res_model, plus the full field
//      list for each model.
//   3. Fill in the `model` and `fields` below for each screen using
//      that response. Nothing else in the app needs to change — every
//      screen reads from this one file.

// Bespoke to this one client — gated by tenant id rather than an Odoo
// "is this app installed" check, since we don't know (and may never
// need) a generic technical module name for it.
const ENABLED_TENANT_IDS = ["juicy"];

// Each screen: { model: "real.odoo.model" | null, fields: { ourKey: "real_odoo_field_name" } }
// `fields` values stay null until confirmed too — outletController only
// requests fields that are actually filled in, so a partially-confirmed
// screen still works for whatever IS known.
const SCREENS = {
  dashboard: {
    label: "Admin Panel Dashboard",
    model: null, // confirm via action id 648
    fields: {
      outletName: null,
      yesterdaySale: null,
      monthSale: null,
      avgFoodCostPct: null,
    },
  },
  dailyDataEntry: {
    label: "Daily Data Entry",
    model: "juicy.daily.entry",
    fields: {
      date: "entry_date",
      outlet: "company_id",
      totalSales: null, // still need this — not yet identified
      tallyVariance: "collection_variance",
    },
  },
  monthlySettlementEntry: { label: "Monthly Settlement Entry", model: null, fields: {} },
  partnerProfitDistribution: { label: "Partner Profit Distribution", model: null, fields: {} },
  branchProfitAndLoss: { label: "Branch P&L Statement", model: null, fields: {} },
  salesAnalysis: { label: "Sales Analysis", model: null, fields: {} },
  dailyLedger: { label: "Daily Ledger", model: null, fields: {} },
  monthlyStatement: { label: "Monthly Statement", model: null, fields: {} },
  monthlyRoyaltyPL: { label: "Monthly Royalty P&L", model: null, fields: {} },
  monthlyEmployeeSalary: { label: "Monthly Employee Salary", model: null, fields: {} },
  salaryAdvances: { label: "Salary Advances", model: null, fields: {} },
  partnerOutletShareConfig: { label: "Partner Outlet Share Configuration", model: null, fields: {} },
  expenseCategories: { label: "Expense Categories", model: null, fields: {} },
};

module.exports = { ENABLED_TENANT_IDS, SCREENS };