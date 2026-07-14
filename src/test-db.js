require("dotenv").config();

const pool = require("./config/db");

(async () => {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("✅ Connected!");
    console.log(res.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();