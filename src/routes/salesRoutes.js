const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { requireModule } = require("../middleware/requireModule");
const { getSales, getMonthlySales } = require("../controllers/salesController");
router.get("/",        authenticate, requireModule("sales"), getSales);
router.get("/monthly", authenticate, requireModule("sales"), getMonthlySales);
module.exports = router;