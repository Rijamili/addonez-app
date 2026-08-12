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
      let isUnsupportedAction = false;
      if (node.action) {
        const [model, id] = String(node.action).split(",");
        if (model === "ir.actions.act_window" && validWindowActionIds.has(parseInt(id, 10))) {
          actionId = parseInt(id, 10);
        } else {
          // Anything that isn't a normal window action — a custom
          // client widget (ir.actions.client), a report action, a
          // server action, etc. — can't be generically rendered from
          // Odoo metadata alone. Rather than enumerate every possible
          // action type, treat ANYTHING that isn't a valid window
          // action as "unsupported", and let the frontend route taps
          // on these to our own auto-generated dashboard instead of a
          // dead end.
          isUnsupportedAction = true;
        }
      }
      return {
        id: node.id,
        name: node.name,
        actionId, // null = folder/parent menu OR unsupported action type
        isClientAction: isUnsupportedAction,
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

// Shared discovery: scans this module's own screens for the model that
// has both a date field and an outlet (many2one → res.company) field —
// that's treated as the "daily activity" data source every dashboard
// view below is built from. No hardcoded field/model names — same
// heuristic scoring used everywhere: prefer a screen name containing
// "daily", tiebreak by whichever model has the most rows this month.
async function discoverDailyLogModel(moduleName) {
  const menuData = await odoo.searchRead(
    "ir.model.data",
    [["module", "=", moduleName], ["model", "=", "ir.ui.menu"]],
    ["res_id"],
    500
  );
  const menuIds = menuData.map((d) => d.res_id);
  if (!menuIds.length) throw Object.assign(new Error("No menus found for this module."), { status: 404 });

  const menus = await odoo.searchRead("ir.ui.menu", [["id", "in", menuIds]], ["action"], 500);
  const windowActionIds = menus
    .map((m) => m.action)
    .filter(Boolean)
    .map((ref) => String(ref).split(","))
    .filter(([model]) => model === "ir.actions.act_window")
    .map(([, id]) => parseInt(id, 10));

  if (!windowActionIds.length) throw Object.assign(new Error("No usable data screens found for this module."), { status: 404 });

  const actions = await odoo.searchRead(
    "ir.actions.act_window",
    [["id", "in", [...new Set(windowActionIds)]]],
    ["res_model", "name"],
    windowActionIds.length
  );

  const modelToActionNames = {};
  actions.forEach((a) => {
    if (!modelToActionNames[a.res_model]) modelToActionNames[a.res_model] = [];
    modelToActionNames[a.res_model].push(a.name);
  });
  const distinctModels = Object.keys(modelToActionNames);

  const candidates = [];
  for (const model of distinctModels) {
    const fields = await odoo.searchRead(
      "ir.model.fields",
      [["model", "=", model]],
      ["name", "field_description", "ttype", "relation"],
      300
    );
    const business = fields.filter((f) => isBusinessField(f.name));
    const foundDate = business.find((f) => f.ttype === "date" || f.ttype === "datetime");
    const foundCompany = business.find((f) => f.ttype === "many2one" && f.relation === "res.company");
    if (foundDate && foundCompany) {
      candidates.push({ model, dateField: foundDate, companyField: foundCompany, allFields: business });
    }
  }

  if (!candidates.length) {
    throw Object.assign(new Error("No screen with both a date field and an outlet field was found to build a dashboard from."), { status: 404 });
  }

  const monthStartForScoring = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  for (const c of candidates) {
    const looksLikeDailyLog = modelToActionNames[c.model].some((name) => /daily/i.test(name));
    const recordCount = await odoo.searchCount(c.model, [[c.dateField.name, ">=", monthStartForScoring]]);
    c.score = (looksLikeDailyLog ? 100000 : 0) + recordCount;
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

// Keyword buckets that mirror the section headers Odoo's own
// hand-built "Day-wise Financial Dashboard" view uses (SALES, COST &
// DEDUCTIONS, PAYMENT RECEIVED BY METHOD, FOOD COST, BALANCES). Field
// labels are matched by keyword rather than a per-tenant field-name
// map, so any tenant whose module follows similar naming conventions
// gets the same grouped layout automatically.
const SECTION_RULES = [
  { key: "foodCost", test: /food\s*cost/i },
  { key: "balances", test: /bank balance|cash on hand|balance/i },
  { key: "payments", test: /\bcash\b|bank transfer|\bcard\b|swiggy|zomato|online platform|total collected|tally|variance|upi|payment/i },
  // Broadened past just "deduction"/"cost" — real-world fields like
  // "Other Expense / Salary / Advance" use "expense"/"salary"/"advance"
  // without the word "deduction" ever appearing, and were silently
  // falling through to an "other" bucket instead of COST & DEDUCTIONS.
  { key: "costDeductions", test: /deduction|salary|advance|paid to roll|expense|\bcost\b/i },
  { key: "sales", test: /sale/i },
];
function classifyField(label) {
  for (const rule of SECTION_RULES) {
    if (rule.test.test(label)) return rule.key;
  }
  return "other";
}

// GET /api/outlet/dashboard
// Auto-builds a per-outlet KPI dashboard WITHOUT any hardcoded field
// names: every monetary field on the discovered daily-log model becomes
// a Yesterday/This-Month total; every float field whose label looks
// like a percentage (contains "%"/"percent"/"pct") becomes a
// latest-value metric. This is a heuristic, not a guarantee — it works
// well for the common "daily entry per outlet" shape these custom apps
// tend to have, but a module with a very different data shape may not
// produce a meaningful dashboard this way.
exports.getDashboard = async (req, res) => {
  try {
    const moduleName = requireModuleName(req);
    const { model: sourceModel, dateField, companyField, allFields } = await discoverDailyLogModel(moduleName);

    const monetaryFields = allFields.filter((f) => f.ttype === "monetary");
    const percentFields = allFields.filter(
      (f) => f.ttype === "float" && /%|percent|pct/i.test(f.field_description)
    );

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

    const readFields = [dateField.name, companyField.name, ...monetaryFields.map((f) => f.name), ...percentFields.map((f) => f.name)];
    const rows = await odoo.searchRead(
      sourceModel,
      [[dateField.name, ">=", monthStart]],
      readFields,
      5000, 0, `${dateField.name} desc`
    );

    const byCompany = {};
    rows.forEach((r) => {
      const companyId = r[companyField.name]?.[0];
      const companyName = r[companyField.name]?.[1];
      if (!companyId) return;

      if (!byCompany[companyId]) {
        byCompany[companyId] = { id: companyId, outletName: companyName, metrics: [], _latestDate: null, _raw: {} };
        monetaryFields.forEach((f) => { byCompany[companyId]._raw[f.name] = { yesterday: 0, month: 0 }; });
        percentFields.forEach((f) => { byCompany[companyId]._raw[f.name] = { value: 0 }; });
      }
      const bucket = byCompany[companyId];

      monetaryFields.forEach((f) => {
        bucket._raw[f.name].month += Number(r[f.name] || 0);
        if (r[dateField.name] === yesterdayStr) {
          bucket._raw[f.name].yesterday += Number(r[f.name] || 0);
        }
      });

      if (!bucket._latestDate || r[dateField.name] > bucket._latestDate) {
        bucket._latestDate = r[dateField.name];
        percentFields.forEach((f) => { bucket._raw[f.name].value = Number(r[f.name] || 0); });
      }
    });

    const outlets = Object.values(byCompany).map((bucket) => {
      const metrics = [];
      monetaryFields.forEach((f) => {
        metrics.push({
          label: f.field_description,
          type: "monetary",
          yesterday: Math.round(bucket._raw[f.name].yesterday * 100) / 100,
          month: Math.round(bucket._raw[f.name].month * 100) / 100,
        });
      });
      percentFields.forEach((f) => {
        metrics.push({
          label: f.field_description,
          type: "percent",
          value: Math.round(bucket._raw[f.name].value * 100) / 100,
        });
      });
      return { id: bucket.id, outletName: bucket.outletName, metrics };
    });

    // byCompany only ever gets a bucket for outlets that had at least
    // one daily-entry row this month — an outlet with zero entries
    // (no activity yet, or just onboarded) silently never appeared in
    // `outlets` at all. Backfill every real outlet (res.company) with
    // an all-zero bucket so the dashboard/chart always reflects every
    // outlet that exists, same fix already applied to getAdminPanel.
    const allCompanies = await odoo.searchRead("res.company", [], ["id", "name"], 200, 0, "name asc");
    const presentIds = new Set(outlets.map((o) => o.id));
    allCompanies.forEach((c) => {
      if (presentIds.has(c.id)) return;
      const metrics = [];
      monetaryFields.forEach((f) => metrics.push({ label: f.field_description, type: "monetary", yesterday: 0, month: 0 }));
      percentFields.forEach((f) => metrics.push({ label: f.field_description, type: "percent", value: 0 }));
      outlets.push({ id: c.id, outletName: c.name, metrics });
    });

    // Hint the frontend toward which single metric is worth charting
    // across all outlets by default (a screen with 8+ monetary columns
    // can't sensibly bar-chart all of them at once) — same "Total Sale"
    // label heuristic used by the admin panel, falling back to whichever
    // monetary field is largest on average across outlets.
    let primaryMetricLabel = monetaryFields.find((f) => /total\s*sale/i.test(f.field_description))?.field_description || null;
    if (!primaryMetricLabel && monetaryFields.length) {
      const avgByField = monetaryFields.map((f) => {
        const total = outlets.reduce((s, o) => s + (o.metrics.find((m) => m.label === f.field_description)?.month || 0), 0);
        return { label: f.field_description, avg: total / (outlets.length || 1) };
      });
      avgByField.sort((a, b) => b.avg - a.avg);
      primaryMetricLabel = avgByField[0]?.label || null;
    }
    const primaryPercentLabel = percentFields.find((f) => /food\s*cost/i.test(f.field_description))?.field_description
      || percentFields[0]?.field_description || null;

    return success(res, { sourceModel, outlets, primaryMetricLabel, primaryPercentLabel });
  } catch (err) {
    return error(res, `Dashboard build failed: ${err.message}`, err.status || 500);
  }
};

// GET /api/outlet/admin-panel?date=YYYY-MM-DD
// Matches Odoo's own "Admin Panel - Outlet-wise Dashboard" LIST view:
// one row per outlet with Yesterday Sale / This Month Total / Monthly
// Avg Food Cost %. `date` is optional and shifts what "yesterday" and
// "this month" mean, so the screen can be pointed at any past period.
exports.getAdminPanel = async (req, res) => {
  try {
    const moduleName = requireModuleName(req);
    const { model: sourceModel, dateField, companyField, allFields } = await discoverDailyLogModel(moduleName);

    const monetaryFields = allFields.filter((f) => f.ttype === "monetary");
    const percentFields = allFields.filter(
      (f) => f.ttype === "float" && /%|percent|pct/i.test(f.field_description)
    );
    // Prefer a field literally called "Total Sale"; fall back to the
    // first monetary field so screens with different naming still work.
    const totalSaleField = monetaryFields.find((f) => /total\s*sale/i.test(f.field_description)) || monetaryFields[0];
    const foodCostPctField = percentFields.find((f) => /food\s*cost/i.test(f.field_description)) || percentFields[0];

    const refDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? new Date(req.query.date) : new Date();
    const yesterday = new Date(refDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const monthStart = new Date(refDate.getFullYear(), refDate.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = refDate.toISOString().slice(0, 10);

    const readFields = [dateField.name, companyField.name, ...(totalSaleField ? [totalSaleField.name] : []), ...(foodCostPctField ? [foodCostPctField.name] : [])];
    const rows = await odoo.searchRead(
      sourceModel,
      [[dateField.name, ">=", monthStart], [dateField.name, "<=", monthEnd]],
      readFields,
      5000, 0, `${dateField.name} desc`
    );

    const byCompany = {};
    rows.forEach((r) => {
      const companyId = r[companyField.name]?.[0];
      const companyName = r[companyField.name]?.[1];
      if (!companyId) return;
      if (!byCompany[companyId]) {
        byCompany[companyId] = { id: companyId, outletName: companyName, yesterdaySale: 0, monthTotal: 0, monthlyAvgFoodCostPct: 0, _latestDate: null };
      }
      const bucket = byCompany[companyId];
      const saleVal = totalSaleField ? Number(r[totalSaleField.name] || 0) : 0;
      bucket.monthTotal += saleVal;
      if (r[dateField.name] === yesterdayStr) bucket.yesterdaySale += saleVal;
      if (!bucket._latestDate || r[dateField.name] > bucket._latestDate) {
        bucket._latestDate = r[dateField.name];
        bucket.monthlyAvgFoodCostPct = foodCostPctField ? Number(r[foodCostPctField.name] || 0) : 0;
      }
    });

    const outlets = await odoo.searchRead("res.company", [], ["id", "name"], 200, 0, "name asc");
    const rowsOut = outlets.map((o) => {
      const b = byCompany[o.id];
      return {
        id: o.id,
        outletName: o.name,
        yesterdaySale: Math.round((b?.yesterdaySale || 0) * 100) / 100,
        monthTotal: Math.round((b?.monthTotal || 0) * 100) / 100,
        monthlyAvgFoodCostPct: Math.round((b?.monthlyAvgFoodCostPct || 0) * 100) / 100,
      };
    });

    return success(res, {
      sourceModel,
      date: monthEnd,
      columns: [
        { name: "outletName", label: "Outlet" },
        { name: "yesterdaySale", label: "Yesterday Sale", type: "monetary" },
        { name: "monthTotal", label: "This Month Total", type: "monetary" },
        { name: "monthlyAvgFoodCostPct", label: "Monthly Avg Food Cost %", type: "percent" },
      ],
      rows: rowsOut,
    });
  } catch (err) {
    return error(res, `Admin panel build failed: ${err.message}`, err.status || 500);
  }
};

// GET /api/outlet/day-summary?companyId=&date=YYYY-MM-DD
// Matches Odoo's own "Day-wise Financial Dashboard" screen: a single
// outlet's single-day entry, with every business field grouped into
// SALES / COST & DEDUCTIONS / PAYMENT RECEIVED BY METHOD / FOOD COST /
// BALANCES sections by keyword (see classifyField), plus a monthly
// average for the food-cost percentage field. companyId defaults to
// the first outlet, date defaults to today — same defaults Odoo uses.
exports.getDaySummary = async (req, res) => {
  try {
    const moduleName = requireModuleName(req);
    const { model: sourceModel, dateField, companyField, allFields } = await discoverDailyLogModel(moduleName);

    let companyId = parseInt(req.query.companyId, 10);
    if (!companyId) {
      const companies = await odoo.searchRead("res.company", [], ["id", "name"], 1, 0, "name asc");
      companyId = companies[0]?.id;
    }
    if (!companyId) return error(res, "No outlets found.", 404);

    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date(date).getFullYear(), new Date(date).getMonth(), 1).toISOString().slice(0, 10);

    const readFields = allFields.map((f) => f.name);
    const dayRows = await odoo.searchRead(
      sourceModel,
      [[companyField.name, "=", companyId], [dateField.name, "=", date]],
      readFields, 1
    );
    const record = dayRows[0] || null;

    const percentFields = allFields.filter((f) => f.ttype === "float" && /%|percent|pct/i.test(f.field_description));
    const foodCostPctField = percentFields.find((f) => /food\s*cost/i.test(f.field_description)) || percentFields[0];
    let monthlyAvgFoodCostPct = null;
    if (foodCostPctField) {
      const monthRows = await odoo.searchRead(
        sourceModel,
        [[companyField.name, "=", companyId], [dateField.name, ">=", monthStart], [dateField.name, "<=", date]],
        [foodCostPctField.name], 5000
      );
      if (monthRows.length) {
        const sum = monthRows.reduce((s, r) => s + Number(r[foodCostPctField.name] || 0), 0);
        monthlyAvgFoodCostPct = Math.round((sum / monthRows.length) * 100) / 100;
      }
    }

    const renderable = allFields.filter((f) => RENDERABLE_TYPES.includes(f.ttype) && f.name !== dateField.name && f.name !== companyField.name);
    const sections = { sales: [], costDeductions: [], payments: [], balances: [], other: [] };
    renderable.forEach((f) => {
      const bucket = classifyField(f.field_description);
      const item = {
        name: f.name,
        label: f.field_description,
        type: f.ttype === "monetary" ? "monetary" : f.ttype === "float" && /%|percent|pct/i.test(f.field_description) ? "percent" : f.ttype,
        value: record ? record[f.name] : null,
      };
      if (bucket === "foodCost") return; // surfaced separately below, not as a plain row
      (sections[bucket] || sections.other).push(item);
    });

    const outlet = (await odoo.searchRead("res.company", [["id", "=", companyId]], ["id", "name"], 1))[0] || null;

    return success(res, {
      sourceModel,
      date,
      outlet,
      hasEntry: !!record,
      sales: sections.sales,
      costDeductions: sections.costDeductions,
      payments: sections.payments,
      foodCost: {
        today: foodCostPctField ? { label: foodCostPctField.field_description, value: record ? record[foodCostPctField.name] : null } : null,
        monthlyAverage: monthlyAvgFoodCostPct,
      },
      balances: sections.balances,
      other: sections.other,
    });
  } catch (err) {
    return error(res, `Day summary build failed: ${err.message}`, err.status || 500);
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
// Odoo's real list view only shows the handful of fields its arch XML
// actually lists — not every field on the model. Without that, the
// generic screen was dumping every business field (including internal
// computed breakdowns like "Franchise Royalty %" or "Total Share Across
// All Partners") into a single card, badly diverging from the compact
// column set the tenant's own list view shows. This pulls that view's
// real field order + labels straight from Odoo, so the fallback still
// works generically for ANY tenant's screen, but now matches what
// their own list view actually displays whenever one can be found.
async function getListViewFieldOrder(model, actionId) {
  try {
    // Prefer the view explicitly attached to this action...
    const actionViews = await odoo.searchRead(
      "ir.actions.act_window.view",
      [["act_window_id", "=", actionId], ["view_mode", "in", ["tree", "list"]]],
      ["view_id"], 5
    );
    let viewId = actionViews.find((v) => v.view_id)?.view_id?.[0];

    // ...falling back to the model's own default tree/list view.
    if (!viewId) {
      const defaultViews = await odoo.searchRead(
        "ir.ui.view",
        [["model", "=", model], ["type", "in", ["tree", "list"]]],
        ["id"], 1, 0, "priority asc"
      );
      viewId = defaultViews[0]?.id;
    }
    if (!viewId) return null;

    const viewRecords = await odoo.read("ir.ui.view", [viewId], ["arch_db", "arch"]);
    const arch = viewRecords[0]?.arch_db || viewRecords[0]?.arch;
    if (!arch) return null;

    // Cheap top-level <field name="x" string="Label"/> scan — good
    // enough for the flat list views these custom apps use; doesn't
    // try to handle fields nested inside a one2many sub-view.
    const fieldTagPattern = /<field\b[^>]*\bname=["']([^"']+)["'][^>]*\/?>/g;
    const stringAttrPattern = /\bstring=["']([^"']+)["']/;
    const order = [];
    let match;
    while ((match = fieldTagPattern.exec(arch)) !== null) {
      const stringMatch = stringAttrPattern.exec(match[0]);
      order.push({ name: match[1], label: stringMatch?.[1] || null });
    }
    return order.length ? order : null;
  } catch (e) {
    return null; // any lookup failure just falls back to "show every business field"
  }
}

// Screens like Odoo's "Sales Analysis" default to a grouped list (group
// by Outlet, sums per column, a totals row) rather than a flat record
// list — that's driven by a `group_by` key in the action's own default
// context, not something visible on the model itself. This pulls that
// context, and if the first group-by field is a many2one, returns the
// field to group on; everything downstream (sums, count, totals row)
// is computed generically off whatever columns the screen already has.
async function getGroupByField(actionId, businessFields) {
  try {
    const actionRows = await odoo.searchRead("ir.actions.act_window", [["id", "=", actionId]], ["context"], 1);
    const ctxStr = actionRows[0]?.context;
    if (!ctxStr) return null;
    const match = /'group_by':\s*\[([^\]]*)\]/.exec(ctxStr) || /"group_by":\s*\[([^\]]*)\]/.exec(ctxStr);
    if (!match) return null;
    const firstGroupRaw = match[1].split(",")[0]?.trim().replace(/^["']|["']$/g, "");
    if (!firstGroupRaw) return null;
    const fieldName = firstGroupRaw.split(":")[0]; // strip Odoo's "date:month" style suffix
    return businessFields.find((f) => f.name === fieldName && f.ttype === "many2one") || null;
  } catch (e) {
    return null;
  }
}

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

    // Narrow (and reorder/relabel) down to the tenant's own list view
    // columns when we can find that view — falls back to every business
    // field on the model if the view lookup or parsing didn't pan out.
    const viewFieldOrder = await getListViewFieldOrder(model, actionId);
    let displayFields = businessFields;
    if (viewFieldOrder) {
      const byName = Object.fromEntries(businessFields.map((f) => [f.name, f]));
      const matched = viewFieldOrder
        .filter((v) => byName[v.name])
        .map((v) => ({ ...byName[v.name], field_description: v.label || byName[v.name].field_description }));
      if (matched.length) displayFields = matched;
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

    const fieldNames = displayFields.map((f) => f.name);
    const groupField = await getGroupByField(actionId, businessFields);
    if (groupField && !fieldNames.includes(groupField.name)) fieldNames.push(groupField.name);

    const rows = await odoo.searchRead(model, domain, fieldNames, 500, 0, dateField ? `${dateField.name} desc` : "");

    // Some screens (e.g. Odoo's own "Sales Analysis") default to a
    // grouped list — one row per outlet with sums, not one row per
    // daily record. Detect that from the action's own default context
    // and, if found, return the aggregated shape instead of raw rows.
    if (groupField) {
      const monetaryCols = displayFields.filter((f) => f.ttype === "monetary");
      const percentCols = displayFields.filter((f) => f.ttype === "float" && /%|percent|pct/i.test(f.field_description));
      const byGroup = {};
      rows.forEach((r) => {
        const gid = r[groupField.name]?.[0];
        const gname = r[groupField.name]?.[1];
        if (!gid) return;
        if (!byGroup[gid]) {
          byGroup[gid] = { id: gid, name: gname, count: 0, sums: {}, _pctSum: {} };
          monetaryCols.forEach((f) => { byGroup[gid].sums[f.name] = 0; });
          percentCols.forEach((f) => { byGroup[gid]._pctSum[f.name] = { sum: 0, n: 0 }; });
        }
        const bucket = byGroup[gid];
        bucket.count += 1;
        monetaryCols.forEach((f) => { bucket.sums[f.name] += Number(r[f.name] || 0); });
        percentCols.forEach((f) => {
          bucket._pctSum[f.name].sum += Number(r[f.name] || 0);
          bucket._pctSum[f.name].n += 1;
        });
      });

      const groups = Object.values(byGroup).map((b) => {
        const sums = {};
        monetaryCols.forEach((f) => { sums[f.name] = Math.round(b.sums[f.name] * 100) / 100; });
        percentCols.forEach((f) => {
          const { sum, n } = b._pctSum[f.name];
          sums[f.name] = n ? Math.round((sum / n) * 100) / 100 : 0;
        });
        return { id: b.id, name: b.name, count: b.count, values: sums };
      }).sort((a, b) => a.name.localeCompare(b.name));

      const totals = {};
      monetaryCols.forEach((f) => { totals[f.name] = Math.round(groups.reduce((s, g) => s + (g.values[f.name] || 0), 0) * 100) / 100; });
      percentCols.forEach((f) => {
        const withData = groups.filter((g) => g.count > 0);
        totals[f.name] = withData.length
          ? Math.round((withData.reduce((s, g) => s + (g.values[f.name] || 0), 0) / withData.length) * 100) / 100
          : 0;
      });

      return success(res, {
        screenName,
        model,
        grouped: true,
        groupByLabel: groupField.field_description,
        columns: [...monetaryCols, ...percentCols].map((f) => ({
          name: f.name, label: f.field_description,
          type: monetaryCols.includes(f) ? "monetary" : "percent",
        })),
        groups,
        totals,
        hasDateFilter: !!dateField,
        hasCompanyFilter: false, // grouping IS the outlet breakdown — a separate outlet filter would just collapse it to one group
      });
    }

    return success(res, {
      screenName,
      model,
      columns: displayFields.map((f) => ({ name: f.name, label: f.field_description, type: f.ttype })),
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