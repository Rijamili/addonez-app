const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getProfile = async (req, res) => {
  try {
    const user = await odoo.read("res.users", [req.user.odooUserId],
      ["name", "login", "phone", "company_id", "partner_id"]);
    return success(res, user[0]);
  } catch (err) {
    return error(res, err.message);
  }
};