const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { getAnalytics, getPredictions } = require("../controllers/analyticsController");

router.get("/",            authenticate, getAnalytics);
router.get("/predictions", authenticate, getPredictions);

module.exports = router;