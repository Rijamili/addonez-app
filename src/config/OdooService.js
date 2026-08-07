// src/config/OdooService.js
// Multi-tenant. Same public API as before (odoo.searchRead, odoo.execute, ...)
// so no controller needs to change — it reads the active tenant from
// requestContext and keeps a separate connection/admin session per tenant.

const xmlrpc            = require("xmlrpc");
const OdooConfigService = require("./OdooConfigService");
const requestContext    = require("./requestContext");

const AUTH_TTL = 25 * 60 * 1000;

class OdooService {
  constructor() {
    this._clientsByTenant = new Map();
    this._adminAuthByTenant = new Map();
  }

  async _resolveActiveConfig() {
    const tenant = requestContext.getTenant();
    if (tenant) return { key: `tenant:${tenant.id}`, odooConfig: tenant.odoo };
    const cfg = await OdooConfigService.getOdooConfig();
    return { key: "legacy-default", odooConfig: cfg };
  }

  _buildClients(odooConfig) {
    const { host, port, ssl } = odooConfig;
    const opts = { host, port };
    const create = (path) =>
      ssl ? xmlrpc.createSecureClient({ ...opts, path }) : xmlrpc.createClient({ ...opts, path });
    return { common: create("/xmlrpc/2/common"), models: create("/xmlrpc/2/object") };
  }

  async _getClients() {
    const { key, odooConfig } = await this._resolveActiveConfig();
    console.log("Using tenant key:", key);
console.log("Host:", odooConfig.host);
console.log("Database:", odooConfig.db);
    
    
    if (!this._clientsByTenant.has(key)) {
      this._clientsByTenant.set(key, this._buildClients(odooConfig));
    }
    return { key, clients: this._clientsByTenant.get(key), odooConfig };
  }

  async getAdminUid() {
    const { key, clients, odooConfig } = await this._getClients();
    const cached = this._adminAuthByTenant.get(key);
    const now = Date.now();
    if (cached && (now - cached.lastAuth) < AUTH_TTL) return cached.uid;

    const db       = odooConfig.db;
    const username = odooConfig.adminUsername || odooConfig.username;
    const password = odooConfig.adminPassword || odooConfig.password;

    return new Promise((resolve, reject) => {
      clients.common.methodCall("authenticate", [db, username, password, {}], (err, uid) => {
        if (err || !uid) return reject(new Error("Odoo admin auth failed: " + (err?.message || "Invalid credentials")));
        this._adminAuthByTenant.set(key, { uid, lastAuth: Date.now() });
        resolve(uid);
      });
    });
  }

  async authenticateUser(email, password) {
    const { clients, odooConfig } = await this._getClients();
    const { db } = odooConfig;
    return new Promise((resolve, reject) => {
      clients.common.methodCall("authenticate", [db, email, password, {}], (err, uid) => {
        if (err) return reject(new Error("Auth error: " + err.message));
        if (!uid) return reject(new Error("Invalid email or password."));
        resolve(uid);
      });
    });
  }

  async execute(model, method, args = [], kwargs = {}) {
    const uid = await this.getAdminUid();
    const { key, clients, odooConfig } = await this._getClients();
    const db = odooConfig.db;
    const password = odooConfig.adminPassword || odooConfig.password;

    // We authenticate every Odoo call as the shared admin account (simpler,
    // fewer credentials to manage) — but that alone would mean every user
    // sees every company's data, which is wrong for multi-company tenants.
    // To fix that without switching accounts, we tell Odoo which companies
    // THIS specific logged-in user is actually allowed to see, via
    // `allowed_company_ids` in the call's context. Odoo's own record rules
    // then filter every query as if we'd logged in as that real user.
    const companyIds = requestContext.getCompanyIds();
    const finalKwargs = companyIds?.length
      ? {
          ...kwargs,
          context: { ...(kwargs.context || {}), allowed_company_ids: companyIds },
        }
      : kwargs;

    return new Promise((resolve, reject) => {
      clients.models.methodCall(
  "execute_kw",
  [db, uid, password, model, method, args, finalKwargs],
  (err, result) => {
    if (err) {
      console.error("========== XML-RPC ERROR ==========");
      console.error("Model :", model);
      console.error("Method:", method);
      console.error("Args  :", JSON.stringify(args, null, 2));
      console.error("Error :", err);
      console.error("===================================");

      if (err.message?.includes("AccessDenied")) {
        this._adminAuthByTenant.delete(key);
      }

      return reject(new Error(`[${model}.${method}]: ${err.message}`));
    }

    resolve(result);
  }
);
    });
  }

  async searchRead(model, domain = [], fields = [], limit = 80, offset = 0, order = "") {
    const kwargs = { fields, limit, offset };
    if (order) kwargs.order = order;
    return this.execute(model, "search_read", [domain], kwargs);
  }

  async searchCount(model, domain = []) { return this.execute(model, "search_count", [domain]); }
  async read(model, ids, fields = []) { return this.execute(model, "read", [ids], { fields }); }

  async getUserByEmail(email) {
  // NOTE: this used to only fetch ["id", "name"], but authController and
  // modulesController both read user.login, user.partner_id, and
  // user.groups_id off the result — those were silently coming back as
  // undefined (no error, just missing data), which meant the JWT's
  // "email" field was always undefined and per-user Odoo group
  // permission checks had nothing to check against.
 const users = await this.searchRead(
  "res.users",
  [["login", "=", email]],
  [
    "id",
    "name",
    "login",
    "partner_id",
    // "groups_id" removed TEMPORARILY — this Odoo version (odoo19)
    // doesn't have a field by this name on res.users at all (raises
    // KeyError/Invalid field, which was crashing login entirely).
    // See /api/admin/debug/user-fields for the real field name, then
    // add it back here once confirmed.
    "company_id",
    "company_ids",
  ],
  1
);
  return users[0] || null;
}
  async ping() {
    try {
      const { odooConfig } = await this._getClients();
      await this.getAdminUid();
      return { connected: true, host: odooConfig.host, db: odooConfig.db };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }
}

module.exports = new OdooService();