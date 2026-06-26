const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { getSales, getMonthlySales } = require("../controllers/salesController");
router.get("/",        authenticate, getSales);
router.get("/monthly", authenticate, getMonthlySales);
module.exports = router;