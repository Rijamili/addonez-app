const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

// GET Profile
exports.getProfile = async (req, res) => {
  try {
    const user = await odoo.read(
      "res.users",
      [req.user.odooUserId],
      ["name", "login", "phone", "company_id", "partner_id"]
    );

    const profile = user[0];

    return success(res, {
      name: profile.name,
      email: profile.login,
      company: Array.isArray(profile.company_id)
        ? profile.company_id[1]
        : "",
      phone: profile.phone,
    });

  } catch (err) {
    return error(res, err.message);
  }
};

// UPDATE Notification Settings
exports.updateNotifications = async (req, res) => {
  try {
    const {
      pushNotification,
      emailNotification,
      salesAlerts,
    } = req.body;

    await odoo.execute(
      "res.users",
      "write",
      [
        [req.user.odooUserId],
        {
          x_push_notifications: pushNotification,
          x_email_notifications: emailNotification,
          x_sales_alerts: salesAlerts,
        },
      ]
    );

    return success(
      res,
      { message: "Notification settings updated." }
    );

  } catch (err) {
    return error(res, err.message);
  }
  
};
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Verify current password
    await odoo.authenticateUser(req.user.email, currentPassword);

    // Change password in Odoo
    await odoo.execute(
      "res.users",
      "write",
      [
        [req.user.odooUserId],
        {
          password: newPassword,
        },
      ]
    );

    return success(res, null, "Password updated successfully.");
  } catch (err) {
    return error(res, err.message, 400);
  }
};