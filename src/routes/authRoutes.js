const express = require("express");
const router  = express.Router();
const { body } = require("express-validator");
const { login, forgotPassword, getMe, refreshConfig, reloadTenants } = require("../controllers/authController");
const { authenticate, authorize } = require("../middleware/auth");
const { validate } = require("../middleware/validate");

router.post("/login",
  [body("email").isEmail(), body("password").notEmpty(), validate], login);
router.post("/forgot-password",
  [body("email").isEmail(), validate], forgotPassword);
router.get("/me",             authenticate, getMe);
router.post("/refresh-config", authenticate, authorize("admin"), refreshConfig);
router.post("/reload-tenants", authenticate, authorize("admin"), reloadTenants);
module.exports = router;
