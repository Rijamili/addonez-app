require("dotenv").config();

const express           = require("express");
const cors              = require("cors");
const helmet            = require("helmet");
const rateLimit         = require("express-rate-limit");
const { bootstrap, validateBootstrap } = require("./config/bootstrap");
const OdooConfigService = require("./config/OdooConfigService");
const OdooService       = require("./config/OdooService");
const errorHandler      = require("./middleware/errorHandler");

validateBootstrap();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000, max: 100,
  message: { success: false, message: "Too many requests." },
}));

app.use("/api/auth",      require("./routes/authRoutes"));
app.use("/api/odoo",      require("./routes/odooRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/sales",     require("./routes/salesRoutes"));
app.use("/api/finance",   require("./routes/financeRoutes"));

app.use("/api/accounts",      require("./routes/accountsRoutes"));
app.use("/api/crm",           require("./routes/crmRoutes"));
app.use("/api/manufacturing", require("./routes/manufacturingRoutes"));


app.use("/api/projects",  require("./routes/projectRoutes"));
app.use("/api/profile",   require("./routes/profileRoutes"));
app.use("/api/analytics", require("./routes/analyticsRoutes"));

app.get("/health", async (req, res) => {
  const odooStatus = await OdooService.ping();
  const cfg        = await OdooConfigService.getConfig();
  res.json({
    status: "ok",
    odoo:   odooStatus,
    config: { source: "Odoo System Parameters", host: cfg.odoo.host, db: cfg.odoo.db },
  });
});

app.use("*", (req, res) => res.status(404).json({ success: false, message: "Route not found." }));
app.use(errorHandler);

const start = async () => {
  console.log("🔄 Loading ERP configuration from Odoo System Parameters...");
  await OdooConfigService.loadFromOdoo();

  app.listen(bootstrap.server.port, "0.0.0.0", async () => {
    console.log(`🚀 Server running on port ${bootstrap.server.port} [${bootstrap.server.nodeEnv}]`);
    const status = await OdooService.ping();
    if (status.connected) {
      console.log(`✅ Odoo connected → ${status.host} / ${status.db}`);
    } else {
      console.warn(`⚠️  Odoo connection issue: ${status.error}`);
    }
    console.log(`🔁 Config auto-refreshes every ${bootstrap.server.refreshInterval / 60000} minutes`);
  });
};

start().catch((err) => {
  console.error("Fatal startup error:", err.message);
  process.exit(1);
});