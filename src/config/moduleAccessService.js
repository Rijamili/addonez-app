// src/config/moduleAccessService.js
//
// Single source of truth for "is Odoo module/screen X visible right now"
// — shared by GET /api/modules (modulesController, drives what the app
// shows) AND the requireModule route guard (middleware/requireModule,
// enforces what the API actually allows). Keeping both on this one
// module means the UI can never show a screen the API would refuse, and
// the API can never quietly diverge from what the drawer decided to hide.
//
// Same two gates as before:
//   1. Installed  — ir.module.module, state=installed, on this tenant's DB
//   2. Permitted   — logged-in user's own Odoo group membership grants
//                    access to that app's menu (ir.ui.menu groups_id)

const odoo = require("../config/OdooService");
const { MODULE_REGISTRY } = require("./moduleRegistry");

// Short-lived per-tenant cache for the installed-modules set. Keyed by
// tenant only (not user) since "installed" is tenant-wide; the
// per-user "accessible" check below is cheap enough to redo per call
// and depends on the specific user's groupIds anyway.
const CACHE_TTL_MS = 5 * 60 * 1000;
const _installedCache = new Map();

async function getInstalledModules(tenantId) {
  const cached = _installedCache.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.installed;
  }

  const installedRows = await odoo.searchRead(
    "ir.module.module",
    [["state", "=", "installed"]],
    ["name"],
    500
  );
  const installed = new Set(installedRows.map((m) => m.name));
  _installedCache.set(tenantId, { installed, at: Date.now() });
  return installed;
}

function invalidateInstalledCache(tenantId) {
  _installedCache.delete(tenantId);
}

// Every root menu Odoo registers for an app is tagged with the module
// that shipped it via ir.model.data. We read that menu's groups_id to
// know who it's visible to:
//   - empty groups_id  => visible to everyone with the app installed
//   - non-empty        => visible only to users in one of those groups
// If a module doesn't register any menu at all (rare, e.g. a
// backend-only technical module), fail OPEN rather than hiding/blocking
// a screen the person may legitimately need.
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

// Resolves visibility for every entry in MODULE_REGISTRY at once, given
// an already-fetched installed set + this user's groupIds. Used by
// modulesController to build the full /api/modules list in one pass.
async function resolveAllModules(installed, userGroupIds) {
  const accessibilityCache = new Map();
  const checkAccess = async (odooModuleName) => {
    if (!accessibilityCache.has(odooModuleName)) {
      accessibilityCache.set(odooModuleName, isModuleAccessibleToUser(odooModuleName, userGroupIds));
    }
    return accessibilityCache.get(odooModuleName);
  };

  return Promise.all(
    MODULE_REGISTRY.map(async (entry) => {
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
      return { entry, visible };
    })
  );
}

// Resolves visibility for a single registry key — this is what the
// requireModule route guard calls. Looks up the MODULE_REGISTRY entry
// for `key`, fetches (cached) installed modules for the tenant, and
// applies the exact same rule modulesController uses to decide whether
// that screen would be shown.
async function isKeyVisible(key, tenantId, userGroupIds) {
  const entry = MODULE_REGISTRY.find((e) => e.key === key);
  if (!entry) {
    // Unknown key — nothing in the registry claims this screen, so
    // there's nothing to authorize against. Treat as not visible
    // rather than silently allowing an unregistered route through.
    return false;
  }
  if (entry.always) return true;

  const installed = await getInstalledModules(tenantId);

  if (entry.odooModule) {
    if (!installed.has(entry.odooModule)) return false;
    return isModuleAccessibleToUser(entry.odooModule, userGroupIds || []);
  }

  if (entry.requiresAnyOf) {
    const installedMatches = entry.requiresAnyOf.filter((m) => installed.has(m));
    if (!installedMatches.length) return false;
    const accessChecks = await Promise.all(
      installedMatches.map((m) => isModuleAccessibleToUser(m, userGroupIds || []))
    );
    return accessChecks.some(Boolean);
  }

  return false;
}

module.exports = {
  MODULE_REGISTRY,
  getInstalledModules,
  invalidateInstalledCache,
  isModuleAccessibleToUser,
  resolveAllModules,
  isKeyVisible,
};