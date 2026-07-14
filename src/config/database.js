const { Sequelize } = require("sequelize");

console.log("DATABASE_URL:", process.env.DATABASE_URL);

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: console.log,

  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },

  pool: {
    max: 5,
    min: 0,
    idle: 10000,
    acquire: 60000,
  },

  retry: {
    max: 3,
  },
});

module.exports = sequelize;