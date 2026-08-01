// src/middleware/attendanceAccess.js
//
// Attendance has its own 3-tier role model layered on top of the app's
// normal auth (req.user), resolved once at login and carried in the JWT
// as req.user.attendanceRole:
//
//   "admin"    — the tenant's super_admin. Sees/manages every company.
//   "company"  — an HR/attendance manager for one or more companies
//                (Odoo group hr_attendance.group_hr_attendance_manager).
//                Restricted to req.user.companyIds.
//   "employee" — a regular worker with their own hr.employee record
//                (req.user.employeeId). Restricted to their own data.
//
// See authController.login for how attendanceRole/employeeId get set.

const { error } = require("../utils/response");

// Blocks the route unless the caller's attendanceRole is one of `roles`.
const requireAttendanceRole = (...roles) => (req, res, next) => {
  const role = req.user?.attendanceRole;
  if (!role || !roles.includes(role)) {
    return error(
      res,
      "You don't have permission to perform this attendance action.",
      403
    );
  }
  next();
};

// Resolves req.attendanceCompanyIds — the set of Odoo res.company ids
// this request is allowed to touch — and rejects any attempt by a
// "company" user to reach outside their own company. Must run AFTER
// authenticate (needs req.user) and typically after requireAttendanceRole.
//
//   admin    -> a specific ?companyId if given, otherwise null (= all companies)
//   company  -> intersected with their own companyIds; a mismatched
//               ?companyId is rejected outright rather than silently
//               narrowed, so a bad/forged param never fails open.
//   employee -> not applicable here (employees don't pass companyId at
//               all — their own attendance is scoped by employeeId, see
//               requireOwnEmployee below).
const resolveCompanyScope = (req, res, next) => {
  const role = req.user?.attendanceRole;
  const raw = req.query.companyId ?? req.body?.companyId;
  const requestedCompanyId = raw !== undefined && raw !== null && raw !== "" ? parseInt(raw, 10) : null;

  if (role === "admin") {
    req.attendanceCompanyIds = requestedCompanyId ? [requestedCompanyId] : null;
    return next();
  }

  const ownCompanyIds =
    Array.isArray(req.user?.companyIds) && req.user.companyIds.length
      ? req.user.companyIds
      : req.user?.companyId
      ? [req.user.companyId]
      : [];

  if (!ownCompanyIds.length) {
    return error(res, "Your account isn't linked to a company in Odoo.", 403);
  }

  if (requestedCompanyId && !ownCompanyIds.includes(requestedCompanyId)) {
    return error(res, "You don't have access to that company's attendance data.", 403);
  }

  req.attendanceCompanyIds = requestedCompanyId ? [requestedCompanyId] : ownCompanyIds;
  next();
};

// For the employee-only endpoints (check-in/out, "my attendance", "my
// tasks"...) — makes sure an employee account actually has a linked
// hr.employee record, and forces every downstream lookup to their own
// employeeId regardless of anything a request tries to pass in.
const requireOwnEmployee = (req, res, next) => {
  if (!req.user?.employeeId) {
    return error(
      res,
      "No employee record is linked to this account yet — contact your company admin.",
      403
    );
  }
  next();
};

module.exports = { requireAttendanceRole, resolveCompanyScope, requireOwnEmployee };