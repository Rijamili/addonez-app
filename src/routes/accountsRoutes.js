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
} = require("../controllers/accountsController");

router.get("/", authenticate, getAccountsSummary);
router.get("/profit-and-loss", authenticate, getProfitAndLoss);
router.get("/balance-sheet",   authenticate, getBalanceSheet);
router.get("/cash-flow",       authenticate, getCashFlow);
router.get("/general-ledger",  authenticate, getGeneralLedger);
router.get("/day-book",        authenticate, getDayBook);

module.exports = router;