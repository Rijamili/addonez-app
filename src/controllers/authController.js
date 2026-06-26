const odoo              = require("../config/OdooService");
const OdooConfigService = require("../config/OdooConfigService");
const { generateToken } = require("../utils/jwt");
const { success, error } = require("../utils/response");

const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const uid  = await odoo.authenticateUser(email, password);
    const user = await odoo.getUserByEmail(email);
    if (!user) return error(res, "User not found.", 404);

    const role  = (user.groups_id?.length || 0) > 5 ? "admin" : "user";
    const token = await generateToken({
      uid,
      odooUserId: user.id,
      email:      user.login,
      name:       user.name,
      role,
      partnerId:  user.partner_id?.[0],
    });

    return success(res, {
      token,
      user: { id: user.id, name: user.name, email: user.login, role },
    }, "Login successful");
  } catch (err) {
    return error(res, err.message, 401);
  }
};

const forgotPassword = async (req, res) => {
  try {
    const user = await odoo.getUserByEmail(req.body.email);
    if (user) await odoo.execute("res.users", "action_reset_password", [[user.id]]);
    return success(res, null, "If this email exists, a reset link has been sent.");
  } catch {
    return success(res, null, "If this email exists, a reset link has been sent.");
  }
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
    return success(res, { host: cfg.odoo.host, db: cfg.odoo.db }, "Config refreshed from Odoo.");
  } catch (err) {
    return error(res, "Failed to refresh config: " + err.message);
  }
};

module.exports = { login, forgotPassword, getMe, refreshConfig };