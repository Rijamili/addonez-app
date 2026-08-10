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

  const tenant = TenantDirectory.findById(tenantId);
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
  const tenant = TenantDirectory.findById(tenantId);
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

  const tenant = TenantDirectory.findById(tenantId);
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



// DELETE /api/admin/tenants/:tenantId
// Irreversible, so this requires the caller to send { confirm: true } in
// the body — a bare DELETE with no body is easy to fire accidentally
// (e.g. a stray retry, a copy-pasted curl command), and there's no undo
// once a tenant's row and its TenantUser rows are gone.
const deleteTenant = async (req, res) => {
  const { tenantId } = req.params;

  const tenant = TenantDirectory.findById(tenantId);
  if (!tenant) return error(res, `Tenant "${tenantId}" not found.`, 404);

  if (req.body?.confirm !== true) {
    return error(
      res,
      `This will permanently delete tenant "${tenantId}" (${tenant.name}) and all ${tenant.users.length} user(s) registered to it. Resend with { "confirm": true } to proceed.`,
      400
    );
  }

  try {
    await TenantDirectory.removeTenant(tenantId);
    return success(res, null, `Tenant "${tenantId}" deleted.`);
  } catch (err) {
    return error(res, err.message, 409);
  }
};

// GET /api/admin/tenants
const listTenants = async (req, res) => {
  return success(res, TenantDirectory.list());
};

// TEMPORARY diagnostic — GET /api/admin/debug/user-fields
// Queries Odoo's own metadata to find every field on res.users whose
// technical name contains "group", so we can find whatever "groups_id"
// got renamed to in this Odoo version (confirmed: it's not "groups_id"
// on this install — raises KeyError/Invalid field). Remove this route
// once OdooService.getUserByEmail() is updated with the real name.
const debugUserFields = async (req, res) => {
  try {
    const fields = await odoo.searchRead(
      "ir.model.fields",
      [["model", "=", "res.users"], ["name", "like", "group"]],
      ["name", "field_description", "ttype", "relation"],
      50
    );
    return success(res, fields);
  } catch (err) {
    return error(res, "Failed to look up fields: " + err.message, 500);
  }
};

// TEMPORARY diagnostic — GET /api/admin/debug/product-fields
// Confirms, against REAL Odoo metadata rather than a guess, whether this
// instance still uses the legacy `type='product'` selection value or
// the Odoo 17+ `is_storable` boolean split — so manufacturingController's
// storable-product filter (see storableProductDomain()) can be verified
// instead of assumed. Remove once confirmed and no longer needed.
const debugProductFields = async (req, res) => {
  const result = { fieldMetadata: null, typeProbe: null, isStorableProbe: null };

  try {
    result.fieldMetadata = await odoo.searchRead(
      "ir.model.fields",
      [["model", "=", "product.product"], ["name", "in", ["type", "is_storable", "detailed_type"]]],
      ["name", "field_description", "ttype", "selection"],
      10
    );
  } catch (err) {
    result.fieldMetadata = { error: err.message };
  }

  // Independent probes — each caught separately so one missing field
  // doesn't hide whether the OTHER one works.
  try {
    result.typeProbe = await odoo.searchRead("product.product", [], ["name", "type"], 3);
  } catch (err) {
    result.typeProbe = { error: err.message };
  }

  try {
    result.isStorableProbe = await odoo.searchRead("product.product", [], ["name", "is_storable"], 3);
  } catch (err) {
    result.isStorableProbe = { error: err.message };
  }

  return success(res, result);
};

// TEMPORARY diagnostic — GET /api/admin/debug/module-search?q=timesheet
// Finds every ir.module.module whose name OR display name matches the
// search term, with its install state. Use this whenever a module isn't
// showing up as expected in the drawer, instead of assuming the
// "standard" Odoo technical name is actually what this instance uses —
// we already got burned once assuming product.product's "type" field
// worked the standard way on this Odoo 19 build when it didn't.
const debugModuleSearch = async (req, res) => {
  const q = req.query.q || "";
  if (!q) return error(res, "Pass ?q=searchterm", 400);

  try {
    const modules = await odoo.searchRead(
      "ir.module.module",
      ["|", ["name", "ilike", q], ["shortdesc", "ilike", q]],
      ["name", "shortdesc", "state"],
      50
    );
    return success(res, modules);
  } catch (err) {
    return error(res, "Module search failed: " + err.message, 500);
  }
};

// TEMPORARY diagnostic — GET /api/admin/debug/action-info?ids=648,633
// Odoo's URL bar shows the numeric action id (e.g. ".../action-648") for
// whatever screen is open. This resolves that id to the actual
// ir.actions.act_window record — its res_model tells us exactly which
// Odoo model backs that screen. Needed for bespoke/custom modules (like
// a client-specific "Outlet Management" app) where there's no public
// documentation to reason from, unlike standard Odoo apps.
const debugActionInfo = async (req, res) => {
  const idsParam = req.query.ids || "";
  const ids = idsParam.split(",").map((s) => parseInt(s.trim(), 10)).filter(Boolean);
  if (!ids.length) return error(res, "Pass ?ids=648,633 (comma-separated action ids from the URL bar).", 400);

  try {
    // ir.actions.actions is the polymorphic base table EVERY action type
    // inherits from (window actions, client actions, server actions,
    // reports...) and shares the same id space with. Checking this
    // FIRST — rather than assuming ir.actions.act_window — is what lets
    // this diagnostic find a custom/bespoke screen (a client action,
    // which has no res_model at all) instead of silently missing it.
    const baseActions = await odoo.searchRead(
      "ir.actions.actions",
      [["id", "in", ids]],
      ["id", "name", "type"],
      ids.length
    );

    const windowActionIds = baseActions.filter((a) => a.type === "ir.actions.act_window").map((a) => a.id);
    const clientActionIds = baseActions.filter((a) => a.type === "ir.actions.client").map((a) => a.id);

    let windowDetails = [];
    if (windowActionIds.length) {
      windowDetails = await odoo.searchRead(
        "ir.actions.act_window",
        [["id", "in", windowActionIds]],
        ["id", "name", "res_model", "view_mode", "domain"],
        windowActionIds.length
      );
    }

    let clientDetails = [];
    if (clientActionIds.length) {
      // Client actions are custom JS/OWL screens (like a bespoke
      // dashboard) — they have a "tag" identifying the frontend
      // component, and often NO res_model at all, since they render
      // their own UI rather than a standard list/form view.
      clientDetails = await odoo.searchRead(
        "ir.actions.client",
        [["id", "in", clientActionIds]],
        ["id", "name", "tag", "params"],
        clientActionIds.length
      );
    }

    const foundIds = new Set(baseActions.map((a) => a.id));
    const notFound = ids.filter((id) => !foundIds.has(id));

    // Pull the field list for every distinct model actually found, so
    // we know what data is available without a second round trip.
    const modelNames = [...new Set(windowDetails.map((a) => a.res_model).filter(Boolean))];
    const fieldsByModel = {};
    for (const model of modelNames) {
      try {
        const fields = await odoo.searchRead(
          "ir.model.fields",
          [["model", "=", model]],
          ["name", "field_description", "ttype"],
          200
        );
        fieldsByModel[model] = fields;
      } catch (e) {
        fieldsByModel[model] = { error: e.message };
      }
    }

    return success(res, {
      // Sanity-check this against what you expected — if an id's `name`
      // here doesn't match the screen you were actually looking at, the
      // id you copied from the URL doesn't match this id space the way
      // we assumed, and needs re-checking rather than trusting res_model blindly.
      windowActions: windowDetails,
      clientActions: clientDetails,
      notFound, // any ids that matched NEITHER type, or don't exist at all
      fieldsByModel,
    });
  } catch (err) {
    return error(res, "Action lookup failed: " + err.message, 500);
  }
};

module.exports = { createTenant, updateTenant, deleteTenant, addUser, removeUser, listTenants, debugUserFields, debugProductFields, debugModuleSearch, debugActionInfo };