// src/middleware/requireModule.js
//
// Blocks a route unless the given MODULE_REGISTRY key is currently
// visible for the logged-in user (installed on this tenant's Odoo AND
// permitted by the user's own Odoo groups) — the exact same check
// GET /api/modules uses to decide whether the app shows that screen.
//
// Without this, hiding a drawer row is only a UI courtesy: anyone who
// knows/guesses the endpoint (e.g. GET /api/crm/leads) could still call
// it directly even if CRM isn't installed for their tenant, or their
// Odoo user isn't in the group that's supposed to see it. This closes
// that gap by re-checking on the server for every request, right next
// to `authenticate` in each route file:
//
//   router.get("/", authenticate, requireModule("crm"), getCrmSummary);
//
// Must run AFTER `authenticate` — it needs req.user (for groupIds) and
// req.tenant (set by authenticate) to already be populated.

const { isKeyVisible } = require("../config/moduleAccessService");
const { error } = require("../utils/response");

const requireModule = (moduleKey) => async (req, res, next) => {
  try {
    const tenantId = req.tenant?.id;
    const userGroupIds = req.user?.groupIds || [];

    const visible = await isKeyVisible(moduleKey, tenantId, userGroupIds);

    if (!visible) {
      return error(
        res,
        `The "${moduleKey}" module isn't installed for your organization, or your account doesn't have access to it.`,
        403
      );
    }

    next();
  } catch (err) {
    return error(res, "Failed to verify module access: " + err.message, 500);
  }
};

module.exports = { requireModule };