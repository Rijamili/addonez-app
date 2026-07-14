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
  const tenants = await Tenant.findAll({
  raw: true,
});

console.log("=================================");
console.log("TENANTS FROM SEQUELIZE:");
console.log(tenants);
console.log("COUNT:", tenants.length);
console.log("=================================");

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
      users: [
  t.admin_email,
  ...users.map(u => u.email),
].filter(Boolean),
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

  if (!tenant) {
    throw new Error(`Tenant "${tenantId}" not found.`);
  }

  const key = email.trim().toLowerCase();

  const exists = await TenantUser.findOne({
    where: { email: key },
  });

  if (exists) {
    throw new Error(`Email "${key}" is already registered.`);
  }

  await TenantUser.create({
    tenant_id: tenantId,
    email: key,
  });

  await this.load();

  return this._byId.get(tenantId);
}

  async removeUserEmail(tenantId, email) {
  const key = email.trim().toLowerCase();

  await TenantUser.destroy({
    where: {
      tenant_id: tenantId,
      email: key,
    },
  });

  await this.load();

  return this._byId.get(tenantId);
}

  // Partial update — only overwrites the fields actually passed in.
  // e.g. updateTenant("addonez-live", { odoo: { adminPassword: "new" } })
  // changes just the password, leaving host/db/everything else untouched.
 async updateTenant(tenantId, { name, odoo } = {}) {
  const tenant = await Tenant.findOne({
    where: {
      tenant_id: tenantId,
    },
  });

  if (!tenant) {
    throw new Error(`Tenant "${tenantId}" not found.`);
  }

  const updateData = {};

  if (name) updateData.company_name = name;

  if (odoo) {
    if (odoo.host) updateData.host = odoo.host;
    if (odoo.db) updateData.database_name = odoo.db;
    if (odoo.port) updateData.port = odoo.port;
    if (odoo.ssl !== undefined) updateData.ssl = odoo.ssl;
    if (odoo.adminUsername) updateData.admin_email = odoo.adminUsername;
    if (odoo.adminPassword) updateData.admin_password = odoo.adminPassword;
  }

  await tenant.update(updateData);

  await this.load();

  return this._byId.get(tenantId);
}
  findByEmail(email) {
  if (!email) return null;

  return this._byEmail.get(email.trim().toLowerCase()) || null;
}

findById(id) {
  return this._byId.get(id) || null;
}

list() {
  return this._tenants;
}

async reload() {
  await this.load();
  return this._tenants;
}
}
module.exports = new TenantDirectory();