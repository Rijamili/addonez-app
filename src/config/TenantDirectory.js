// src/config/TenantDirectory.js
// Loads tenants.json and resolves: "this email just logged in — which tenant?"

const Tenant = require("../models/Tenant");
const TenantUser = require("../models/TenantUser");
const axios = require("axios");

// Auto-registers a tenant with the AI Insights service so no manual DB
// insert is needed on their side. Failure here does NOT block tenant
// creation — it's logged so it can be retried/fixed manually if needed.
async function registerWithAiInsights(id, name) {
  try {
    await axios.post(
      "https://insights-api.stage.addonez.com/api/admin/tenants/register",
      { erp_tenant_id: id, name },
      {
        headers: { "X-Admin-Key": process.env.AI_INSIGHTS_ADMIN_KEY },
        timeout: 5000,
      }
    );
    console.log(`✅ Registered tenant "${id}" with AI Insights`);
  } catch (err) {
    console.error(
      `⚠️  Failed to auto-register tenant "${id}" with AI Insights:`,
      err.message,
      "— will need manual mapping via their tenants.erp_tenant_id column."
    );
  }
}

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

  // Auto-register with AI Insights so no manual DB mapping is needed.
  registerWithAiInsights(id, name);

  // Return the reshaped in-memory tenant (nested { odoo: { host, db, ... } }
  // format), NOT the raw Sequelize row `tenant` — that only has flat
  // columns like tenant.host, not tenant.odoo.host, which is what every
  // caller of addTenant() (and every other TenantDirectory method)
  // actually expects. Returning the raw row here was crashing
  // createTenant() with "Cannot read properties of undefined (reading
  // 'host')" the moment it tried to read the created tenant back.
  return this.findById(id);
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

  // Deletes a tenant entirely — including every TenantUser row tied to
  // it first, since there's no DB-level cascade configured on that
  // foreign key and an orphaned tenant_users row would just be dead
  // weight (worse, a future tenant reusing the same tenant_id string
  // would inherit it). Irreversible — the caller (adminController) is
  // responsible for requiring explicit confirmation before calling this.
  async removeTenant(tenantId) {
  const tenant = await Tenant.findOne({
    where: { tenant_id: tenantId },
  });

  if (!tenant) {
    throw new Error(`Tenant "${tenantId}" not found.`);
  }

  await TenantUser.destroy({
    where: { tenant_id: tenantId },
  });

  await tenant.destroy();

  await this.load();

  return true;
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