require("dotenv").config();
const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

(async () => {
  try {
    await client.connect();
    console.log("✅ PostgreSQL Connected Successfully");

    const result = await client.query("SELECT current_database();");
    console.log(result.rows);

    await client.end();
  } catch (err) {
    console.error("❌ Connection Error:");
    console.error(err);
  }
})();