// src/models/AttendanceRecord.js
//
// Why this exists alongside Odoo's own hr.attendance:
// hr.attendance is just a check-in/check-out log — it has no concept of
// "Absent", "Half Day", or "Leave" (a day with no clock event is simply
// absent by Odoo's own convention, and Odoo doesn't let us tag a
// half/leave day on the model itself). To support the four statuses the
// mobile app needs while still treating Odoo as the source of truth for
// actual clock events, we keep one row per employee per day here:
//
//   - status governs what the app displays (present/absent/half_day/leave/late)
//   - check_in/check_out/odoo_attendance_id mirror the linked hr.attendance
//     record in Odoo (created/updated by attendanceService any time a
//     Present/Half Day/Late entry is marked or an employee clocks in/out)
//   - absent/leave rows never get an hr.attendance row (no clock event
//     to log), matching how Odoo itself treats a day with no punch
//
// Any read of a date range also runs a reconciliation pass (see
// attendanceService.reconcileFromOdoo) that pulls in any hr.attendance
// row punched directly in Odoo (outside the app) and creates/updates the
// matching row here, so the two are never allowed to drift apart.

const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const AttendanceRecord = sequelize.define(
  "AttendanceRecord",
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

    // Odoo res.company id — the whole point of multi-tenant isolation
    // for this table: every query MUST filter by tenant_id AND
    // company_id together, never company_id alone.
    company_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    // Odoo hr.employee id
    employee_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM("present", "absent", "half_day", "leave", "late"),
      allowNull: false,
      defaultValue: "absent",
    },

    check_in: { type: DataTypes.DATE, allowNull: true },
    check_out: { type: DataTypes.DATE, allowNull: true },
    worked_hours: { type: DataTypes.FLOAT, allowNull: true },

    check_in_lat: { type: DataTypes.FLOAT, allowNull: true },
    check_in_lng: { type: DataTypes.FLOAT, allowNull: true },
    check_out_lat: { type: DataTypes.FLOAT, allowNull: true },
    check_out_lng: { type: DataTypes.FLOAT, allowNull: true },

    // Mirrors the linked hr.attendance row in Odoo, if any (present /
    // half_day / late rows with a real clock event have one; absent /
    // leave rows generally don't).
    odoo_attendance_id: { type: DataTypes.INTEGER, allowNull: true },

    // 'mobile' (employee self check-in/out), 'company' (marked by a
    // company/admin user), 'bulk' (bulk-marked), 'odoo' (reconciled from
    // a punch made directly in Odoo, outside the app).
    source: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "mobile",
    },

    // Odoo res.users id of whoever marked/edited this row (null for
    // pure employee self check-in/out).
    marked_by_user_id: { type: DataTypes.INTEGER, allowNull: true },

    approved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    approved_by_user_id: { type: DataTypes.INTEGER, allowNull: true },
    approved_at: { type: DataTypes.DATE, allowNull: true },

    // Explicit manual lock (independent of the time-based lock window) —
    // an admin can lock a record so no further edits are possible even
    // within the normal edit window.
    locked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: "attendance_records",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { unique: true, fields: ["tenant_id", "employee_id", "date"] },
      { fields: ["tenant_id", "company_id", "date"] },
      { fields: ["tenant_id", "company_id", "status"] },
    ],
  }
);

module.exports = AttendanceRecord;