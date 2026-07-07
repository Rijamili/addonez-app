const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getProfile = async (req, res) => {
  try {
    const user = await odoo.read("res.users", [req.user.odooUserId],
      ["name", "login", "phone", "company_id", "partner_id"]);
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