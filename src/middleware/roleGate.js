// src/middleware/roleGate.js
// Generic (not Attendance-specific) route guard: blocks employee-tier
// logins from aggregate/leadership views — company-wide win rate,
// revenue forecasts, executive dashboards, etc. — that are inherently
// manager-level, even in modules that otherwise let an employee see
// their own individual records (leads, opportunities, tasks...).
const { error } = require("../utils/response");

const requireManagerTier = (req, res, next) => {
  if (req.user?.attendanceRole === "employee") {
    return error(res, "This report is only available to company managers and admins.", 403);
  }
  next();
};

module.exports = { requireManagerTier };