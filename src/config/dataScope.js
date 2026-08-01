// src/config/dataScope.js
//
// Reused app-wide (not just Attendance) version of the same 3-tier
// privacy model: Admin/Company see everything their Odoo multi-company
// context already allows (via allowed_company_ids — see OdooService),
// while an Employee-tier login should only ever see records tied to
// them personally (their own sales orders, leads, assigned tasks,
// invoices, dashboard numbers...).
//
// req.user.attendanceRole is resolved once at login (see
// authController.login) via Odoo's has_group() method call — despite
// the name, it's really "what tier of data access does this login get",
// and every module below reads it the same way Attendance does.

function isOwnDataOnly(req) {
  return req.user?.attendanceRole === "employee";
}

// Convenience: prepends an ownership domain clause when the caller is
// employee-tier, otherwise returns the domain unchanged. `field` is the
// Odoo field that identifies the record's owner (e.g. "user_id",
// "invoice_user_id", "user_ids").
function withOwnerFilter(domain, field, req, { many2many = false } = {}) {
  if (!isOwnDataOnly(req)) return domain;
  const uid = req.user.uid;
  const clause = many2many ? [field, "in", [uid]] : [field, "=", uid];
  return [...domain, clause];
}

module.exports = { isOwnDataOnly, withOwnerFilter };