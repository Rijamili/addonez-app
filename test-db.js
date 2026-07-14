const sequelize = require("./src/config/database");

(async () => {
  const [rows] = await sequelize.query("SELECT version()");
  console.log(rows);
  process.exit();
})();