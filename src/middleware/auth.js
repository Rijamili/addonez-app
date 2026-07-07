// src/middleware/auth.js
const { verifyToken } = require("../utils/jwt");
const { error }       = require("../utils/response");
const TenantDirectory = require("../config/TenantDirectory");
const requestContext  = require("../config/requestContext");

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return error(res, "No token provided.", 401);

  try {
    req.user = await verifyToken(header.split(" ")[1]);
  } catch {
    return error(res, "Invalid or expired token.", 401);
  }

  const tenant = TenantDirectory.getById(req.user.tenantId);
  if (!tenant) {
    return error(res, "Your organization's access has been removed. Please contact support.", 403);
  }
  req.tenant = tenant;
  requestContext.run(tenant, () => next());
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return error(res, "Insufficient permissions.", 403);
  next();
};

module.exports = { authenticate, authorize };