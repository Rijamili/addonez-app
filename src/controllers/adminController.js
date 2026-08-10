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
      // The raw base-table info for every id you asked about — its real
      // name and its actual action `type`. This is what tells you
      // whether an id is a normal window action, a custom client
      // action, or something else (server action, report, etc.) that
      // this diagnostic doesn't have specialized handling for yet.
      baseActions,
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

// FAST PATH — GET /api/admin/debug/model-search?q=daily
// Searches Odoo's own model registry (ir.model) directly for anything
// whose technical name or description matches — no action-id lookup
// needed at all. Much more reliable than chasing action ids through
// ir.actions.actions when those keep resolving to unrelated built-in
// Odoo features.
const debugModelSearch = async (req, res) => {
  const q = req.query.q || "";
  if (!q) return error(res, "Pass ?q=daily (or outlet, settlement, etc.)", 400);

  try {
    const models = await odoo.searchRead(
      "ir.model",
      ["|", ["model", "ilike", q], ["name", "ilike", q]],
      ["model", "name"],
      50
    );

    // Immediately pull the field list for every match too, in one call.
    const fieldsByModel = {};
    for (const m of models) {
      try {
        const fields = await odoo.searchRead(
          "ir.model.fields",
          [["model", "=", m.model]],
          ["name", "field_description", "ttype"],
          200
        );
        fieldsByModel[m.model] = fields;
      } catch (e) {
        fieldsByModel[m.model] = { error: e.message };
      }
    }

    return success(res, { models, fieldsByModel });
  } catch (err) {
    return error(res, "Model search failed: " + err.message, 500);
  }
};

// MOST RELIABLE PATH — GET /api/admin/debug/menu-search?q=Daily Data Entry
// Searches ir.ui.menu by the exact label shown in the app's own menu,
// then follows that menu item's direct `action` link to resolve the
// real model. This is authoritative — a menu's action link is exactly
// what Odoo itself uses to open that screen, so there's no ambiguity
// left over from guessing keywords or trusting a URL's action id (which
// can point somewhere unexpected, as we found out the hard way).
const debugMenuSearch = async (req, res) => {
  const q = req.query.q || "";
  if (!q) return error(res, "Pass ?q=Daily Data Entry (the exact label from the app's menu)", 400);

  try {
    const menus = await odoo.searchRead(
      "ir.ui.menu",
      [["name", "ilike", q]],
      ["id", "name", "complete_name", "action"],
      50
    );

    const resolved = [];
    for (const menu of menus) {
      if (!menu.action) {
        resolved.push({ menuId: menu.id, menuName: menu.name, path: menu.complete_name, note: "This menu item has no direct action (likely a parent/folder menu, not a clickable screen)." });
        continue;
      }

      // Odoo returns ir.ui.menu.action as a reference string like
      // "ir.actions.act_window,633" — model name, comma, id.
      const [actionModel, actionIdStr] = String(menu.action).split(",");
      const actionId = parseInt(actionIdStr, 10);
      const entry = { menuId: menu.id, menuName: menu.name, path: menu.complete_name, actionRef: menu.action };

      if (actionModel === "ir.actions.act_window" && actionId) {
        try {
          const details = await odoo.searchRead(actionModel, [["id", "=", actionId]], ["res_model", "name"], 1);
          entry.resModel = details[0]?.res_model || null;
          if (entry.resModel) {
            try {
              entry.fields = await odoo.searchRead(
                "ir.model.fields",
                [["model", "=", entry.resModel]],
                ["name", "field_description", "ttype"],
                200
              );
            } catch (e) {
              entry.fields = { error: e.message };
            }
          }
        } catch (e) {
          entry.error = e.message;
        }
      } else {
        entry.note = `This is a "${actionModel}" action, not a standard window action — needs different handling.`;
      }

      resolved.push(entry);
    }

    return success(res, resolved);
  } catch (err) {
    return error(res, "Menu search failed: " + err.message, 500);
  }
};

// MOST RELIABLE PATH — GET /api/admin/debug/custom-modules
// Lists every installed module whose author ISN'T Odoo itself — a
// bespoke/custom module like "Outlet Management" always has a distinct
// vendor, so this finds it directly without any keyword-matching risk
// (menu names, model names, and action ids have all proven unreliable
// so far on this instance for reasons that aren't fully clear remotely
// — possibly multi-company visibility rules or translations).
const debugCustomModules = async (req, res) => {
  try {
    const modules = await odoo.searchRead(
      "ir.module.module",
      [
        ["state", "=", "installed"],
        "!", ["author", "ilike", "Odoo"],
      ],
      ["name", "shortdesc", "author", "state"],
      100
    );
    return success(res, modules);
  } catch (err) {
    return error(res, "Custom module search failed: " + err.message, 500);
  }
};

// FOLLOW-UP — GET /api/admin/debug/module-models?module=<technical_name>
// Once you have a module's real technical name (from debugCustomModules
// above), this lists EVERY model that module actually defines, via
// ir.model.data — the definitive record of what a module ships,
// independent of menu labels or action ids entirely.
const debugModuleModels = async (req, res) => {
  const moduleName = req.query.module;
  if (!moduleName) return error(res, "Pass ?module=<technical_name> from debugCustomModules first.", 400);

  try {
    const modelData = await odoo.searchRead(
      "ir.model.data",
      [["module", "=", moduleName], ["model", "=", "ir.model"]],
      ["name", "res_id"],
      200
    );

    const modelIds = modelData.map((d) => d.res_id);
    let models = [];
    if (modelIds.length) {
      models = await odoo.searchRead("ir.model", [["id", "in", modelIds]], ["id", "model", "name"], modelIds.length);
    }

    const fieldsByModel = {};
    for (const m of models) {
      try {
        const fields = await odoo.searchRead(
          "ir.model.fields",
          [["model", "=", m.model]],
          ["name", "field_description", "ttype"],
          200
        );
        fieldsByModel[m.model] = fields;
      } catch (e) {
        fieldsByModel[m.model] = { error: e.message };
      }
    }

    return success(res, { models, fieldsByModel });
  } catch (err) {
    return error(res, "Module model lookup failed: " + err.message, 500);
  }
};

// STUDIO CHECK — GET /api/admin/debug/studio-models
// Odoo Studio-built apps don't appear as a distinct module with a
// custom author (they bundle into a generic "studio_customization"
// module) — but every model Studio creates is always prefixed "x_",
// so this finds them directly regardless of module metadata.
const debugStudioModels = async (req, res) => {
  try {
    const allModels = await odoo.searchRead("ir.model", [], ["id", "model", "name"], 5000);
    const studioModels = allModels.filter((m) => m.model.startsWith("x_"));

    const fieldsByModel = {};
    for (const m of studioModels) {
      try {
        const fields = await odoo.searchRead(
          "ir.model.fields",
          [["model", "=", m.model]],
          ["name", "field_description", "ttype"],
          200
        );
        fieldsByModel[m.model] = fields;
      } catch (e) {
        fieldsByModel[m.model] = { error: e.message };
      }
    }

    return success(res, { studioModels, fieldsByModel });
  } catch (err) {
    return error(res, "Studio model search failed: " + err.message, 500);
  }
};

// TEMPORARY diagnostic — GET /api/admin/debug/company-filter-test
// Compares sale.order visibility WITH vs WITHOUT the allowed_company_ids
// context restriction that OdooService.execute applies on every call.
// If "withoutCompanyFilter" finds real orders but "withCompanyFilter"
// doesn't, that context key isn't working the way we assumed for this
// tenant/account, and we need a different multi-company mechanism.
const debugCompanyFilterTest = async (req, res) => {
  try {
    const withCompanyFilter = await odoo.searchCount("sale.order", []);
    const withoutCompanyFilter = await requestContext.run(
      req.tenant,
      () => odoo.searchCount("sale.order", []),
      { companyIds: null }
    );
    // Third test: maybe Odoo's record rule behaves differently when
    // given ALL 15 allowed companies at once vs just the account's own
    // single default company — worth ruling in or out directly.
    const ownUser = await odoo.searchRead("res.users", [["id", "=", req.user.uid]], ["company_id"], 1);
    const defaultCompanyId = ownUser[0]?.company_id?.[0] || null;
    let withSingleDefaultCompany = null;
    if (defaultCompanyId) {
      withSingleDefaultCompany = await requestContext.run(
        req.tenant,
        () => odoo.searchCount("sale.order", []),
        { companyIds: [defaultCompanyId] }
      );
    }

    return success(res, {
      companyIdsInEffect: req.user.companyIds,
      defaultCompanyId,
      withCompanyFilter,
      withoutCompanyFilter,
      withSingleDefaultCompany,
    });
  } catch (err) {
    return error(res, "Comparison failed: " + err.message, 500);
  }
};

// TEMPORARY diagnostic — GET /api/admin/debug/database-check
// If sale.order search_count returns 0 via API but real orders are
// visible in the browser for the SAME account, one strong possibility
// is that our tenant config's database name doesn't match whichever
// database the browser session actually landed on. This lists every
// database Odoo's common endpoint knows about (if db.list() isn't
// disabled) alongside our configured one, plus a sanity check against
// a record we KNOW should exist if we're on the right database: the
// currently authenticated user's own res.users record.
const debugDatabaseCheck = async (req, res) => {
  const result = { configuredDb: null, availableDatabases: null, ownUserRecordFound: null };

  try {
    result.configuredDb = await odoo.getConfiguredDb();
  } catch (err) {
    result.configuredDb = { error: err.message };
  }

  try {
    result.availableDatabases = await odoo.listDatabases();
  } catch (err) {
    result.availableDatabases = { error: err.message };
  }

  try {
    // If we're on the right database, this MUST find something — it's
    // literally the account making this very request.
    const ownUser = await odoo.searchRead("res.users", [["id", "=", req.user.uid]], ["id", "name", "login"], 1);
    result.ownUserRecordFound = ownUser[0] || null;
  } catch (err) {
    result.ownUserRecordFound = { error: err.message };
  }

  try {
    // Two independent sanity checks: res.partner (contacts) almost
    // certainly has MANY records on any real database, so if this is
    // also 0, we're not on a "sale.order is specially restricted"
    // situation — we're on an empty/wrong database entirely. The
    // sale.order recount here is just for a clean side-by-side compare
    // in one response.
    result.totalContacts = await odoo.searchCount("res.partner", []);
    result.totalSaleOrders = await odoo.searchCount("sale.order", []);
  } catch (err) {
    result.sanityCheckError = err.message;
  }

  return success(res, result);
};

// TEMPORARY diagnostic — GET /api/admin/debug/model-rules?model=sale.order
// Reads the ACTUAL ir.rule records Odoo applies to a model, directly —
// after ruling out company scoping and access-tier as explanations for
// a silent 0-results mystery, this shows the real restriction logic
// instead of continuing to guess at it through black-box testing.
const debugModelRules = async (req, res) => {
  const model = req.query.model || "sale.order";
  try {
    const modelRecord = await odoo.searchRead("ir.model", [["model", "=", model]], ["id"], 1);
    if (!modelRecord.length) return error(res, `Model "${model}" not found.`, 404);

    const rules = await odoo.searchRead(
      "ir.rule",
      [["model_id", "=", modelRecord[0].id]],
      ["name", "domain_force", "groups", "active", "perm_read", "perm_write", "perm_create", "perm_unlink"],
      100
    );

    // Also resolve which groups the current account actually belongs
    // to among the ones referenced by these rules — tells us directly
    // whether a restrictive rule applies to THIS account or not.
    const allGroupIds = [...new Set(rules.flatMap((r) => r.groups || []))];
    let myGroupMemberships = {};
    for (const groupId of allGroupIds) {
      try {
        const groupRec = await odoo.searchRead("res.groups", [["id", "=", groupId]], ["name", "full_name"], 1);
        const isMember = await odoo.searchCount("res.groups", [["id", "=", groupId], ["users", "in", [req.user.uid]]]);
        myGroupMemberships[groupId] = { name: groupRec[0]?.full_name || groupRec[0]?.name, isMember: !!isMember };
      } catch (e) {
        myGroupMemberships[groupId] = { error: e.message };
      }
    }

    return success(res, { model, rules, myGroupMemberships });
  } catch (err) {
    return error(res, `Rule lookup failed: ${err.message}`, 500);
  }
};

module.exports = { createTenant, updateTenant, deleteTenant, addUser, removeUser, listTenants, debugUserFields, debugProductFields, debugModuleSearch, debugActionInfo, debugModelSearch, debugMenuSearch, debugCustomModules, debugModuleModels, debugStudioModels, debugCompanyFilterTest, debugDatabaseCheck, debugModelRules };