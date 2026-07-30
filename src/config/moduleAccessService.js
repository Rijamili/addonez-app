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
// Resolving a group's external ID (e.g. "project.group_project_user") to
// its actual numeric group id requires an Odoo query — cache it per
// tenant so we're not doing this on every single request. Different
// Odoo installs can (in theory) have different numeric ids for the same
// named group, so this is NOT safe to hardcode or share across tenants.
const _groupIdCache = new Map(); // tenantId -> Map(xmlId -> numericId | null)

async function resolveGroupId(tenantId, xmlId) {
  let tenantCache = _groupIdCache.get(tenantId);
  if (!tenantCache) {
    tenantCache = new Map();
    _groupIdCache.set(tenantId, tenantCache);
  }
  if (tenantCache.has(xmlId)) return tenantCache.get(xmlId);

  const [module, name] = xmlId.split(".");
  let numericId = null;
  try {
    const rows = await odoo.searchRead(
      "ir.model.data",
      [["module", "=", module], ["name", "=", name]],
      ["res_id"],
      1
    );
    numericId = rows[0]?.res_id ?? null;
  } catch {
    // Odoo unreachable, or this group genuinely doesn't exist on this
    // install (e.g. a community-edition tenant missing an enterprise-only
    // group) — treat as "couldn't verify" rather than crash the request.
    numericId = null;
  }

  tenantCache.set(xmlId, numericId);
  return numericId;
}

function invalidateGroupIdCache(tenantId) {
  _groupIdCache.delete(tenantId);
}

// Checks whether THIS specific logged-in user (via their own Odoo group
// membership, from their JWT's groupIds) is actually permitted to use a
// given module — not just "is it installed for the tenant overall".
//
// groupXmlId can be a single string, or an array of acceptable groups —
// e.g. a Sales Administrator/Manager should also pass a "salesman" check,
// since Odoo's higher-level groups don't always get automatically
// expanded into every lower-level group id when read via raw XML-RPC.
//
// If a module has no groupXmlId configured, or none of the groups can be
// resolved, this fails OPEN (allows access) rather than hiding a screen
// incorrectly.
async function isModuleAccessibleToUser(tenantId, groupXmlId, userGroupIds = []) {
  if (!groupXmlId) return true;

  const candidates = Array.isArray(groupXmlId) ? groupXmlId : [groupXmlId];
  const resolvedIds = await Promise.all(
    candidates.map((xmlId) => resolveGroupId(tenantId, xmlId))
  );
  const validIds = resolvedIds.filter((id) => id != null);

  if (validIds.length === 0) return true; // couldn't verify any — fail open

  return validIds.some((id) => userGroupIds.includes(id));
}

// Resolves visibility for every entry in MODULE_REGISTRY at once, given
// an already-fetched installed set + this user's groupIds. Used by
// modulesController to build the full /api/modules list in one pass.
async function resolveAllModules(tenantId, installed, userGroupIds) {
  return Promise.all(
    MODULE_REGISTRY.map(async (entry) => {
      let visible;
      if (entry.always) {
        visible = true;
      } else if (entry.odooModule) {
        visible =
          installed.has(entry.odooModule) &&
          (await isModuleAccessibleToUser(tenantId, entry.groupXmlId, userGroupIds));
      } else if (entry.requiresAnyOf) {
        const installedMatches = entry.requiresAnyOf.filter((m) => installed.has(m));
        visible =
          installedMatches.length > 0 &&
          (await isModuleAccessibleToUser(tenantId, entry.groupXmlId, userGroupIds));
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
    return isModuleAccessibleToUser(tenantId, entry.groupXmlId, userGroupIds || []);
  }

  if (entry.requiresAnyOf) {
    const installedMatches = entry.requiresAnyOf.filter((m) => installed.has(m));
    if (!installedMatches.length) return false;
    return isModuleAccessibleToUser(tenantId, entry.groupXmlId, userGroupIds || []);
  }

  return false;
}

module.exports = {
  MODULE_REGISTRY,
  getInstalledModules,
  invalidateInstalledCache,
  invalidateGroupIdCache,
  isModuleAccessibleToUser,
  resolveAllModules,
  isKeyVisible,
};