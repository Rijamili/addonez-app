const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/auth");
const {
  getNotifications,
} = require("../controllers/notificationsController");

router.get("/", authenticate, getNotifications);

module.exports = router;