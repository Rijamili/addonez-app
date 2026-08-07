// src/routes/adminRoutes.js
const express  = require("express");
const router   = express.Router();
const { body, param } = require("express-validator");
const { createTenant, updateTenant, deleteTenant, addUser, removeUser, listTenants, debugUserFields, debugProductFields, debugModuleSearch } = require("../controllers/adminController");
const { authenticate, authorize } = require("../middleware/auth");
const { validate } = require("../middleware/validate");

// Every route here is admin-only — same JWT auth as the rest of the app,
// so only someone already logged in as an admin on an existing tenant can
// manage other tenants. Consider restricting this further (e.g. a single
// internal super-admin tenant) before exposing it outside your own team.
router.use(authenticate, authorize("admin", "super_admin"));

router.get("/tenants", listTenants);

router.post("/tenants",
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
  [param("tenantId").notEmpty(), validate],
  deleteTenant
);

router.post("/tenants/:tenantId/users",
  [param("tenantId").notEmpty(), body("email").isEmail(), validate],
  addUser
);



router.delete("/tenants/:tenantId/users/:email",
  [param("tenantId").notEmpty(), param("email").isEmail(), validate],
  removeUser
);

// TEMPORARY — remove once we've confirmed the real field name for this
// Odoo version and updated OdooService.getUserByEmail() accordingly.
// Lists every field on res.users whose technical name contains "group",
// so we can find whatever "groups_id" got renamed to in Odoo 19.
router.get("/debug/user-fields", debugUserFields);

// TEMPORARY — remove once the Manufacturing "type=product" XML-RPC
// fault is confirmed fixed. See debugProductFields for what it checks.
router.get("/debug/product-fields", debugProductFields);

router.get("/debug/module-search", debugModuleSearch);

module.exports = router;