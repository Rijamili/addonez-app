// src/services/OdooService.js
// ─────────────────────────────────────────────────────────────────────────────
// Core Odoo service — always uses LATEST config from OdooConfigService.
// Builds fresh XML-RPC clients whenever config changes.
// Admin changes config in Odoo → next request uses new config automatically.
// ─────────────────────────────────────────────────────────────────────────────

const xmlrpc           = require("xmlrpc");
const OdooConfigService = require("../config/OdooConfigService");

class OdooService {
  constructor() {
    this._adminUid    = null;
    this._lastAuth    = null;
    this._lastHost    = null; // Track host changes
    this._clients     = null;
    this.AUTH_TTL     = 25 * 60 * 1000; // 25 min session cache
  }

  // Build clients for a given config
  _buildClients(odooConfig) {
    const { host, port, ssl } = odooConfig;
    const opts   = { host, port };
    const create = (path) =>
      ssl
        ? xmlrpc.createSecureClient({ ...opts, path })
        : xmlrpc.createClient({ ...opts, path });
    return {
      common: create("/xmlrpc/2/common"),
      models: create("/xmlrpc/2/object"),
    };
  }

  // Get clients — rebuild if host changed (admin updated config)
  async _getClients() {
    const odooConfig = await OdooConfigService.getOdooConfig();
    if (!this._clients || this._lastHost !== odooConfig.host) {
      this._clients  = this._buildClients(odooConfig);
      this._lastHost = odooConfig.host;
      this._adminUid = null; // Force re-auth on host change
    }
    return { clients: this._clients, odooConfig };
  }

  // Authenticate as admin (cached, auto-refresh)
  async getAdminUid() {
    const now = Date.now();
    if (this._adminUid && this._lastAuth && (now - this._lastAuth) < this.AUTH_TTL) {
      return this._adminUid;
    }

    const { clients, odooConfig } = await this._getClients();
    const { db, username, password } = odooConfig;

    return new Promise((resolve, reject) => {
      clients.common.methodCall("authenticate", [db, username, password, {}], (err, uid) => {
        if (err || !uid) return reject(new Error("Odoo admin auth failed: " + (err?.message || "Invalid credentials")));
        this._adminUid = uid;
        this._lastAuth = Date.now();
        resolve(uid);
      });
    });
  }

  // Validate a specific user's email + password against Odoo
  async authenticateUser(email, password) {
    const { clients, odooConfig } = await this._getClients();
    const { db } = odooConfig;
    return new Promise((resolve, reject) => {
      clients.common.methodCall("authenticate", [db, email, password, {}], (err, uid) => {
        if (err)  return reject(new Error("Auth error: " + err.message));
        if (!uid) return reject(new Error("Invalid email or password."));
        resolve(uid);
      });
    });
  }

  // Execute any Odoo model method
  async execute(model, method, args = [], kwargs = {}) {
    const uid = await this.getAdminUid();
    const { clients, odooConfig } = await this._getClients();
    const { db, password } = odooConfig;

    return new Promise((resolve, reject) => {
      clients.models.methodCall(
        "execute_kw",
        [db, uid, password, model, method, args, kwargs],
        (err, result) => {
          if (err) {
            if (err.message?.includes("AccessDenied")) {
              this._adminUid = null;
              this._lastAuth = null;
            }
            return reject(new Error(`[${model}.${method}]: ${err.message}`));
          }
          resolve(result);
        }
      );
    });
  }

  // Convenience methods
  async searchRead(model, domain = [], fields = [], limit = 80, offset = 0) {
    return this.execute(model, "search_read", [domain], { fields, limit, offset });
  }

  async searchCount(model, domain = []) {
    return this.execute(model, "search_count", [domain]);
  }

  async read(model, ids, fields = []) {
    return this.execute(model, "read", [ids], { fields });
  }

  async getUserByEmail(email) {
    const users = await this.searchRead(
      "res.users",
      [["login", "=", email]],
      ["id", "name", "login", "groups_id", "partner_id"],
      1
    );
    return users[0] || null;
  }

  // Health check
  async ping() {
    try {
      const cfg = await OdooConfigService.getOdooConfig();
      await this.getAdminUid();
      return { connected: true, host: cfg.host, db: cfg.db };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }
}

module.exports = new OdooService();