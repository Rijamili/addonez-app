const express = require("express");
const router = express.Router();
const { getFinance } = require("../controllers/financeController");
router.get("/", getFinance);
module.exports = router;
