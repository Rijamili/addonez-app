const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { requireModule } = require("../middleware/requireModule");
const { requireManagerTier } = require("../middleware/roleGate");
const {
  getTimesheets,
  createTimesheet,
  updateTimesheet,
  deleteTimesheet,
  getTimesheetReport,
} = require("../controllers/timesheetController");

router.use(authenticate, requireModule("timesheets"));

router.get("/report", requireManagerTier, getTimesheetReport);
router.get("/", getTimesheets);
router.post("/", createTimesheet);
router.patch("/:id", updateTimesheet);
router.delete("/:id", deleteTimesheet);

module.exports = router;