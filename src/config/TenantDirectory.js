// src/config/TenantDirectory.js
// Loads tenants.json and resolves: "this email just logged in — which tenant?"

const Tenant = require("../models/Tenant");
const TenantUser = require("../models/TenantUser");

class TenantDirectory {
  constructor() {
    this._tenants = [];
    this._byEmail = new Map();
    this._byId    = new Map();
    this.load().catch(console.error);
  }

async load() {
  const tenants = await Tenant.findAll();

  this._tenants = [];
  this._byEmail = new Map();
  this._byId = new Map();

  for (const t of tenants) {

    const users = await TenantUser.findAll({
      where: {
        tenant_id: t.tenant_id,
      },
    });

    const tenant = {
      id: t.tenant_id,
      name: t.company_name,
      odoo: {
        host: t.host,
        db: t.database_name,
        port: t.port,
        ssl: t.ssl,
        adminUsername: t.admin_email,
        adminPassword: t.admin_password,
      },
      users: users.map(u => u.email),
    };

    this._tenants.push(tenant);

    this._byId.set(tenant.id, tenant);

    for (const email of tenant.users) {
      this._byEmail.set(email.toLowerCase(), tenant);
    }
  }

  console.log(`✅ Loaded ${this._tenants.length} tenants from PostgreSQL`);
}


  

  async addTenant({ id, name, odoo, users = [] }) {

  const exists = await Tenant.findOne({
    where: {
      tenant_id: id,
    },
  });

  if (exists) {
    throw new Error("Tenant already exists.");
  }

  const tenant = await Tenant.create({
    
    tenant_id: id,
    company_name: name,
    host: odoo.host,
    database_name: odoo.db,
    port: odoo.port || 443,
    ssl: odoo.ssl ?? true,
    admin_email: odoo.adminUsername,
    admin_password: odoo.adminPassword,
    status: true,
  });

  await this.load();

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
}
module.exports = new TenantDirectory();