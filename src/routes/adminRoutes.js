// src/routes/adminRoutes.js
const express  = require("express");
const router   = express.Router();
const { body, param } = require("express-validator");
const { createTenant, updateTenant, deleteTenant, addUser, removeUser, listTenants, debugUserFields, debugProductFields, debugModuleSearch, debugActionInfo } = require("../controllers/adminController");
const { authenticate, authorize } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { error } = require("../utils/response");

router.use(authenticate);

// Managing OTHER tenants (create/update/delete/add-remove users) is
// strictly global-super_admin-only — this touches every tenant in the
// system, not just your own, so it stays behind the hardcoded
// role === "super_admin" check.
const requireGlobalSuperAdmin = authorize("admin", "super_admin");

// The debug/diagnostic routes below are read-only introspection of ONE
// tenant's own Odoo (whichever tenant the caller's JWT belongs to) —
// safe to also allow that tenant's own configured Odoo admin account,
// not just our global super_admin. This matters because our global
// super_admin (info@addonez.com) belongs to exactly one tenant
// (addonez-demo) and literally cannot be used to diagnose any OTHER
// tenant's Odoo — without this, there'd be no way for a tenant like
// "juicy" to ever use these diagnostics for their own instance.
const requireSuperAdminOrOwnTenantAdmin = (req, res, next) => {
  if (["admin", "super_admin"].includes(req.user.role)) return next();

  const configuredAdminEmail = (req.tenant?.odoo?.adminUsername || "").toLowerCase();
  const loggedInEmail = (req.user?.email || "").toLowerCase();

  if (configuredAdminEmail && configuredAdminEmail === loggedInEmail) {
    return next();
  }

  return error(res, "Only this tenant's configured Odoo admin (or a global super admin) can use these diagnostics.", 403);
};

router.get("/tenants", requireGlobalSuperAdmin, listTenants);

router.post("/tenants",
  requireGlobalSuperAdmin,
  [
    body("id").isString().trim().notEmpty(),
    body("name").isString().trim().notEmpty(),
    body("odoo.host").isString().notEmpty(),
    body("odoo.db").isString().notEmpty(),
    body("odoo.adminUsername").isString().notEmpty(),
    body("odoo.adminPassword").isString().notEmpty(),
    body("users").optional().isArray(),
    body("users.*").optional().isEmail(),
    validate,
  ],
  createTenant
);

router.patch("/tenants/:tenantId",
  requireGlobalSuperAdmin,
  [
    param("tenantId").notEmpty(),
    body("name").optional().isString().trim().notEmpty(),
    body("odoo.host").optional().isString().notEmpty(),
    body("odoo.db").optional().isString().notEmpty(),
    body("odoo.port").optional().isInt(),
    body("odoo.ssl").optional().isBoolean(),
    body("odoo.adminUsername").optional().isString().notEmpty(),
    body("odoo.adminPassword").optional().isString().notEmpty(),
    validate,
  ],
  updateTenant
);

router.delete("/tenants/:tenantId",
  requireGlobalSuperAdmin,
  [param("tenantId").notEmpty(), validate],
  deleteTenant
);

router.post("/tenants/:tenantId/users",
  requireGlobalSuperAdmin,
  [param("tenantId").notEmpty(), body("email").isEmail(), validate],
  addUser
);

router.delete("/tenants/:tenantId/users/:email",
  requireGlobalSuperAdmin,
  [param("tenantId").notEmpty(), param("email").isEmail(), validate],
  removeUser
);

// TEMPORARY — remove once we've confirmed the real field name for this
// Odoo version and updated OdooService.getUserByEmail() accordingly.
// Lists every field on res.users whose technical name contains "group",
// so we can find whatever "groups_id" got renamed to in Odoo 19.
router.get("/debug/user-fields", requireSuperAdminOrOwnTenantAdmin, debugUserFields);

// TEMPORARY — remove once the Manufacturing "type=product" XML-RPC
// fault is confirmed fixed. See debugProductFields for what it checks.
router.get("/debug/product-fields", requireSuperAdminOrOwnTenantAdmin, debugProductFields);

router.get("/debug/module-search", requireSuperAdminOrOwnTenantAdmin, debugModuleSearch);

router.get("/debug/action-info", requireSuperAdminOrOwnTenantAdmin, debugActionInfo);

module.exports = router;