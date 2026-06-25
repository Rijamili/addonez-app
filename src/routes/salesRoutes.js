const express = require("express");
const router = express.Router();
const { getSales } = require("../controllers/salesController");
router.get("/", getSales);
module.exports = router;
