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
    this._config        = null;
    this._lastLoaded    = null;
    this._loadingPromise = null; // shared in-flight load, not just a boolean flag
    this._clients        = null;
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
  loadFromOdoo() {
    // If a load is already in flight, every caller gets the SAME promise
    // and waits for the real result — instead of the old approach of
    // sleeping 500ms and returning whatever _config happened to be at that
    // moment, which could still be null if the first load hadn't finished
    // yet. That gap is what caused "Cannot read properties of null
    // (reading 'odoo')" whenever several requests hit a cold start at once
    // (e.g. profit-and-loss and cash-flow both firing parallel Odoo calls).
    if (this._loadingPromise) {
      return this._loadingPromise;
    }

    this._loadingPromise = this._doLoad().finally(() => {
      this._loadingPromise = null;
    });

    return this._loadingPromise;
  }

  async _doLoad() {
    // No legacy Odoo configured at all — that's fine now. This service is
    // only used as a fallback for requests with no tenant context, which
    // real (tenant-scoped) traffic never hits.
    if (!bootstrap.odoo.host) {
      this._config = null;
      throw new Error("No legacy default Odoo configured (BOOTSTRAP_ODOO_* not set).");
    }

    try {
      console.log("🔄 Loading legacy default config from Odoo System Parameters...");
      const uid     = await this._bootstrapAuth();
      const { models } = this._buildBootstrapClients();

      const [host, db, username, password, sslStr] = await Promise.all([
        this._readParam(models, uid, "app.odoo.host"),
        this._readParam(models, uid, "app.odoo.db"),
        this._readParam(models, uid, "app.odoo.username"),
        this._readParam(models, uid, "app.odoo.password"),
        this._readParam(models, uid, "app.odoo.ssl"),
      ]);

      this._config = {
        odoo: {
          host:     host     || bootstrap.odoo.host,
          db:       db       || bootstrap.odoo.db,
          username: username || bootstrap.odoo.username,
          password: password || bootstrap.odoo.password,
          ssl:      sslStr !== null ? sslStr !== "false" : bootstrap.odoo.ssl,
          port:     443,
        },
      };

      this._lastLoaded = Date.now();
      console.log(`✅ Legacy config loaded from Odoo → ${this._config.odoo.host} / ${this._config.odoo.db}`);
      return this._config;

    } catch (err) {
      console.error("❌ Failed to load legacy config from Odoo:", err.message);

      if (this._config) {
        console.warn("⚠️  Using cached legacy config from last successful load.");
        return this._config;
      }

      console.warn("⚠️  Falling back to bootstrap values for legacy config.");
      this._config = { odoo: { ...bootstrap.odoo } };
      return this._config;
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
}

// Singleton
module.exports = new OdooConfigService();