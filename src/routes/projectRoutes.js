const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { getProjects, getTasks } = require("../controllers/projectController");
router.get("/",      authenticate, getProjects);
router.get("/tasks", authenticate, getTasks);
module.exports = router;