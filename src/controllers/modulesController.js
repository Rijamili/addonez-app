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
// Both checks (and the MODULE_REGISTRY walk itself) now live in
// config/moduleAccessService.js, shared with the requireModule route
// guard — so the screens the app shows and what the API actually allows
// can never quietly drift apart.
//
// Same shape for every tenant, every client, every APK build:
//   { success: true, data: { modules: [ { id, key, name, icon }, ... ] } }

const { success, error } = require("../utils/response");
const {
  getInstalledModules,
  invalidateInstalledCache,
  resolveAllModules,
} = require("../config/moduleAccessService");

// Short-lived cache so a dashboard that re-polls or a user opening the
// drawer repeatedly doesn't re-run several Odoo round trips every time.
// Keyed by tenant + user, since permissions are per-user, not just
// per-tenant. 5 minutes is long enough to matter, short enough that a
// newly-installed Odoo app shows up without needing a backend restart.
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cache = new Map();

const cacheKeyFor = (req) => `${req.tenant?.id || "unknown"}:${req.user?.odooUserId || "unknown"}`;

const getModules = async (req, res) => {
  const key = cacheKeyFor(req);
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return success(res, { modules: cached.modules });
  }

  try {
    const installed = await getInstalledModules(req.tenant?.id);

    // req.user.groupIds comes from the JWT (set at login from the
    // user's res.users.groups_id).
    const userGroupIds = req.user?.groupIds || [];

    const resolved = await resolveAllModules(installed, userGroupIds);

    const modules = resolved
      .map(({ entry, visible }, index) =>
        visible ? { id: index + 1, key: entry.key, name: entry.name, icon: entry.icon } : null
      )
      .filter(Boolean);

    _cache.set(key, { modules, at: Date.now() });
    return success(res, { modules });
  } catch (err) {
    return error(res, "Failed to resolve modules: " + err.message);
  }
};

// Lets an admin force a re-check (e.g. right after installing a new app
// in Odoo) without waiting for the cache to expire. Also clears the
// shared installed-modules cache used by requireModule, so a freshly
// installed app is immediately enforceable on the API side too.
const refreshModules = async (req, res) => {
  _cache.delete(cacheKeyFor(req));
  invalidateInstalledCache(req.tenant?.id);
  return getModules(req, res);
};

module.exports = { getModules, refreshModules };