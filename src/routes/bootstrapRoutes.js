const express = require("express");
const router = express.Router();

const { body } = require("express-validator");
const { validate } = require("../middleware/validate");

const { bootstrap } = require("../controllers/bootstrapController");

router.post(
  "/",
  [
    body("id").notEmpty(),
    body("name").notEmpty(),

    body("odoo.host").notEmpty(),
    body("odoo.db").notEmpty(),

    body("odoo.adminUsername").notEmpty(),
    body("odoo.adminPassword").notEmpty(),

    body("users").optional().isArray(),
    validate,
  ],
  bootstrap
);

module.exports = router;