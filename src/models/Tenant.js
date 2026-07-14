const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Tenant = sequelize.define(
  "Tenant",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    tenant_id: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },

    company_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    host: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    database_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    port: {
      type: DataTypes.INTEGER,
      defaultValue: 443,
    },

    ssl: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },

    admin_email: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    admin_password: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    status: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: "tenants",
    timestamps: false,
  }
);

module.exports = Tenant;