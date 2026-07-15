// mint-token.js
const jwt = require("jsonwebtoken");

const JWT_SECRET = "2418ded1b12e7d52585e24f300ced1d945fbdbb389dcffa933a995fe9b8267b3e716762c6d11ff11a0d67818afd91a25ee8753e46c2148f64e5daf2f1e7979ac"; // from .env or Render dashboard

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