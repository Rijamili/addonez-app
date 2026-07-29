const odoo = require("../config/OdooService");
const OdooConfigService = require("../config/OdooConfigService");
const TenantDirectory = require("../config/TenantDirectory");
const requestContext = require("../config/requestContext");
const { generateToken } = require("../utils/jwt");
const { success, error } = require("../utils/response");

const login = async (req, res) => {
  const { email, password } = req.body;

  console.log("========== LOGIN ==========");
  console.log("Email:", email);

  const tenant = TenantDirectory.findByEmail(email);
  console.log("Tenant:", tenant);

  if (!tenant) {
    return error(
      res,
      "We couldn't find an organization for that email.",
      404
    );
  }

  try {
    const { token, user } = await requestContext.run(tenant, async () => {

      const uid = await odoo.authenticateUser(email, password);
      console.log("Authenticated UID:", uid);

      const user = await odoo.getUserByEmail(email);
      console.log("User:", user);

      if (!user) {
        throw new Error("User not found in Odoo.");
      }

     let role = "user";

// Super Admin + Tenant Admin
if (user.login.toLowerCase() === "info@addonez.com") {
  role = "super_admin";
}

console.log("Role:", role);
console.log("Groups:", user.groups_id);

      const token = await generateToken({
        uid,
        odooUserId: user.id,
        email: user.login,
        name: user.name,
        role,
        partnerId: user.partner_id?.[0],
        tenantId: tenant.id,
        groupIds: user.groups_id || [],
        // Odoo's own multi-company access for this specific user — used
        // to scope every later Odoo query to only the companies they're
        // actually allowed to see (via allowed_company_ids in context),
        // even though we still authenticate Odoo calls as the shared
        // admin account. This is what makes multi-company setups safe.
        companyId: user.company_id?.[0] || null,
        companyIds: user.company_ids || [],
      });

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.login,
          role,
        },
      };
    });

    const alreadyListed = (tenant.users || [])
      .map((e) => e.toLowerCase())
      .includes(email.trim().toLowerCase());

    if (!alreadyListed) {
      TenantDirectory.addUserEmail(tenant.id, email).catch(() => {});
    }

    return success(
      res,
      {
        token,
        user,
        tenant: {
          id: tenant.id,
          name: tenant.name,
        },
        aiInsightsUrl: process.env.AI_INSIGHTS_API_URL,
      },
      "Login successful"
    );

  } catch (err) {
    console.error("LOGIN ERROR:", err);
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

        if (user) {
          await odoo.execute(
            "res.users",
            "action_reset_password",
            [[user.id]]
          );
        }
      });
    }
  } catch {}

  return success(
    res,
    null,
    "If this email exists, a reset link has been sent."
  );
};

const getMe = async (req, res) => {
  try {
    const user = await odoo.read(
      "res.users",
      [req.user.odooUserId],
      ["name", "login"]
    );

    return success(res, user[0]);

  } catch (err) {
    return error(res, err.message);
  }
};

const refreshConfig = async (req, res) => {
  try {
    const cfg = await OdooConfigService.refresh();

    return success(
      res,
      {
        host: cfg.odoo.host,
        db: cfg.odoo.db,
      },
      "Legacy default config refreshed."
    );

  } catch (err) {
    return error(
      res,
      "Failed to refresh config: " + err.message
    );
  }
};

const reloadTenants = async (req, res) => {
  try {
    TenantDirectory.reload();

    return success(
      res,
      {
        tenants: TenantDirectory.list(),
      },
      "Tenant directory reloaded."
    );

  } catch (err) {
    return error(
      res,
      "Failed to reload tenants: " + err.message
    );
  }
};

module.exports = {
  login,
  forgotPassword,
  getMe,
  refreshConfig,
  reloadTenants,
};