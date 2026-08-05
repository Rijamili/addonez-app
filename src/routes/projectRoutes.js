const express = require("express");
const router  = express.Router();
const { authenticate } = require("../middleware/auth");
const { requireModule } = require("../middleware/requireModule");
const { requireManagerTier } = require("../middleware/roleGate");
const {
  getProjects,
  getTasks,
  getTaskAnalysis,
  getTags,
  createTag,
  deleteTag,
  getRatings,
  getTasksAnalysis,
  getProjectRoles,
  createProjectRole,
  deleteProjectRole,
  getActivityTypes,
  getCollaborators,
  assignCollaboratorRole,
  removeCollaborator,
} = require("../controllers/projectController");

router.use(authenticate, requireModule("projects"));

router.get("/",      getProjects);
router.get("/tasks", getTasks);
router.get("/tasks-analysis", getTasksAnalysis);
router.get("/:id/task-analysis", getTaskAnalysis);
router.get("/:id/ratings", getRatings);

// Tags — reading is open to everyone (needed to filter/display tasks),
// creating/deleting is Company/Admin (Configuration-level, matches Odoo).
router.get("/tags", getTags);
router.post("/tags", requireManagerTier, createTag);
router.delete("/tags/:id", requireManagerTier, deleteTag);

// Project Roles — same read-open / write-restricted split.
router.get("/roles", getProjectRoles);
router.post("/roles", requireManagerTier, createProjectRole);
router.delete("/roles/:id", requireManagerTier, deleteProjectRole);

// Activity Types — platform-wide Odoo concept, read-only from this app.
router.get("/activity-types", getActivityTypes);

// Collaborators (assigning a Project Role to a project member) — reading
// requires project access (enforced in the controller for employees),
// writing is Company/Admin only.
router.get("/:id/collaborators", getCollaborators);
router.post("/:id/collaborators", requireManagerTier, assignCollaboratorRole);
router.delete("/:id/collaborators/:collabId", requireManagerTier, removeCollaborator);

module.exports = router;