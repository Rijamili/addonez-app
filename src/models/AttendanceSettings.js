// src/models/AttendanceSettings.js
// One row per (tenant, company) — lets each company under a tenant's
// Odoo run its own edit-lock window / late threshold / GPS requirement,
// per the "configurable per company" requirement. Managed only by
// Admin (see requireAttendanceRole("admin") on the settings write route);
// Company/Employee can read their own company's row to know their
// current edit cutoff.

const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const AttendanceSettings = sequelize.define(
  "AttendanceSettings",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },

    tenant_id: { type: DataTypes.STRING, allowNull: false },
    company_id: { type: DataTypes.INTEGER, allowNull: false },

    // How many hours after midnight of the attendance date a Company
    // user may still edit/delete that day's record. 24 = editable until
    // the end of the next day. Admin is never subject to this.
    lock_hours: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 24 },

    // "HH:mm" 24h time-of-day. A check-in after this time gets flagged
    // status = "late" instead of "present".
    late_after: { type: DataTypes.STRING, allowNull: false, defaultValue: "09:30" },

    work_start_time: { type: DataTypes.STRING, allowNull: false, defaultValue: "09:00" },
    work_end_time: { type: DataTypes.STRING, allowNull: false, defaultValue: "18:00" },

    // Worked hours below this on a Present day suggest it should really
    // be Half Day — surfaced to the company as a hint, not auto-applied.
    half_day_threshold_hours: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 4 },

    require_gps: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: "attendance_settings",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [{ unique: true, fields: ["tenant_id", "company_id"] }],
  }
);

module.exports = AttendanceSettings;