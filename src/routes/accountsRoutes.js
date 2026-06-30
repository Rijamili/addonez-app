const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { getAccountsSummary, getProfitAndLoss } = require("../controllers/accountsController");

router.get("/", authenticate, getAccountsSummary);
router.get("/profit-and-loss", authenticate, getProfitAndLoss);

module.exports = router;