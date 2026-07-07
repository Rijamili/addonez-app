const odoo              = require("../config/OdooService");
const OdooConfigService = require("../config/OdooConfigService");
const TenantDirectory   = require("../config/TenantDirectory");
const requestContext    = require("../config/requestContext");
const { generateToken } = require("../utils/jwt");
const { success, error } = require("../utils/response");

const login = async (req, res) => {
  const { email, password } = req.body;

  const tenant = TenantDirectory.findByEmail(email);
  if (!tenant) {
    return error(res, "We couldn't find an organization for that email. Contact your administrator.", 404);
  }

  try {
    const { token, user } = await requestContext.run(tenant, async () => {
      const uid  = await odoo.authenticateUser(email, password);
      const user = await odoo.getUserByEmail(email);
      if (!user) throw new Error("User not found in Odoo.");

      const role  = (user.groups_id?.length || 0) > 5 ? "admin" : "user";
      const token = await generateToken({
        uid, odooUserId: user.id, email: user.login, name: user.name,
        role, partnerId: user.partner_id?.[0], tenantId: tenant.id,
      });

      return { token, user: { id: user.id, name: user.name, email: user.login, role } };
    });

    // First time this exact email has logged in (it matched via domain,
    // not the explicit list) — record it on the tenant so it shows up in
    // TenantDirectory.list() / GET /api/admin/tenants going forward. This
    // is what makes new hires "show up" without you adding them by hand.
    const alreadyListed = (tenant.users || []).map((e) => e.toLowerCase()).includes(email.trim().toLowerCase());
    if (!alreadyListed) {
      TenantDirectory.addUserEmail(tenant.id, email).catch(() => {
        // Non-fatal — login already succeeded, this is just bookkeeping.
      });
    }

    return success(res, { token, user, tenant: { id: tenant.id, name: tenant.name } }, "Login successful");
  } catch (err) {
    return error(res, err.message, 401);
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const tenant = TenantDirectory.findByEmail(email);
  try {
    if (tenant) {
      await requestContext.run(tenant, async () => {
        const user = await odoo.getUserByEmail(email);
        if (user) await odoo.execute("res.users", "action_reset_password", [[user.id]]);
      });
    }
  } catch {}
  return success(res, null, "If this email exists, a reset link has been sent.");
};

const getMe = async (req, res) => {
  try {
    const user = await odoo.read("res.users", [req.user.odooUserId], ["name", "login"]);
    return success(res, user[0]);
  } catch (err) {
    return error(res, err.message);
  }
};

const refreshConfig = async (req, res) => {
  try {
    const cfg = await OdooConfigService.refresh();
    return success(res, { host: cfg.odoo.host, db: cfg.odoo.db }, "Legacy default config refreshed.");
  } catch (err) {
    return error(res, "Failed to refresh config: " + err.message);
  }
};

const reloadTenants = async (req, res) => {
  try {
    TenantDirectory.reload();
    return success(res, { tenants: TenantDirectory.list() }, "Tenant directory reloaded.");
  } catch (err) {
    return error(res, "Failed to reload tenants: " + err.message);
  }
};

module.exports = { login, forgotPassword, getMe, refreshConfig, reloadTenants };