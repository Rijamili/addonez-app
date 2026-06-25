// src/config/odooClient.js
// Odoo connection factory.
// Priority: request headers (set by app at login) > .env fallback.
// Zero backend changes needed when switching Odoo instances.

const xmlrpc = require("xmlrpc");

// ── Defaults from .env (used only if no headers sent) ────────────────────────
const DEFAULT_HOST = process.env.ODOO_HOST;
const DEFAULT_DB   = process.env.ODOO_DB;
const DEFAULT_USER = process.env.ODOO_USERNAME;
const DEFAULT_PASS = process.env.ODOO_PASSWORD;
const DEFAULT_SSL  = process.env.ODOO_SSL !== "false";

// ── Build xmlrpc clients for a given host ─────────────────────────────────────
const buildClients = (host, ssl = true) => {
  const opts = { host, port: ssl ? 443 : 8069 };
  const create = (path) =>
    ssl
      ? xmlrpc.createSecureClient({ ...opts, path })
      : xmlrpc.createClient({ ...opts, path });
  return {
    common: create("/xmlrpc/2/common"),
    models: create("/xmlrpc/2/object"),
  };
};

// ── Cached default clients (re-used when no headers present) ──────────────────
let _defaultClients = null;
const getDefaultClients = () => {
  if (!_defaultClients && DEFAULT_HOST) {
    _defaultClients = buildClients(DEFAULT_HOST, DEFAULT_SSL);
  }
  return _defaultClients;
};

// ── Resolve config: headers win, .env is fallback ────────────────────────────
const resolveConfig = (req) => {
  const host = (req && req.headers["x-odoo-host"]) || DEFAULT_HOST;
  const db   = (req && req.headers["x-odoo-db"])   || DEFAULT_DB;
  const user = (req && req.headers["x-odoo-user"]) || DEFAULT_USER;
  const pass = (req && req.headers["x-odoo-pass"]) || DEFAULT_PASS;

  if (!host || !db || !user || !pass) {
    throw new Error(
      "Odoo config missing. Provide x-odoo-host, x-odoo-db, x-odoo-user, x-odoo-pass headers — or set .env defaults."
    );
  }

  // Reuse cached clients if same host as default, else build fresh
  const clients =
    host === DEFAULT_HOST
      ? getDefaultClients()
      : buildClients(host, !host.startsWith("http://"));

  return { host, db, user, pass, ...clients };
};

// ── Core helpers ──────────────────────────────────────────────────────────────

/** Authenticate and return uid. Pass express `req` to use request headers. */
const authenticate = (req) =>
  new Promise((resolve, reject) => {
    const { common, db, user, pass } = resolveConfig(req);
    common.methodCall("authenticate", [db, user, pass, {}], (err, uid) => {
      if (err)  return reject(new Error("Odoo auth error: " + err.message));
      if (!uid) return reject(new Error("Invalid Odoo credentials."));
      resolve(uid);
    });
  });

/** Execute an Odoo model method. */
const execute = (req, uid, model, method, args = [], kwargs = {}) =>
  new Promise((resolve, reject) => {
    const { models, db, pass } = resolveConfig(req);
    models.methodCall(
      "execute_kw",
      [db, uid, pass, model, method, args, kwargs],
      (err, result) => {
        if (err) return reject(new Error(`Odoo execute error: ${err.message}`));
        resolve(result);
      }
    );
  });

/** Authenticate then execute in one call. */
const call = async (req, model, method, args = [], kwargs = {}) => {
  const uid = await authenticate(req);
  return execute(req, uid, model, method, args, kwargs);
};

module.exports = { resolveConfig, authenticate, execute, call };