// src/controllers/outletController.js
const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");
const { SCREENS, ENABLED_TENANT_IDS } = require("../config/outletModuleConfig");

// GET /api/outlet/screens — lets the app build its own menu (Dashboard,
// Data Entry, Reports, Salary, Configuration) from this one config
// instead of hardcoding the list of screens in the client too.
exports.getScreens = async (req, res) => {
  const screens = Object.entries(SCREENS).map(([key, s]) => ({
    key,
    label: s.label,
    confirmed: !!s.model,
  }));
  return success(res, screens);
};

// GET /api/outlet/dashboard
// Purpose-built handler (not the generic getScreenData passthrough) —
// the real Dashboard shows aggregated numbers per outlet (Yesterday
// Sale, This Month Sale, Monthly Avg Food Cost %), not raw rows, so it
// needs actual grouping logic. Built on the SAME confirmed model as
// Daily Data Entry (juicy.daily.entry) rather than chasing down the
// dashboard's own action id, since every number it needs is already
// available there.
exports.getDashboard = async (req, res) => {
  const screen = SCREENS.dailyDataEntry;
  if (!screen.model) {
    return error(
      res,
      "Dashboard needs Daily Data Entry's model confirmed first (they share the same underlying data) — see config/outletModuleConfig.js.",
      501
    );
  }

  try {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

    const rows = await odoo.searchRead(
      screen.model,
      [["entry_date", ">=", monthStart]],
      ["entry_date", "company_id", "sales_amount", "food_cost_percentage_mtd"],
      2000,
      0,
      "entry_date desc"
    );

    const byCompany = {};
    rows.forEach((r) => {
      const companyId = r.company_id?.[0];
      const companyName = r.company_id?.[1];
      if (!companyId) return;

      if (!byCompany[companyId]) {
        byCompany[companyId] = {
          id: companyId,
          outletName: companyName,
          yesterdaySale: 0,
          monthSale: 0,
          avgFoodCostPct: 0,
          _latestDate: null,
        };
      }
      const bucket = byCompany[companyId];

      bucket.monthSale += Number(r.sales_amount || 0);
      if (r.entry_date === yesterdayStr) {
        bucket.yesterdaySale += Number(r.sales_amount || 0);
      }
      // food_cost_percentage_mtd is already a cumulative month-to-date
      // figure maintained by the module itself — take the value from
      // the most recent entry rather than averaging every row again.
      if (!bucket._latestDate || r.entry_date > bucket._latestDate) {
        bucket._latestDate = r.entry_date;
        bucket.avgFoodCostPct = Number(r.food_cost_percentage_mtd || 0);
      }
    });

    const outlets = Object.values(byCompany).map(({ _latestDate, ...rest }) => rest);
    return success(res, outlets);
  } catch (err) {
    return error(res, `Dashboard aggregation failed: ${err.message}`, 500);
  }
};

// GET /api/outlet/:screenKey?<any extra filters>
exports.getScreenData = async (req, res) => {
  const { screenKey } = req.params;
  const screen = SCREENS[screenKey];

  if (!screen) {
    return error(res, `Unknown Outlet Management screen "${screenKey}".`, 404);
  }

  if (!screen.model) {
    // Honest "not wired up yet" response rather than a guess — see
    // config/outletModuleConfig.js for exactly how to fill this in.
    return error(
      res,
      `"${screen.label}" hasn't been connected to Odoo yet — its model name needs to be confirmed via GET /api/admin/debug/action-info first, then set in config/outletModuleConfig.js.`,
      501
    );
  }

  // Only request fields that have actually been confirmed — a screen
  // can be "half wired up" (model known, some fields still null) and
  // still return something useful instead of an all-or-nothing failure.
  const confirmedFields = Object.entries(screen.fields)
    .filter(([, odooFieldName]) => !!odooFieldName)
    .reduce((acc, [ourKey, odooFieldName]) => {
      acc[ourKey] = odooFieldName;
      return acc;
    }, {});

  if (Object.keys(confirmedFields).length === 0) {
    return error(
      res,
      `"${screen.label}"'s model is set, but none of its field names have been confirmed yet — see config/outletModuleConfig.js.`,
      501
    );
  }

  try {
    const odooFieldNames = Object.values(confirmedFields);
    const rows = await odoo.searchRead(screen.model, [], odooFieldNames, 500);

    // Translate Odoo's real field names back to our stable keys, so the
    // frontend never has to know or care what they're actually called
    // in Odoo.
    const reverseMap = Object.entries(confirmedFields).reduce((acc, [ourKey, odooFieldName]) => {
      acc[odooFieldName] = ourKey;
      return acc;
    }, {});

    const translated = rows.map((row) => {
      const out = { id: row.id };
      Object.entries(row).forEach(([odooFieldName, value]) => {
        const ourKey = reverseMap[odooFieldName];
        if (ourKey) out[ourKey] = value;
      });
      return out;
    });

    return success(res, translated);
  } catch (err) {
    return error(res, `Odoo read failed for "${screen.label}" (model "${screen.model}"): ${err.message}`, 500);
  }
};

exports.isTenantEnabled = (tenantId) => ENABLED_TENANT_IDS.includes(tenantId);