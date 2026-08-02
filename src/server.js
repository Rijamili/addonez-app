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
const sequelize = require("./config/database");
const TenantDirectory = require("./config/TenantDirectory");
const Tenant = require("./models/Tenant");

require("./models/TenantUser");
require("./models/AttendanceRecord");
require("./models/AttendanceSettings");

const app = express();
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10kb" }));
// app.use("/api", rateLimit({
//   windowMs: 15 * 60 * 1000, max: 1000,
//   message: { success: false, message: "Too many requests." },
// }));

app.use("/api/auth",      require("./routes/authRoutes"));
app.use("/api/admin",     require("./routes/adminRoutes"));
app.use("/api/bootstrap", require("./routes/bootstrapRoutes"));
app.use("/api/odoo",      require("./routes/odooRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/modules",   require("./routes/modulesRoutes"));
app.use("/api/sales",     require("./routes/salesRoutes"));
app.use("/api/finance",   require("./routes/financeRoutes"));

app.use("/api/accounts",      require("./routes/accountsRoutes"));
app.use("/api/crm",           require("./routes/crmRoutes"));
app.use("/api/manufacturing", require("./routes/manufacturingRoutes"));

app.use("/api/attendance", require("./routes/attendanceRoutes"));
app.use("/api/projects",  require("./routes/projectRoutes"));
app.use("/api/profile",   require("./routes/profileRoutes"));
app.use("/api/analytics", require("./routes/analyticsRoutes"));
app.use("/api/notifications", require("./routes/notificationsRoutes"));
app.use("/api/security", securityRoutes);
app.use("/api/version", require("./routes/versionRoutes"));
app.use("/api/erp-preferences", erpPreferencesRoutes);
app.use("/api/help-support", require("./routes/helpSupportRoutes"));


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
app.get("/", (req, res) => {
  res.send("API is running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
app.get("/debug/tenants", async (req, res) => {
  const Tenant = require("./models/Tenant");

  const count = await Tenant.count();
  const rows = await Tenant.findAll({ raw: true });

  res.json({
    count,
    rows,
  });
});
app.use("*", (req, res) => res.status(404).json({ success: false, message: "Route not found." }));
app.use(errorHandler);

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database Authentication Successful");

    // sync() creates tables from the models if they don't exist yet —
    // this MUST run before anything else queries a table directly.
    // (Previously several debug SELECT queries ran here, before sync(),
    // which crashed on a genuinely empty/fresh database since "tenants"
    // didn't exist yet — this only worked before because every prior
    // environment already had tables from earlier setup. The debug
    // queries themselves have been removed since they were just leftover
    // logging clutter, not needed for the app to function.)
    await sequelize.sync();
    console.log("✅ Database Synced");

    await TenantDirectory.reload();
    console.log("✅ Tenant Directory Reloaded");

  } catch (err) {
    console.error("❌ Database Startup Error");
    throw err;
  }

  // Load legacy Odoo config
  try {
    await OdooConfigService.loadFromOdoo();
  } catch (err) {
    console.warn(`⚠️ ${err.message}`);
  }

  // Start Express server
  app.listen(bootstrap.server.port, "0.0.0.0", async () => {
    console.log(
      `🚀 Server running on port ${bootstrap.server.port} [${bootstrap.server.nodeEnv}]`
    );

    const status = await OdooService.ping();

    if (status.connected) {
      console.log(
        `✅ Legacy default Odoo connected → ${status.host} / ${status.db}`
      );
    } else {
      console.log(
        `ℹ️ No legacy default Odoo connection (tenant logins still work).`
      );
    }
  });
};

start().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
