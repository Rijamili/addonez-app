const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const {
  getAccountsSummary,
  getProfitAndLoss,
  getBalanceSheet,
  getCashFlow,
  getGeneralLedger,
  getDayBook,
  getTrialBalance,
  getAgedPartnerBalance,
  getPartnerLedger,
  getTaxReport,
  getAuditTrail,
} = require("../controllers/accountsController");

router.get("/", authenticate, getAccountsSummary);
router.get("/profit-and-loss",      authenticate, getProfitAndLoss);
router.get("/balance-sheet",        authenticate, getBalanceSheet);
router.get("/cash-flow",            authenticate, getCashFlow);
router.get("/general-ledger",       authenticate, getGeneralLedger);
router.get("/day-book",             authenticate, getDayBook);
router.get("/trial-balance",        authenticate, getTrialBalance);
router.get("/aged-partner-balance", authenticate, getAgedPartnerBalance);
router.get("/partner-ledger",       authenticate, getPartnerLedger);
router.get("/tax-report",           authenticate, getTaxReport);
router.get("/audit-trail",          authenticate, getAuditTrail);

module.exports = router;