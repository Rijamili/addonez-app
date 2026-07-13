const OdooService = require("../config/OdooService");

exports.getHelpSupport = async (req, res, next) => {
  try {
    const uid = await OdooService.getAdminUid();

    const users = await OdooService.searchRead(
      "res.users",
      [["id", "=", uid]],
      ["company_id"],
      1
    );

    const company = await OdooService.read(
      "res.company",
      [users[0].company_id[0]],
      [
        "name",
        "email",
        "phone",
        "website",
        "partner_id",
      ]
    );

    res.json({
      success: true,
      data: company[0],
    });

  } catch (err) {
    next(err);
  }
};