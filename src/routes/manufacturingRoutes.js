const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { getManufacturingSummary, getWorkOrders } = require("../controllers/manufacturingController");

router.get("/", authenticate, getManufacturingSummary);
router.get("/work-orders", authenticate, getWorkOrders);

module.exports = router;