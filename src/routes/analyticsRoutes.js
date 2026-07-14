const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { requireModule } = require("../middleware/requireModule");
const { getAnalytics, getPredictions } = require("../controllers/analyticsController");

router.get("/",            authenticate, requireModule("analytics"), getAnalytics);
router.get("/predictions", authenticate, requireModule("predictions"), getPredictions);

module.exports = router;