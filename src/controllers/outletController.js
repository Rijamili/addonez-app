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