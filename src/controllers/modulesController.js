// src/controllers/modulesController.js
//
// GET /api/modules
// Returns the list of app screens this specific logged-in user, on this
// specific tenant's Odoo, is actually allowed to see. Two independent
// gates have to pass for a non-"always" entry in MODULE_REGISTRY:
//
//   1. Installed  — is the Odoo app actually installed on this tenant's
//                    database right now? (ir.module.module, state=installed)
//   2. Permitted   — does the LOGGED-IN USER's own Odoo group membership
//                    give them access to that app's menu, or is that
//                    app's menu open to everyone? (ir.ui.menu groups_id,
//                    cross-referenced against the user's res.users groups_id)
//
// Both checks run through the existing OdooService/requestContext, so
// this automatically stays tenant-scoped exactly like every other
// controller in the app — nothing new to configure per client.
//
// Same shape for every tenant, every client, every APK build:
//   { success: true, data: { modules: [ { id, key, name, icon }, ... ] } }

const odoo = require("../config/OdooService");
const { MODULE_REGISTRY } = require("../config/moduleRegistry");
const { success, error } = require("../utils/response");
const requestContext = require("../config/requestContext");

// Short-lived cache so a dashboard that re-polls or a user opening the
// drawer repeatedly doesn't re-run several Odoo round trips every time.
// Keyed by tenant + user, since permissions are per-user, not just
// per-tenant. 5 minutes is long enough to matter, short enough that a
// newly-installed Odoo app shows up without needing a backend restart.
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cache = new Map();

const cacheKeyFor = (req) => `${req.tenant?.id || "unknown"}:${req.user?.odooUserId || "unknown"}`;

// Every root menu Odoo registers for an app is tagged with the module
// that shipped it via ir.model.data (module + res_id -> ir.ui.menu id).
// We read that menu's groups_id to know who it's visible to:
//   - empty groups_id  => visible to everyone with the app installed
//   - non-empty        => visible only to users in one of those groups
// If a module doesn't register any menu at all (rare, e.g. a
// backend-only technical module), we fail OPEN rather than hiding a
// screen the person may legitimately need — better a false show than a
// silently missing feature nobody can figure out how to re-enable.
async function isModuleAccessibleToUser(odooModuleName, userGroupIds) {
  const menuLinks = await odoo.searchRead(
    "ir.model.data",
    [["module", "=", odooModuleName], ["model", "=", "ir.ui.menu"]],
    ["res_id"],
    1000
  );
  if (!menuLinks.length) return true;

  const menuIds = menuLinks.map((m) => m.res_id);
  const menus = await odoo.read("ir.ui.menu", menuIds, ["groups_id"]);

  const userGroupSet = new Set(userGroupIds);
  return menus.some((menu) => {
    const restrictedTo = menu.groups_id || [];
    if (restrictedTo.length === 0) return true; // open to everyone
    return restrictedTo.some((gid) => userGroupSet.has(gid));
  });
}

const getModules = async (req, res) => {
  const key = cacheKeyFor(req);
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return success(res, { modules: cached.modules });
  }

  try {
    const [installedRows, userRows] = await Promise.all([
      odoo.searchRead("ir.module.module", [["state", "=", "installed"]], ["name"], 500),
      odoo.read("res.users", [req.user.odooUserId], ["groups_id"]),
    ]);

    const installed = new Set(installedRows.map((m) => m.name));
    const userGroupIds = userRows[0]?.groups_id || [];

    // Cache accessibility checks per Odoo module name within this single
    // request/cache window, since crm/manufacturing/finance may each be
    // asked about separately but the underlying menu lookup is the same
    // shape of query.
    const accessibilityCache = new Map();
    const checkAccess = async (odooModuleName) => {
      if (!accessibilityCache.has(odooModuleName)) {
        accessibilityCache.set(
          odooModuleName,
          isModuleAccessibleToUser(odooModuleName, userGroupIds)
        );
      }
      return accessibilityCache.get(odooModuleName);
    };

    const results = await Promise.all(
      MODULE_REGISTRY.map(async (entry, index) => {
        let visible;

        if (entry.always) {
          visible = true;
        } else if (entry.odooModule) {
          visible = installed.has(entry.odooModule) && (await checkAccess(entry.odooModule));
        } else if (entry.requiresAnyOf) {
          const installedMatches = entry.requiresAnyOf.filter((m) => installed.has(m));
          if (!installedMatches.length) {
            visible = false;
          } else {
            const accessChecks = await Promise.all(installedMatches.map(checkAccess));
            visible = accessChecks.some(Boolean);
          }
        } else {
          visible = false;
        }

        return visible ? { id: index + 1, key: entry.key, name: entry.name, icon: entry.icon } : null;
      })
    );

    const modules = results.filter(Boolean);
    _cache.set(key, { modules, at: Date.now() });
    return success(res, { modules });
  } catch (err) {
    return error(res, "Failed to resolve modules: " + err.message);
  }
};

// Lets an admin force a re-check (e.g. right after installing a new app
// in Odoo) without waiting for the cache to expire.
const refreshModules = async (req, res) => {
  _cache.delete(cacheKeyFor(req));
  return getModules(req, res);
};

module.exports = { getModules, refreshModules };
