const odoo = require("../config/OdooService");
const axios = require("axios");
const attendanceService = require("../services/attendanceService");
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

      // --- Attendance module role resolution ---
      // Attendance has its own 3-tier model (admin/company/employee) on
      // top of the app's normal role. We don't rely on res.users.groups_id
      // here (that field is currently broken on this Odoo version — see
      // OdooService.getUserByEmail) — has_group() is a model METHOD call,
      // not a field read, so it works regardless. Falls back to
      // "does this account have a linked hr.employee record" if the
      // Attendance app (hr_attendance) isn't installed for this tenant.
      let attendanceRole = "employee";
      let employeeId = null;
      let employeeCompanyId = null;

      try {
        const employee = await attendanceService.getEmployeeByUserId(user.id);
        employeeId = employee?.id || null;
        employeeCompanyId = employee?.company_id?.[0] || null;
      } catch (e) {
        // hr module not installed for this tenant, or lookup failed —
        // fine, just means this login has no linked employee record.
      }

      if (role === "super_admin") {
        attendanceRole = "admin";
      } else {
        try {
          const isManager = await odoo.execute("res.users", "has_group", [
            [user.id],
            "hr_attendance.group_hr_attendance_manager",
          ]);
          attendanceRole = isManager ? "company" : "employee";
        } catch (e) {
          // has_group unavailable (module not installed, or method
          // missing on this Odoo version) — fall back to "does this
          // account have its own employee record".
          attendanceRole = employeeId ? "employee" : "company";
        }
      }

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
        // Attendance module fields — see resolution above.
        attendanceRole,
        employeeId,
        employeeCompanyId,
      });

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.login,
          role,
          attendanceRole,
          employeeId,
          tenantId: tenant.id,
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

// Submits to Odoo's OWN public password-reset route — the exact request
// Odoo's login page sends when someone clicks "Reset Password" there.
// We switched to this after discovering that the XML-RPC action
// (res.users.action_reset_password) reliably fails on this Odoo build:
// it returns a bare Python None, and Odoo's own XML-RPC endpoint is
// hard-configured with allow_none=False — a server-side restriction no
// context flag on our end can work around. This route has no XML-RPC
// involved, does Odoo's own lookup-by-email internally (so it also
// naturally handles "no such user" the same non-revealing way we do),
// and needs a session + CSRF token first, same as any real browser
// visiting that page would get.
async function triggerOdooWebResetPassword(host, email) {
  const baseUrl = `https://${host}`;

  const loginPageRes = await axios.get(`${baseUrl}/web/login`, {
    validateStatus: () => true,
  });

  const cookies = loginPageRes.headers["set-cookie"] || [];
  const cookieHeader = cookies.map((c) => c.split(";")[0]).join("; ");

  const csrfMatch =
    loginPageRes.data.match(/name=["']csrf_token["']\s+value=["']([^"']+)["']/) ||
    loginPageRes.data.match(/csrf_token\s*[:=]\s*["']([a-zA-Z0-9._-]+)["']/);
  const csrfToken = csrfMatch ? csrfMatch[1] : null;

  if (!csrfToken) {
    throw new Error(
      `Could not find a CSRF token on ${baseUrl}/web/login — the login page's HTML structure may differ on this Odoo version.`
    );
  }

  const body = new URLSearchParams();
  body.append("csrf_token", csrfToken);
  body.append("login", email);

  const resetRes = await axios.post(`${baseUrl}/web/reset_password`, body.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader,
    },
    validateStatus: () => true,
  });

  // Odoo re-renders the login page (200) whether or not the email
  // exists — same non-disclosure behavior our own API response already
  // has. Only a 4xx/5xx here means something is actually broken (wrong
  // route for this Odoo version, server error, etc.), not "email not
  // found".
  if (resetRes.status >= 400) {
    throw new Error(`Odoo /web/reset_password returned HTTP ${resetRes.status}`);
  }
}

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const tenant = TenantDirectory.findByEmail(email);

  // The response to the CLIENT always stays the same generic message
  // regardless of what happens below — that's intentional (never reveal
  // whether an email exists). Logging here is server-side only and
  // doesn't change what the client sees.
  if (!tenant) {
    console.warn(`forgotPassword: no tenant found for email "${email}"`);
  } else {
    try {
      await triggerOdooWebResetPassword(tenant.odoo.host, email);
      console.log(`forgotPassword: submitted to ${tenant.odoo.host}/web/reset_password for "${email}" (tenant "${tenant.id}")`);
    } catch (err) {
      console.error(`forgotPassword: FAILED for email "${email}" on tenant "${tenant.id}":`, err.message);
    }
  }

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