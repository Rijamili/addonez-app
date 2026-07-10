const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { getFinance } = require("../controllers/financeController");
router.get("/", authenticate, getFinance);
module.exports = router;