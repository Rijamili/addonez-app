const OdooService = require("../config/OdooService");
const requestContext = require("../config/requestContext");

exports.getERPPreferences = async (req, res, next) => {
  try {
    const tenant = requestContext.getTenant();

    const version = await OdooService.searchRead(
      "ir.module.module",
      [["name", "=", "base"]],
      ["latest_version"],
      1
    );

    const ping = await OdooService.ping();

    res.json({
      success: true,
      data: {
        erpName: "Addonez ERP",
        version: version[0]?.latest_version || "Unknown",
        database: tenant?.odoo?.db || ping.db,
        server: ping.host,
        connected: ping.connected,
        language: "English",
        timezone: "Asia/Kolkata"
      }
    });

  } catch (err) {
    next(err);
  }
};
