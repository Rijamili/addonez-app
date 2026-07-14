require("dotenv").config();

const sequelize = require("./config/database");
const Tenant = require("./models/Tenant");

(async () => {
  try {
    await sequelize.authenticate();

    console.log("✅ Sequelize Connected");

    const tenants = await Tenant.findAll();

    console.log(tenants);

    process.exit();
  } catch (err) {
    console.error(err);
  }
})();