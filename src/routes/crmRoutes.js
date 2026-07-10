const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const {
  getCrmSummary,
  getLeads,
  getOpportunities,
  getSalesPerformance,
  getCustomers,
  getActivity,
  getRevenueForecast,
  getAiPredictive,
  getExecutiveDashboard,
} = require("../controllers/crmController");

router.get("/", authenticate, getCrmSummary);
router.get("/leads", authenticate, getLeads);
router.get("/opportunities", authenticate, getOpportunities);
router.get("/sales-performance", authenticate, getSalesPerformance);
router.get("/customers", authenticate, getCustomers);
router.get("/activity", authenticate, getActivity);
router.get("/revenue-forecast", authenticate, getRevenueForecast);
router.get("/ai-predictive", authenticate, getAiPredictive);
router.get("/executive-dashboard", authenticate, getExecutiveDashboard);

module.exports = router;