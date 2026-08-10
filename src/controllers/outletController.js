// src/controllers/outletController.js
//
// Fully generic custom-app browser — works for ANY tenant's bespoke
// Odoo module automatically. The only tenant-specific fact needed is
// the module's technical name (config/outletModuleConfig.js); every
// menu item, screen, field label, and value comes from live Odoo
// metadata, not hardcoded mappings. This trades away the specialized
// hand-crafted dashboard-with-KPI-cards look for genuine zero-config
// multi-tenancy — any new company's custom app "just works" the
// moment their module name is added to the config.

const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");
const { getModuleName, friendlyLabel } = require("../config/outletModuleConfig");

function requireModuleName(req) {
  const moduleName = getModuleName(req.tenant?.id);
  if (!moduleName) {
    throw Object.assign(new Error("This module isn't configured for your company yet."), { status: 403 });
  }
  return moduleName;
}

// System/mixin fields present on almost every Odoo model (mail.thread,
// mail.activity.mixin, base ORM fields) — these are never what a
// business user actually wants to see on a custom screen, so they're
// filtered out everywhere below. This is what lets field lists render
// cleanly without ever needing a per-tenant "which fields matter" list.
const SYSTEM_FIELD_PATTERNS = [
  /^id$/, /^display_name$/, /^__last_update$/,
  /^create_(uid|date)$/, /^write_(uid|date)$/,
  /^activity_/, /^message_/, /^website_message_ids$/, /^my_activity_/, /^has_message$/,
];
const isBusinessField = (fieldName) => !SYSTEM_FIELD_PATTERNS.some((p) => p.test(fieldName));

// Field types that render sensibly in a simple generic table. Complex
// relational collections (one2many/many2many lists of sub-records)
// aren't shown inline — they'd need their own dedicated sub-screen,
// which is exactly the kind of per-model customization this generic
// approach deliberately avoids.
const RENDERABLE_TYPES = ["char", "text", "integer", "float", "monetary", "boolean", "date", "datetime", "selection", "many2one"];

// GET /api/outlet/menu — builds the real menu tree for this tenant's
// custom module straight from Odoo's own ir.model.data + ir.ui.menu,
// instead of a hardcoded per-tenant menu structure.
exports.getMenu = async (req, res) => {
  try {
    const moduleName = requireModuleName(req);

    // Every menu ir.ui.menu record this module ships is registered in
    // ir.model.data with module=<technical name>, model='ir.ui.menu' —
    // this is the authoritative, version-independent way to find them.
    const menuData = await odoo.searchRead(
      "ir.model.data",
      [["module", "=", moduleName], ["model", "=", "ir.ui.menu"]],
      ["res_id"],
      500
    );
    const menuIds = menuData.map((d) => d.res_id);
    if (!menuIds.length) {
      return error(res, `No menus found for module "${moduleName}" — is it actually installed on this tenant's Odoo?`, 404);
    }

    const menus = await odoo.searchRead(
      "ir.ui.menu",
      [["id", "in", menuIds]],
      ["id", "name", "parent_id", "action", "sequence"],
      500, 0, "sequence asc"
    );

    const menuIdSet = new Set(menuIds);
    const byId = {};
    menus.forEach((m) => { byId[m.id] = { ...m, children: [] }; });

    const roots = [];
    menus.forEach((m) => {
      const parentId = m.parent_id?.[0];
      // A menu is a "root" of this app's tree if it has no parent, OR
      // its parent lives OUTSIDE this module (e.g. under a shared
      // top-level app menu) — either way, nothing above it belongs to
      // this module, so it's where this tenant's tree starts.
      if (!parentId || !menuIdSet.has(parentId)) {
        roots.push(byId[m.id]);
      } else if (byId[parentId]) {
        byId[parentId].children.push(byId[m.id]);
      }
    });

    // Attach the action's model type where present (window action vs
    // something else), so the frontend knows a leaf is clickable
    // without a second round trip per item.
    const actionIds = menus
      .map((m) => m.action)
      .filter(Boolean)
      .map((ref) => {
        const [model, id] = String(ref).split(",");
        return { model, id: parseInt(id, 10) };
      });
    const windowActionIds = actionIds.filter((a) => a.model === "ir.actions.act_window").map((a) => a.id);
    let validWindowActionIds = new Set();
    if (windowActionIds.length) {
      const valid = await odoo.searchRead("ir.actions.act_window", [["id", "in", windowActionIds]], ["id"], windowActionIds.length);
      validWindowActionIds = new Set(valid.map((v) => v.id));
    }

    const annotate = (node) => {
      let actionId = null;
      if (node.action) {
        const [model, id] = String(node.action).split(",");
        if (model === "ir.actions.act_window" && validWindowActionIds.has(parseInt(id, 10))) {
          actionId = parseInt(id, 10);
        }
      }
      return {
        id: node.id,
        name: node.name,
        actionId, // null = folder/parent menu, not directly clickable
        children: node.children.map(annotate),
      };
    };

    const tree = roots.map(annotate);

    // Prefer Odoo's own module description over a derived label when available.
    let moduleLabel = friendlyLabel(moduleName);
    try {
      const modRecord = await odoo.searchRead("ir.module.module", [["name", "=", moduleName]], ["shortdesc"], 1);
      if (modRecord[0]?.shortdesc) moduleLabel = modRecord[0].shortdesc;
    } catch (e) { /* fall back to friendlyLabel */ }

    return success(res, { moduleLabel, tree });
  } catch (err) {
    return error(res, err.message, err.status || 500);
  }
};

// GET /api/outlet/companies — outlets (res.company), a standard Odoo
// model shared by every tenant — no per-tenant config needed at all.
exports.getCompanies = async (req, res) => {
  try {
    requireModuleName(req);
    const companies = await odoo.searchRead("res.company", [], ["id", "name"], 100, 0, "name asc");
    return success(res, companies);
  } catch (err) {
    return error(res, `Couldn't load outlets: ${err.message}`, err.status || 500);
  }
};

// GET /api/outlet/screen/:actionId?companyId=&dateFrom=&dateTo=
// Fully generic: resolves the action to its model, discovers that
// model's real (business, non-system) fields and their labels straight
// from Odoo, then reads the data — all live, no per-tenant field
// mapping involved anywhere in this function.
exports.getScreenData = async (req, res) => {
  try {
    requireModuleName(req);
    const actionId = parseInt(req.params.actionId, 10);
    if (!actionId) return error(res, "A valid action id is required.", 400);

    const actions = await odoo.searchRead("ir.actions.act_window", [["id", "=", actionId]], ["res_model", "name"], 1);
    if (!actions.length) return error(res, "That screen's action couldn't be found.", 404);
    const { res_model: model, name: screenName } = actions[0];

    const modelFields = await odoo.searchRead(
      "ir.model.fields",
      [["model", "=", model]],
      ["name", "field_description", "ttype", "relation"],
      300
    );

    const businessFields = modelFields.filter(
      (f) => isBusinessField(f.name) && RENDERABLE_TYPES.includes(f.ttype)
    );
    if (!businessFields.length) {
      return error(res, `"${screenName}" has no displayable fields on model "${model}".`, 501);
    }

    // Try to find a date field and a company/outlet field to apply
    // sensible default scoping (current month, single outlet) — same
    // idea as before, but discovered by TYPE/relation instead of a
    // hardcoded field name, so it works on any model.
    const dateField = businessFields.find((f) => f.ttype === "date" || f.ttype === "datetime");
    const companyField = businessFields.find((f) => f.ttype === "many2one" && f.relation === "res.company");

    const domain = [];
    if (dateField) {
      const today = new Date();
      const dateFrom = req.query.dateFrom || new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
      const dateTo = req.query.dateTo || today.toISOString().slice(0, 10);
      domain.push([dateField.name, ">=", dateFrom]);
      domain.push([dateField.name, "<=", dateTo]);
    }
    if (companyField && req.query.companyId) {
      domain.push([companyField.name, "=", parseInt(req.query.companyId, 10)]);
    }

    const fieldNames = businessFields.map((f) => f.name);
    const rows = await odoo.searchRead(model, domain, fieldNames, 500, 0, dateField ? `${dateField.name} desc` : "");

    return success(res, {
      screenName,
      model,
      columns: businessFields.map((f) => ({ name: f.name, label: f.field_description, type: f.ttype })),
      hasDateFilter: !!dateField,
      hasCompanyFilter: !!companyField,
      rows,
    });
  } catch (err) {
    return error(res, `Couldn't load this screen: ${err.message}`, err.status || 500);
  }
};

exports.isTenantEnabled = (tenantId) => !!getModuleName(tenantId);
exports.getModuleLabel = (tenantId) => {
  const moduleName = getModuleName(tenantId);
  return moduleName ? friendlyLabel(moduleName) : "Outlet Management";
};