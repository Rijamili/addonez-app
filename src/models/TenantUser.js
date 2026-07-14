const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TenantUser = sequelize.define(
  "TenantUser",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    tenant_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
  },
  {
    tableName: "tenant_users",
    timestamps: false,
  }
);

module.exports = TenantUser;