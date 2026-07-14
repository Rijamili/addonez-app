const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { requireModule } = require("../middleware/requireModule");
const { getFinance } = require("../controllers/financeController");
router.get("/", authenticate, requireModule("finance"), getFinance);
module.exports = router;