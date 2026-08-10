// src/config/outletModuleConfig.js
//
// Custom-app modules (bespoke, per-client Odoo apps like Juicy's
// "Outlet Management") work for ANY tenant with ZERO code changes,
// the same way Sales/Projects/Finance do — the only thing that's
// actually tenant-specific is WHICH custom module belongs to them.
// Everything else (menu structure, screens, field names, labels) is
// discovered live from Odoo's own metadata at request time — see
// outletController.js's getMenu/getScreen.
//
// HOW TO ONBOARD A NEW COMPANY (the ENTIRE process — nothing else to do):
//   1. Hit GET /api/admin/debug/custom-modules while logged in as that
//      tenant's admin — lists every installed module whose author
//      isn't Odoo, which will include their bespoke app.
//   2. Copy its technical `name` (e.g. "juicy_outlet_management") into
//      TENANT_MODULES below, keyed by their tenant id.
//   3. Deploy. Done — their menu, screens, and fields all render
//      automatically from there, live.
const TENANT_MODULES = {
  juicy: "juicy_outlet_management",

  // Add another company here once you know their module's technical
  // name — no other file needs to change:
  // acmeoutlets: "acme_branch_manager",
};

function getModuleName(tenantId) {
  return TENANT_MODULES[tenantId] || null;
}

// Turns a technical module name into a readable label when Odoo's own
// shortdesc isn't fetched (cheap fallback — outletController prefers
// the real ir.module.module.shortdesc when it can look it up).
function friendlyLabel(moduleName) {
  return moduleName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

module.exports = { TENANT_MODULES, getModuleName, friendlyLabel };