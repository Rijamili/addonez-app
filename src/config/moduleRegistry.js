// src/config/moduleRegistry.js
//
// Single source of truth mapping an Odoo technical module name (the "name"
// field on ir.module.module, e.g. "sale", "account", "crm") to a stable
// "key" the mobile app already understands as a screen.
//
// Nothing here is tenant-specific — this is the full universe of
// screens the app CAN show. Which of these actually show up for a given
// tenant/user is computed at request time in modulesController.js by
// checking (a) is the module installed on that tenant's Odoo, and
// (b) does the logged-in user's own Odoo groups give them access to it.
//
// To add support for a new Odoo app later: add one entry here, then add
// the matching screen/route in the mobile app's MODULE_SCREEN_MAP
// (src/navigation/moduleScreenMap.js). Nothing else needs to change —
// no per-tenant code, no per-client branching.

const MODULE_REGISTRY = [
  // Always shown — not tied to any specific Odoo app being installed.
  { key: "dashboard", name: "Dashboard", icon: "home", always: true },

  // groupXmlId is Odoo's own standard external ID for "can use this app"
  // (module.name_of_group, as seen in Odoo's own security/*.xml files).
  // Resolved to a real numeric group id once per tenant (cached), then
  // checked against the logged-in user's own groupIds from their JWT.
  { key: "sales", name: "Sales", icon: "shopping-cart", odooModule: "sale", groupXmlId: "sales_team.group_sale_salesman" },
  { key: "projects", name: "Projects", icon: "folder", odooModule: "project", groupXmlId: "project.group_project_user" },

  // "Finance" is the parent screen for accounting reports. It's driven by
  // the "account" app specifically (not crm/mrp) — crm/manufacturing are
  // separate entries below, even though today's UI nests their screens
  // inside the Finance stack for navigation purposes.
  { key: "finance", name: "Finance", icon: "dollar-sign", odooModule: "account", groupXmlId: "account.group_account_invoice" },
  { key: "crm", name: "CRM", icon: "users", odooModule: "crm", groupXmlId: "sales_team.group_sale_salesman" },
  { key: "manufacturing", name: "Manufacturing", icon: "settings", odooModule: "mrp", groupXmlId: "mrp.group_mrp_user" },

  // Cross-module features: only meaningful once there's sales or
  // financial data to analyze, so gated on either being present rather
  // than tied to one specific Odoo app. No groupXmlId — access here just
  // follows whichever underlying module (sale/account) let it show at all.
  { key: "analytics", name: "Analytics", icon: "bar-chart-2", requiresAnyOf: ["sale", "account"] },
  { key: "predictions", name: "Predictions", icon: "trending-up", requiresAnyOf: ["sale", "account"] },
  { key: "ai_insights", name: "AI Insights", icon: "zap", requiresAnyOf: ["sale", "account"] },

  { key: "profile", name: "Profile", icon: "user", always: true },
];

module.exports = { MODULE_REGISTRY };