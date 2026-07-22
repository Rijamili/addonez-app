const { verifyToken } = require("../utils/jwt");
const { error } = require("../utils/response");
const TenantDirectory = require("../config/TenantDirectory");
const requestContext = require("../config/requestContext");

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return error(res, "No token provided.", 401);
  }

 try {
  const token = header.split(" ")[1];

  console.log("Received Token:");
  console.log(token);

  req.user = verifyToken(token);

  console.log("Decoded Token:");
  console.log(req.user);

} catch (err) {
  console.error("JWT Verify Error:", err);

  return error(res, "Invalid or expired token.", 401);
}

  // ✅ FIXED LINE
  const tenant = TenantDirectory.findById(req.user.tenantId);

  if (!tenant) {
    return error(res, "Tenant not found.", 403);
  }

  req.tenant = tenant;
  requestContext.run(tenant, () => next());
};

const authorize = (...roles) => (req, res, next) => {
  console.log("Required Roles:", roles);
  console.log("User Role:", req.user.role);

  if (!roles.includes(req.user.role)) {
    return error(res, "Insufficient permissions.", 403);
  }

  next();
};

module.exports = { authenticate, authorize };