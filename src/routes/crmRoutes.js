const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { requireModule } = require("../middleware/requireModule");
const { requireManagerTier } = require("../middleware/roleGate");
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

router.get("/", authenticate, requireModule("crm"), requireManagerTier, getCrmSummary);
router.get("/leads", authenticate, requireModule("crm"), getLeads);
router.get("/opportunities", authenticate, requireModule("crm"), getOpportunities);
router.get("/sales-performance", authenticate, requireModule("crm"), requireManagerTier, getSalesPerformance);
router.get("/customers", authenticate, requireModule("crm"), getCustomers);
router.get("/activity", authenticate, requireModule("crm"), getActivity);
router.get("/revenue-forecast", authenticate, requireModule("crm"), requireManagerTier, getRevenueForecast);
router.get("/ai-predictive", authenticate, requireModule("crm"), requireManagerTier, getAiPredictive);
router.get("/executive-dashboard", authenticate, requireModule("crm"), requireManagerTier, getExecutiveDashboard);

module.exports = router;