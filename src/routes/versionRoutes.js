const express = require("express");
const router = express.Router();
const OdooService = require("../config/OdooService");

router.get("/", async (req, res) => {
  try {
    const version = await OdooService.execute(
      "ir.module.module",
      "search_read",
      [[["name", "=", "base"]]],
      {
        fields: ["latest_version"],
        limit: 1,
      }
    );

    res.json(version);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

module.exports = router;