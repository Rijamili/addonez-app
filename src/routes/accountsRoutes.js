const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { requireModule } = require("../middleware/requireModule");
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

router.get("/", authenticate, requireModule("finance"), getAccountsSummary);
router.get("/profit-and-loss",      authenticate, requireModule("finance"), getProfitAndLoss);
router.get("/balance-sheet",        authenticate, requireModule("finance"), getBalanceSheet);
router.get("/cash-flow",            authenticate, requireModule("finance"), getCashFlow);
router.get("/general-ledger",       authenticate, requireModule("finance"), getGeneralLedger);
router.get("/day-book",             authenticate, requireModule("finance"), getDayBook);
router.get("/trial-balance",        authenticate, requireModule("finance"), getTrialBalance);
router.get("/aged-partner-balance", authenticate, requireModule("finance"), getAgedPartnerBalance);
router.get("/partner-ledger",       authenticate, requireModule("finance"), getPartnerLedger);
router.get("/tax-report",           authenticate, requireModule("finance"), getTaxReport);
router.get("/audit-trail",          authenticate, requireModule("finance"), getAuditTrail);

module.exports = router;