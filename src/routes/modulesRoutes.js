// src/routes/modulesRoutes.js
const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { getModules, refreshModules } = require("../controllers/modulesController");

// Any logged-in user on any tenant can ask "what am I allowed to see" —
// this is the same JWT auth as every other screen's API, no special role
// needed. The result is already scoped to that user's own permissions.
router.get("/", authenticate, getModules);
router.post("/refresh", authenticate, refreshModules);

module.exports = router;
