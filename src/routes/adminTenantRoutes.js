const express = require("express");
const router = express.Router();

const {
  createTenant,
} = require("../controllers/adminTenantController");

router.post("/tenants", createTenant);

module.exports = router;