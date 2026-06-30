const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { getCrmSummary, getLeads } = require("../controllers/crmController");

router.get("/", authenticate, getCrmSummary);
router.get("/leads", authenticate, getLeads);

module.exports = router;