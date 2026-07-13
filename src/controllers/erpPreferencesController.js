const OdooService = require("../config/OdooService");

exports.getERPPreferences = async (req, res, next) => {
  try {
    // Check Odoo connection
    const ping = await OdooService.ping();

    // Odoo Version
    const version = await OdooService.searchRead(
      "ir.module.module",
      [["name", "=", "base"]],
      ["latest_version"],
      1
    );

    // Current logged-in user
    const uid = await OdooService.getAdminUid();

    const users = await OdooService.searchRead(
      "res.users",
      [["id", "=", uid]],
      [
        "company_id",
        "lang",
        "tz",
        "partner_id",
        "login",
      ],
      1
    );

    const user = users[0];

    // Company details
    const company = await OdooService.read(
      "res.company",
      [user.company_id[0]],
      [
        "name",
        "email",
        "phone",
        "website",
        "currency_id",
        "country_id",
      ]
    );

    const c = company[0];

    res.json({
      success: true,
      data: {
        companyName: c.name,
        companyEmail: c.email,
        companyPhone: c.phone,
        website: c.website,
        currency: c.currency_id?.[1],
        country: c.country_id?.[1],
        language: user.lang,
        timezone: user.tz,
        database: ping.db,
        server: ping.host,
        version: version[0]?.latest_version,
        connected: ping.connected,
      },
    });
  } catch (err) {
    next(err);
  }
};