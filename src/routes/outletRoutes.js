const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { error } = require("../utils/response");
const outletController = require("../controllers/outletController");

// Not gated via requireModule(key) like other modules — custom apps
// like this are bespoke per-tenant (see config/outletModuleConfig.js
// TENANT_MODULES), not a generic "is this Odoo app installed" check.
router.use(authenticate, (req, res, next) => {
  if (!outletController.isTenantEnabled(req.tenant?.id)) {
    return error(res, "This module isn't enabled for this tenant.", 403);
  }
  next();
});

router.get("/menu", outletController.getMenu);
router.get("/dashboard", outletController.getDashboard);
router.get("/admin-panel", outletController.getAdminPanel);
router.get("/day-summary", outletController.getDaySummary);
router.get("/companies", outletController.getCompanies);
router.get("/screen/:actionId", outletController.getScreenData);

module.exports = router;