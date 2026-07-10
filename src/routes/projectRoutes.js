const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { getProjects, getTasks, getTaskAnalysis } = require("../controllers/projectController");
router.get("/",      authenticate, getProjects);
router.get("/tasks", authenticate, getTasks);
router.get("/:id/task-analysis", authenticate, getTaskAnalysis);
module.exports = router;