const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { error } = require("../utils/response");
const outletController = require("../controllers/outletController");

// Not gated via requireModule(key) like other modules — Outlet
// Management is bespoke to specific tenants (see
// config/outletModuleConfig.js ENABLED_TENANT_IDS), not a generic
// "is this Odoo app installed" check.
router.use(authenticate, (req, res, next) => {
  if (!outletController.isTenantEnabled(req.tenant?.id)) {
    return error(res, "Outlet Management isn't enabled for this tenant.", 403);
  }
  next();
});

router.get("/screens", outletController.getScreens);
router.get("/dashboard", outletController.getDashboard);
router.get("/:screenKey", outletController.getScreenData);

module.exports = router;