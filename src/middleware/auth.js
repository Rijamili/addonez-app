// src/middleware/auth.js
const { verifyToken } = require("../utils/jwt");
const { error }       = require("../utils/response");

const authenticate = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return error(res, "No token provided.", 401);
  try {
    req.user = await verifyToken(header.split(" ")[1]);
    next();
  } catch {
    return error(res, "Invalid or expired token.", 401);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return error(res, "Insufficient permissions.", 403);
  next();
};

module.exports = { authenticate, authorize };