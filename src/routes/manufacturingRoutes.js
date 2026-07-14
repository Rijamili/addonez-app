const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { requireModule } = require("../middleware/requireModule");
const {
  getManufacturingSummary,
  getProduction,
  getWorkOrders,
  getInventory,
  getQuality,
  getProcurement,
  getMaintenance,
  getWorkforce,
  getCost,
  getAiPredictive,
  getExecutiveDashboard,
} = require("../controllers/manufacturingController");

router.get("/", authenticate, requireModule("manufacturing"), getManufacturingSummary);
router.get("/production", authenticate, requireModule("manufacturing"), getProduction);
router.get("/work-orders", authenticate, requireModule("manufacturing"), getWorkOrders);
router.get("/inventory", authenticate, requireModule("manufacturing"), getInventory);
router.get("/quality", authenticate, requireModule("manufacturing"), getQuality);
router.get("/procurement", authenticate, requireModule("manufacturing"), getProcurement);
router.get("/maintenance", authenticate, requireModule("manufacturing"), getMaintenance);
router.get("/workforce", authenticate, requireModule("manufacturing"), getWorkforce);
router.get("/cost", authenticate, requireModule("manufacturing"), getCost);
router.get("/ai-predictive", authenticate, requireModule("manufacturing"), getAiPredictive);
router.get("/executive-dashboard", authenticate, requireModule("manufacturing"), getExecutiveDashboard);

module.exports = router;