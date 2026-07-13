const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/auth");
const {
  getERPPreferences,
} = require("../controllers/erpPreferencesController");

router.get("/", authenticate, getERPPreferences);

module.exports = router;