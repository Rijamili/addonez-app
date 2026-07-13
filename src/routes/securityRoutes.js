const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/auth");
const securityController = require("../controllers/securityController");

router.post(
  "/change-password",
  authenticate,
  securityController.changePassword
);

module.exports = router;