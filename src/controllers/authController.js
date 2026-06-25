// src/controllers/authController.js

const odoo = require("../config/odooClient");

const login = (req, res) => {
  const { email, password } = req.body;

  // Validate credentials against the Odoo instance from headers
  const { common, db } = odoo.resolveConfig(req);

  common.methodCall("authenticate", [db, email, password, {}], (err, uid) => {
    if (err)  return res.status(500).json({ success: false, message: "Authentication Error" });
    if (!uid) return res.status(401).json({ success: false, message: "Invalid Odoo Credentials" });
    return res.status(200).json({ success: true, message: "Login Successful", uid });
  });
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email is required." });

  try {
    const uid   = await odoo.authenticate(req);
    const users = await odoo.execute(req, uid, "res.users", "search_read",
      [[[["login", "=", email]]]], { fields: ["id"], limit: 1 });

    if (!users || users.length === 0) {
      return res.json({ success: true, message: "If this email is registered, a reset link has been sent." });
    }

    await odoo.execute(req, uid, "res.users", "action_reset_password", [[users[0].id]], {});
    return res.json({ success: true, message: "Password reset email sent successfully." });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    return res.status(500).json({ success: false, message: "Failed to send reset email. Please try again." });
  }
};

module.exports = { login, forgotPassword };