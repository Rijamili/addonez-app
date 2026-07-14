const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { requireModule } = require("../middleware/requireModule");
const { getProjects, getTasks, getTaskAnalysis } = require("../controllers/projectController");
router.get("/",      authenticate, requireModule("projects"), getProjects);
router.get("/tasks", authenticate, requireModule("projects"), getTasks);
router.get("/:id/task-analysis", authenticate, requireModule("projects"), getTaskAnalysis);
module.exports = router;