const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/auth");
const profileController = require("../controllers/profileController");

// Get Profile
router.get("/", authenticate, profileController.getProfile);

// Update Notification Settings
router.put(
  "/notifications",
  authenticate,
  profileController.updateNotifications
);

// Change Password
router.put(
  "/change-password",
  authenticate,
  profileController.changePassword
);

module.exports = router;