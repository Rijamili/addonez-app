const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
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

router.get("/", authenticate, getManufacturingSummary);
router.get("/production", authenticate, getProduction);
router.get("/work-orders", authenticate, getWorkOrders);
router.get("/inventory", authenticate, getInventory);
router.get("/quality", authenticate, getQuality);
router.get("/procurement", authenticate, getProcurement);
router.get("/maintenance", authenticate, getMaintenance);
router.get("/workforce", authenticate, getWorkforce);
router.get("/cost", authenticate, getCost);
router.get("/ai-predictive", authenticate, getAiPredictive);
router.get("/executive-dashboard", authenticate, getExecutiveDashboard);

module.exports = router;