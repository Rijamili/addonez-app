// src/config/TenantDirectory.js
// Loads tenants.json and resolves: "this email just logged in — which tenant?"

const fs   = require("fs");
const path = require("path");

const FILE_PATH = path.join(__dirname, "tenants.json");

class TenantDirectory {
  constructor() {
    this._tenants = [];
    this._byEmail = new Map();
    this._byId    = new Map();
    this.load();
  }

  load() {
    const raw = fs.readFileSync(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const tenants = Array.isArray(parsed.tenants) ? parsed.tenants : [];
    const byEmail  = new Map();
    const byDomain = new Map();
    const byId     = new Map();

    for (const tenant of tenants) {
      if (!tenant.id || !tenant.odoo?.host || !tenant.odoo?.db) {
        console.warn(`⚠️  Skipping malformed tenant entry: ${tenant.id || JSON.stringify(tenant)}`);
        continue;
      }
      byId.set(tenant.id, tenant);

      // Exact-email allowlist — still supported, useful for exceptions
      // (e.g. an external consultant using a personal email).
      for (const email of tenant.users || []) {
        const key = email.trim().toLowerCase();
        if (byEmail.has(key)) {
          console.warn(`⚠️  Email "${key}" registered under multiple tenants. Using first match.`);
          continue;
        }
        byEmail.set(key, tenant);
      }

      // Domain match — ANY email at this domain belongs to this tenant.
      // This is what lets a brand-new employee log in the first time
      // without you adding their email anywhere first.
      for (const domain of tenant.domains || []) {
        const key = domain.trim().toLowerCase();
        if (byDomain.has(key)) {
          console.warn(`⚠️  Domain "${key}" registered under multiple tenants. Using first match.`);
          continue;
        }
        byDomain.set(key, tenant);
      }
    }

    this._tenants  = tenants;
    this._byEmail  = byEmail;
    this._byDomain = byDomain;
    this._byId     = byId;
    console.log(`✅ Tenant directory loaded: ${tenants.length} tenant(s), ${byEmail.size} explicit user(s), ${byDomain.size} domain(s).`);
    return this._tenants;
  }

  reload() { return this.load(); }

  findByEmail(email) {
    if (!email) return null;
    const key = email.trim().toLowerCase();

    // 1. Exact email match wins first (explicit allowlist / exceptions).
    const exact = this._byEmail.get(key);
    if (exact) return exact;

    // 2. Fall back to domain match — "anyone@addonez.com" → addonez tenant.
    const domain = key.split("@")[1];
    return domain ? this._byDomain.get(domain) || null : null;
  }

  getById(tenantId) { return this._byId.get(tenantId) || null; }
  list() {
    return this._tenants.map((t) => ({
      id: t.id, name: t.name, host: t.odoo.host, db: t.odoo.db, userCount: (t.users || []).length,
    }));
  }

  // ── Write path ────────────────────────────────────────────────────────
  // Writes are serialised through this promise chain so two admin requests
  // arriving close together can't interleave and corrupt the file, and the
  // write itself is atomic (write to a temp file, then rename) so a crash
  // mid-write never leaves tenants.json half-written/unparseable.
  _writeQueue = Promise.resolve();

  _persist() {
    this._writeQueue = this._writeQueue.then(() => {
      const tmpPath = FILE_PATH + ".tmp";
      const data = JSON.stringify({ tenants: this._tenants }, null, 2);
      fs.writeFileSync(tmpPath, data, "utf8");
      fs.renameSync(tmpPath, FILE_PATH);
      this.load(); // rebuild in-memory maps from the freshly written file
    });
    return this._writeQueue;
  }

  async addTenant({ id, name, odoo, users = [] }) {
    if (!id || !name) throw new Error("Tenant requires an id and name.");
    if (!odoo?.host || !odoo?.db) throw new Error("Tenant requires odoo.host and odoo.db.");
    if (this._byId.has(id)) throw new Error(`Tenant id "${id}" already exists.`);

    const cleanEmails = users.map((e) => e.trim().toLowerCase());
    for (const email of cleanEmails) {
      if (this._byEmail.has(email)) {
        throw new Error(`Email "${email}" is already registered under another tenant.`);
      }
    }

    const tenant = {
      id,
      name,
      odoo: {
        host: odoo.host,
        db: odoo.db,
        port: odoo.port || 443,
        ssl: odoo.ssl !== false,
        adminUsername: odoo.adminUsername,
        adminPassword: odoo.adminPassword,
      },
      users: cleanEmails,
    };

    this._tenants.push(tenant);
    await this._persist();
    return tenant;
  }

  async addUserEmail(tenantId, email) {
    const tenant = this._byId.get(tenantId);
    if (!tenant) throw new Error(`Tenant "${tenantId}" not found.`);

    const key = email.trim().toLowerCase();
    if (this._byEmail.has(key)) {
      throw new Error(`Email "${key}" is already registered (tenant "${this._byEmail.get(key).id}").`);
    }

    tenant.users = tenant.users || [];
    tenant.users.push(key);
    await this._persist();
    return tenant;
  }

  async removeUserEmail(tenantId, email) {
    const tenant = this._byId.get(tenantId);
    if (!tenant) throw new Error(`Tenant "${tenantId}" not found.`);

    const key = email.trim().toLowerCase();
    tenant.users = (tenant.users || []).filter((e) => e !== key);
    await this._persist();
    return tenant;
  }

  // Partial update — only overwrites the fields actually passed in.
  // e.g. updateTenant("addonez-live", { odoo: { adminPassword: "new" } })
  // changes just the password, leaving host/db/everything else untouched.
  async updateTenant(tenantId, { name, odoo } = {}) {
    const tenant = this._byId.get(tenantId);
    if (!tenant) throw new Error(`Tenant "${tenantId}" not found.`);

    if (name) tenant.name = name;
    if (odoo) {
      tenant.odoo = {
        ...tenant.odoo,
        ...(odoo.host && { host: odoo.host }),
        ...(odoo.db && { db: odoo.db }),
        ...(odoo.port && { port: odoo.port }),
        ...(odoo.ssl !== undefined && { ssl: odoo.ssl }),
        ...(odoo.adminUsername && { adminUsername: odoo.adminUsername }),
        ...(odoo.adminPassword && { adminPassword: odoo.adminPassword }),
      };
    }

    await this._persist();
    return tenant;
  }

  // Registers a domain so ANY email at that domain auto-resolves to this
  // tenant on login, without adding each employee's email individually.
  async addDomain(tenantId, domain) {
    const tenant = this._byId.get(tenantId);
    if (!tenant) throw new Error(`Tenant "${tenantId}" not found.`);

    const key = domain.trim().toLowerCase();
    if (this._byDomain.has(key)) {
      throw new Error(`Domain "${key}" is already registered (tenant "${this._byDomain.get(key).id}").`);
    }

    tenant.domains = tenant.domains || [];
    tenant.domains.push(key);
    await this._persist();
    return tenant;
  }
}

module.exports = new TenantDirectory();