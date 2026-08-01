// src/routes/attendanceRoutes.js
const express = require("express");
const router = express.Router();

const { authenticate } = require("../middleware/auth");
const { requireModule } = require("../middleware/requireModule");
const {
  requireAttendanceRole,
  resolveCompanyScope,
  requireOwnEmployee,
} = require("../middleware/attendanceAccess");
const ctrl = require("../controllers/attendanceController");

// Every route here requires a normal login, plus (like every other ERP
// screen) the "attendance" entry in MODULE_REGISTRY to be visible for
// this tenant/user — i.e. the hr_attendance app must be installed on
// their Odoo. See config/moduleRegistry.js.
router.use(authenticate, requireModule("attendance"));

const ADMIN = "admin";
const COMPANY = "company";
const EMPLOYEE = "employee";

// ---- Reference data (admin + company) ----
router.get("/companies", requireAttendanceRole(ADMIN, COMPANY), resolveCompanyScope, ctrl.getCompanies);
router.get("/departments", requireAttendanceRole(ADMIN, COMPANY), resolveCompanyScope, ctrl.getDepartments);
router.get("/employees", requireAttendanceRole(ADMIN, COMPANY), resolveCompanyScope, ctrl.getEmployees);
router.get("/leaves", requireAttendanceRole(ADMIN, COMPANY), resolveCompanyScope, ctrl.getLeaves);

// ---- Settings (admin manages; company/employee can read their own) ----
router.get("/settings", requireAttendanceRole(ADMIN, COMPANY, EMPLOYEE), resolveCompanyScope, ctrl.getSettings);
router.patch("/settings", requireAttendanceRole(ADMIN), resolveCompanyScope, ctrl.updateSettings);

// ---- Dashboard / reports / analytics (admin + company) ----
router.get("/dashboard", requireAttendanceRole(ADMIN, COMPANY), resolveCompanyScope, ctrl.getDashboard);
router.get("/reports", requireAttendanceRole(ADMIN, COMPANY), resolveCompanyScope, ctrl.getReport);

// ---- Search/filter/list + CRUD + approval (admin + company) ----
router.get("/", requireAttendanceRole(ADMIN, COMPANY), resolveCompanyScope, ctrl.getAttendanceList);
router.post("/mark", requireAttendanceRole(ADMIN, COMPANY), resolveCompanyScope, ctrl.markAttendance);
router.post("/bulk-mark", requireAttendanceRole(ADMIN, COMPANY), resolveCompanyScope, ctrl.bulkMarkAttendance);
router.patch("/:id/approve", requireAttendanceRole(ADMIN, COMPANY), ctrl.approveAttendance);
router.patch("/:id", requireAttendanceRole(ADMIN, COMPANY), ctrl.updateAttendance);
router.delete("/:id", requireAttendanceRole(ADMIN, COMPANY), ctrl.deleteAttendance);

// ---- Employee self-service ----
router.post("/check-in", requireAttendanceRole(EMPLOYEE), requireOwnEmployee, ctrl.checkIn);
router.post("/check-out", requireAttendanceRole(EMPLOYEE), requireOwnEmployee, ctrl.checkOut);
router.get("/me", requireAttendanceRole(EMPLOYEE), requireOwnEmployee, ctrl.getMyAttendance);
router.get("/me/today", requireAttendanceRole(EMPLOYEE), requireOwnEmployee, ctrl.getMyTodayStatus);
router.get("/me/leaves", requireAttendanceRole(EMPLOYEE), requireOwnEmployee, ctrl.getMyLeaves);
router.get("/me/tasks", requireAttendanceRole(EMPLOYEE), requireOwnEmployee, ctrl.getMyTasks);
router.get("/me/projects", requireAttendanceRole(EMPLOYEE), requireOwnEmployee, ctrl.getMyProjects);

module.exports = router;