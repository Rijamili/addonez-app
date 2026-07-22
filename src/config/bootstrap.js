// src/config/bootstrap.js
// Server + JWT settings, read directly from environment variables.
// BOOTSTRAP_ODOO_* is now OPTIONAL — it only powers the legacy single-tenant
// fallback (OdooConfigService), which real tenant traffic never touches
// anymore now that every login is routed through tenants.json. The server
// no longer refuses to start if it's missing.

const bootstrap = {
  odoo: {
    host:     process.env.BOOTSTRAP_ODOO_HOST || null,
    db:       process.env.BOOTSTRAP_ODOO_DB || null,
    username: process.env.BOOTSTRAP_ODOO_USERNAME || null,
    password: process.env.BOOTSTRAP_ODOO_PASSWORD || null,
    ssl:      process.env.BOOTSTRAP_ODOO_SSL !== "false",
    port:     parseInt(process.env.BOOTSTRAP_ODOO_PORT || "443"),
  },
  jwt: {
    secret:    process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "90d",
  },
  server: {
    port:            parseInt(process.env.PORT || "5000"),
    nodeEnv:         process.env.NODE_ENV || "development",
    isProd:          process.env.NODE_ENV === "production",
    refreshInterval: parseInt(process.env.CONFIG_REFRESH_INTERVAL || "300000"),
  },
};

const validateBootstrap = () => {
  // JWT_SECRET is the one thing that's truly required — without it, no
  // login token issued by this server can be trusted.
  if (!bootstrap.jwt.secret) {
    console.error("Missing required env var: JWT_SECRET");
    process.exit(1);
  }

  const hasLegacyOdoo = bootstrap.odoo.host && bootstrap.odoo.db && bootstrap.odoo.username && bootstrap.odoo.password;
  if (!hasLegacyOdoo) {
    console.warn("⚠️  BOOTSTRAP_ODOO_* not fully set — legacy default Odoo connection disabled. This is fine: all real logins are tenant-scoped via tenants.json.");
  }
};

module.exports = { bootstrap, validateBootstrap };
