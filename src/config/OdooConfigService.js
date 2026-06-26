// src/config/OdooConfigService.js
// ─────────────────────────────────────────────────────────────────────────────
// Reads ERP configuration FROM Odoo System Parameters (ir.config_parameter).
//
// HOW IT WORKS:
//   1. On startup: connect using bootstrap credentials
//   2. Read app.* keys from Odoo → Settings → Technical → System Parameters
//   3. Cache the config in memory
//   4. Auto-refresh every 5 minutes (configurable)
//   5. All other services use this config — never bootstrap directly
//
// ADMIN WORKFLOW (zero code changes):
//   Odoo → Settings → Technical → System Parameters
//   Update: app.odoo.host, app.odoo.db, app.odoo.username, app.odoo.password
//   Backend picks up new values on next refresh cycle automatically
// ─────────────────────────────────────────────────────────────────────────────

const xmlrpc    = require("xmlrpc");
const { bootstrap } = require("./bootstrap");

class OdooConfigService {
  constructor() {
    this._config      = null;
    this._lastLoaded  = null;
    this._loading     = false;
    this._clients     = null;
  }

  // Build bootstrap XML-RPC clients
  _buildBootstrapClients() {
    if (this._clients) return this._clients;
    const { host, port, ssl } = bootstrap.odoo;
    const opts   = { host, port };
    const create = (path) =>
      ssl
        ? xmlrpc.createSecureClient({ ...opts, path })
        : xmlrpc.createClient({ ...opts, path });
    this._clients = {
      common: create("/xmlrpc/2/common"),
      models: create("/xmlrpc/2/object"),
    };
    return this._clients;
  }

  // Authenticate with bootstrap credentials
  _bootstrapAuth() {
    const { common } = this._buildBootstrapClients();
    const { db, username, password } = bootstrap.odoo;
    return new Promise((resolve, reject) => {
      common.methodCall("authenticate", [db, username, password, {}], (err, uid) => {
        if (err || !uid) return reject(new Error("Bootstrap auth failed: " + (err?.message || "invalid credentials")));
        resolve(uid);
      });
    });
  }

  // Read a single system parameter from Odoo
  _readParam(models, uid, key) {
    const { db, password } = bootstrap.odoo;
    return new Promise((resolve) => {
      models.methodCall(
        "execute_kw",
        [db, uid, password, "ir.config_parameter", "get_param", [key], {}],
        (err, value) => resolve(err ? null : value || null)
      );
    });
  }

  // Load all config keys from Odoo System Parameters
  async loadFromOdoo() {
    if (this._loading) {
      // Wait if already loading
      await new Promise((r) => setTimeout(r, 500));
      return this._config;
    }

    this._loading = true;
    try {
      console.log("🔄 Loading config from Odoo System Parameters...");
      const uid     = await this._bootstrapAuth();
      const { models } = this._buildBootstrapClients();

      // Read all app config keys in parallel
      const [host, db, username, password, jwtSecret, jwtExpiry, sslStr] = await Promise.all([
        this._readParam(models, uid, "app.odoo.host"),
        this._readParam(models, uid, "app.odoo.db"),
        this._readParam(models, uid, "app.odoo.username"),
        this._readParam(models, uid, "app.odoo.password"),
        this._readParam(models, uid, "app.jwt.secret"),
        this._readParam(models, uid, "app.jwt.expiry"),
        this._readParam(models, uid, "app.odoo.ssl"),
      ]);

      // Fallback to bootstrap values if Odoo params not set yet
      this._config = {
        odoo: {
          host:     host     || bootstrap.odoo.host,
          db:       db       || bootstrap.odoo.db,
          username: username || bootstrap.odoo.username,
          password: password || bootstrap.odoo.password,
          ssl:      sslStr !== null ? sslStr !== "false" : bootstrap.odoo.ssl,
          port:     443,
        },
        jwt: {
          secret:    jwtSecret || process.env.JWT_SECRET || "fallback_secret_change_in_odoo",
          expiresIn: jwtExpiry  || "7d",
        },
      };

      this._lastLoaded = Date.now();
      console.log(`✅ Config loaded from Odoo → ${this._config.odoo.host} / ${this._config.odoo.db}`);
      return this._config;

    } catch (err) {
      console.error("❌ Failed to load config from Odoo:", err.message);

      // If we have a cached config, keep using it
      if (this._config) {
        console.warn("⚠️  Using cached config from last successful load.");
        return this._config;
      }

      // Last resort: use bootstrap values
      console.warn("⚠️  Falling back to bootstrap config.");
      this._config = {
        odoo: { ...bootstrap.odoo },
        jwt:  { secret: process.env.JWT_SECRET || "fallback_secret", expiresIn: "7d" },
      };
      return this._config;

    } finally {
      this._loading = false;
    }
  }

  // Get current config (load if not loaded or expired)
  async getConfig() {
    const now     = Date.now();
    const expired = !this._lastLoaded || (now - this._lastLoaded) > bootstrap.server.refreshInterval;

    if (!this._config || expired) {
      await this.loadFromOdoo();
    }
    return this._config;
  }

  // Force refresh (call after admin updates params in Odoo)
  async refresh() {
    this._lastLoaded = null;
    return this.loadFromOdoo();
  }

  // Get odoo config only
  async getOdooConfig() {
    const cfg = await this.getConfig();
    return cfg.odoo;
  }

  // Get jwt config only
  async getJwtConfig() {
    const cfg = await this.getConfig();
    return cfg.jwt;
  }
}

// Singleton
module.exports = new OdooConfigService();