const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { getProfile } = require("../controllers/profileController");
router.get("/", authenticate, getProfile);
router.put("/notifications", auth, profileController.updateNotifications);
router.put(
  "/change-password",
  authenticate,
  profileController.changePassword
);

module.exports = router;