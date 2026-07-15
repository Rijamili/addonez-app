// mint-token.js
const jwt = require("jsonwebtoken");

const JWT_SECRET = "addonez_super_secret_key_2024"; // from .env or Render dashboard

const token = jwt.sign(
  {
    uid: 1,
    odooUserId: 1,
    email: "info@addonez.com",
    name: "Addonez Admin",
    role: "admin",
    tenantId: "addonez-demo", // must match an existing tenant_id
    groupIds: [],
  },
  JWT_SECRET,
  { expiresIn: "7d" }
);

console.log(token);