const { Sequelize } = require("sequelize");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Check this environment's env vars — " +
    "Sequelize needs a full Postgres connection string here."
  );
}

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: console.log,

  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
});

module.exports = sequelize;