// src/controllers/adminController.js
// Lets an admin add tenants and users via API calls instead of hand-editing
// tenants.json. Every write goes through TenantDirectory, which persists to
// disk atomically and reloads the in-memory directory immediately — no
// separate /reload-tenants call needed after using these endpoints.

const xmlrpc          = require("xmlrpc");
const TenantDirectory = require("../config/TenantDirectory");
const odoo            = require("../config/OdooService");
const requestContext  = require("../config/requestContext");
const { success, error } = require("../utils/response");

// Verify the given Odoo credentials actually work BEFORE we save anything.
// This is what turns "typo in the password" from a silent bad tenant into
// an immediate, clear error at creation time.
// const testOdooConnection = (odooConfig) => {
//   const { host, port = 443, ssl = true, db, adminUsername, adminPassword } = odooConfig;
//   const opts = { host, port };
//   const common = ssl
//     ? xmlrpc.createSecureClient({ ...opts, path: "/xmlrpc/2/common" })
//     : xmlrpc.createClient({ ...opts, path: "/xmlrpc/2/common" });

//   return new Promise((resolve, reject) => {
//     common.methodCall("authenticate", [db, adminUsername, adminPassword, {}], (err, uid) => {
//       if (err) return reject(new Error(`Could not reach Odoo: ${err.message}`));
//       if (!uid) return reject(new Error("Odoo rejected the admin credentials."));
//       resolve(uid);
//     });
//   });
// };
const testOdooConnection = (odooConfig) => {
  const {
    host,
    port = 443,
    ssl = true,
    db,
    adminUsername,
    adminPassword,
  } = odooConfig;

  console.log("===== TEST ODOO CONNECTION =====");
  console.log({
    host,
    port,
    ssl,
    db,
    adminUsername,
    adminPassword,
  });

  const opts = { host, port };

  const common = ssl
    ? xmlrpc.createSecureClient({ ...opts, path: "/xmlrpc/2/common" })
    : xmlrpc.createClient({ ...opts, path: "/xmlrpc/2/common" });

  return new Promise((resolve, reject) => {
    common.methodCall(
      "authenticate",
      [db, adminUsername, adminPassword, {}],
      (err, uid) => {
        console.log("XMLRPC ERROR:", err);
        console.log("XMLRPC UID:", uid);

        if (err) {
          return reject(new Error(`Could not reach Odoo: ${err.message}`));
        }

        if (!uid) {
          return reject(
            new Error("Odoo authenticate() returned false (uid = false).")
          );
        }

        resolve(uid);
      }
    );
  });
};

// POST /api/admin/tenants
// body: { id, name, odoo: { host, db, port?, ssl?, adminUsername, adminPassword }, users?: [email] }
const createTenant = async (req, res) => {
  const { id, name, odoo: odooConfig, users } = req.body;

  try {
    // Fail fast with a clear message instead of saving a broken tenant.
   console.log("Odoo Config:", odooConfig);
    await testOdooConnection(odooConfig);
  } catch (err) {
    return error(res, `Connection check failed — tenant was not saved. ${err.message}`, 422);
  }

  try {
    const tenant = await TenantDirectory.addTenant({ id, name, odoo: odooConfig, users });
    return success(res, {
      id: tenant.id, name: tenant.name, host: tenant.odoo.host, db: tenant.odoo.db, users: tenant.users,
    }, "Tenant created.", 201);
  } catch (err) {
    return error(res, err.message, 409);
  }
};

// POST /api/admin/tenants/:tenantId/users
// body: { email }
const addUser = async (req, res) => {
  const { tenantId } = req.params;
  const { email } = req.body;

  const tenant = TenantDirectory.getById(tenantId);
  if (!tenant) return error(res, `Tenant "${tenantId}" not found.`, 404);

  // Best-effort check: does this email already exist as an Odoo user on
  // this tenant? We don't block on failure (the customer's admin may add
  // the Odoo user right after this call) — we just warn in the response.
  let odooUserFound = null;
  try {
    odooUserFound = await requestContext.run(tenant, () => odoo.getUserByEmail(email));
  } catch {
    // Connection issue or similar — ignore, this is advisory only.
  }

  try {
    await TenantDirectory.addUserEmail(tenantId, email);
    return success(res, {
      tenantId,
      email: email.trim().toLowerCase(),
      odooUserExists: !!odooUserFound,
      warning: odooUserFound ? undefined : "No matching user found in this tenant's Odoo yet — create one before they try to log in.",
    }, "User added to tenant.", 201);
  } catch (err) {
    return error(res, err.message, 409);
  }
};

// DELETE /api/admin/tenants/:tenantId/users/:email
const removeUser = async (req, res) => {
  const { tenantId, email } = req.params;
  const tenant = TenantDirectory.getById(tenantId);
  if (!tenant) return error(res, `Tenant "${tenantId}" not found.`, 404);

  try {
    await TenantDirectory.removeUserEmail(tenantId, email);
    return success(res, null, "User removed from tenant.");
  } catch (err) {
    return error(res, err.message);
  }
};

// PATCH /api/admin/tenants/:tenantId
// body: { name?, odoo?: { host?, db?, port?, ssl?, adminUsername?, adminPassword? } }
// Only the fields you send are changed — everything else stays as-is.
const updateTenant = async (req, res) => {
  const { tenantId } = req.params;
  const { name, odoo: odooPatch } = req.body;

  const tenant = TenantDirectory.getById(tenantId);
  if (!tenant) return error(res, `Tenant "${tenantId}" not found.`, 404);

  // If any Odoo connection field is being changed, test the FULL merged
  // config (existing values + the patch) before saving — same safety net
  // as createTenant, so a typo'd new password doesn't silently break login
  // for every user on this tenant.
  if (odooPatch) {
    const mergedConfig = { ...tenant.odoo, ...odooPatch };
    try {
      await testOdooConnection(mergedConfig);
    } catch (err) {
      return error(res, `Connection check failed — tenant was not updated. ${err.message}`, 422);
    }
  }

  try {
    const updated = await TenantDirectory.updateTenant(tenantId, { name, odoo: odooPatch });
    return success(res, {
      id: updated.id, name: updated.name, host: updated.odoo.host, db: updated.odoo.db, users: updated.users,
    }, "Tenant updated.");
  } catch (err) {
    return error(res, err.message, 409);
  }
};

// POST /api/admin/tenants/:tenantId/domains
// body: { domain }  e.g. { "domain": "addonez.com" }
const addDomain = async (req, res) => {
  const { tenantId } = req.params;
  const { domain } = req.body;

  const tenant = TenantDirectory.getById(tenantId);
  if (!tenant) return error(res, `Tenant "${tenantId}" not found.`, 404);

  try {
    await TenantDirectory.addDomain(tenantId, domain);
    return success(res, { tenantId, domain: domain.trim().toLowerCase() },
      "Domain added — anyone with a valid Odoo account at this domain can now log in without being added individually.", 201);
  } catch (err) {
    return error(res, err.message, 409);
  }
};

// GET /api/admin/tenants
const listTenants = async (req, res) => {
  return success(res, TenantDirectory.list());
};

module.exports = { createTenant, updateTenant, addUser, removeUser, addDomain, listTenants };
