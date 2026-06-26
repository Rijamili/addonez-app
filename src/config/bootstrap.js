// src/config/bootstrap.js
// Bootstrap credentials — ONLY used to read full config from Odoo System Parameters.
// Admin updates config inside Odoo, backend reads it automatically.

const bootstrap = {
  odoo: {
    host:     process.env.BOOTSTRAP_ODOO_HOST,
    db:       process.env.BOOTSTRAP_ODOO_DB,
    username: process.env.BOOTSTRAP_ODOO_USERNAME,
    password: process.env.BOOTSTRAP_ODOO_PASSWORD,
    ssl:      process.env.BOOTSTRAP_ODOO_SSL !== "false",
    port:     parseInt(process.env.BOOTSTRAP_ODOO_PORT || "443"),
  },
  server: {
    port:            parseInt(process.env.PORT || "5000"),
    nodeEnv:         process.env.NODE_ENV || "development",
    isProd:          process.env.NODE_ENV === "production",
    refreshInterval: parseInt(process.env.CONFIG_REFRESH_INTERVAL || "300000"),
  },
};

const validateBootstrap = () => {
  const required = ["BOOTSTRAP_ODOO_HOST","BOOTSTRAP_ODOO_DB","BOOTSTRAP_ODOO_USERNAME","BOOTSTRAP_ODOO_PASSWORD"];
  const missing  = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`Missing bootstrap env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
};

module.exports = { bootstrap, validateBootstrap };