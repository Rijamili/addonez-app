require("dotenv").config();

const express           = require("express");
const cors              = require("cors");
const helmet            = require("helmet");
const rateLimit         = require("express-rate-limit");
const { bootstrap, validateBootstrap } = require("./config/bootstrap");
const OdooConfigService = require("./config/OdooConfigService");
const OdooService       = require("./config/OdooService");
const errorHandler      = require("./middleware/errorHandler");
const securityRoutes = require("./routes/securityRoutes");
const erpPreferencesRoutes = require("./routes/erpPreferencesRoutes");
validateBootstrap();

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  message: { success: false, message: "Too many requests." },
}));

app.use("/api/auth",      require("./routes/authRoutes"));
app.use("/api/admin",     require("./routes/adminRoutes"));
app.use("/api/odoo",      require("./routes/odooRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/modules",   require("./routes/modulesRoutes"));
app.use("/api/sales",     require("./routes/salesRoutes"));
app.use("/api/finance",   require("./routes/financeRoutes"));

app.use("/api/accounts",      require("./routes/accountsRoutes"));
app.use("/api/crm",           require("./routes/crmRoutes"));
app.use("/api/manufacturing", require("./routes/manufacturingRoutes"));

app.use("/api/projects",  require("./routes/projectRoutes"));
app.use("/api/profile",   require("./routes/profileRoutes"));
app.use("/api/analytics", require("./routes/analyticsRoutes"));
app.use("/api/notifications", require("./routes/notificationsRoutes"));
app.use("/api/security", securityRoutes);
app.use("/api/version", require("./routes/versionRoutes"));
app.use("/api/erp-preferences", erpPreferencesRoutes);

app.get("/health", async (req, res) => {
  const odooStatus = await OdooService.ping();
  let legacyConfig = null;
  try {
    legacyConfig = await OdooConfigService.getConfig();
  } catch {
    // No legacy default Odoo configured — expected now, not an error.
  }
  res.json({
    status: "ok",
    odoo:   odooStatus,
    legacyDefaultOdoo: legacyConfig
      ? { host: legacyConfig.odoo.host, db: legacyConfig.odoo.db }
      : "Not configured (BOOTSTRAP_ODOO_* not set) — fine as long as all traffic is tenant-scoped.",
  });
});

app.use("*", (req, res) => res.status(404).json({ success: false, message: "Route not found." }));
app.use(errorHandler);

const start = async () => {
  // Legacy Odoo config is loaded best-effort — it no longer blocks startup,
  // since real client traffic is resolved per-tenant via tenants.json.
  try {
    await OdooConfigService.loadFromOdoo();
  } catch (err) {
    console.warn(`⚠️  ${err.message}`);
  }

  app.listen(bootstrap.server.port, "0.0.0.0", async () => {
    console.log(`🚀 Server running on port ${bootstrap.server.port} [${bootstrap.server.nodeEnv}]`);
    const status = await OdooService.ping();
    if (status.connected) {
      console.log(`✅ Legacy default Odoo connected → ${status.host} / ${status.db}`);
    } else {
      console.log(`ℹ️  No legacy default Odoo connection (this is fine — tenant logins don't need it).`);
    }
  });
};

start().catch((err) => {
  console.error("Fatal startup error:", err.message);
  process.exit(1);
});