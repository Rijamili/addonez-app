const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/auth");
const {
  getHelpSupport,
} = require("../controllers/helpSupportController");

router.get("/", authenticate, getHelpSupport);

module.exports = router;