// src/routes/odooRoutes.js
// No hardcoded Odoo config — all credentials come from request headers.

const express = require("express");
const router  = express.Router();
const odoo    = require("../config/odooClient");

const asyncRoute = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  });

// ── SALES ─────────────────────────────────────────────────────────────────────
router.get("/sales", asyncRoute(async (req, res) => {
  const orders = await odoo.call(req, "sale.order", "search_read", [[]],
    { fields: ["name", "amount_total", "state"], limit: 10 });
  res.json(orders);
}));

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
router.get("/dashboard", asyncRoute(async (req, res) => {
  const uid = await odoo.authenticate(req);
  const [totalOrders, quotations, orders] = await Promise.all([
    odoo.execute(req, uid, "sale.order", "search_count", [[]]),
odoo.execute(req, uid, "sale.order", "search_count", [[[" state", "=", "draft"]]]),
    odoo.execute(req, uid, "sale.order", "search_read",  [[]], { fields: ["amount_total"] }),
  ]);
  const totalRevenue = orders.reduce((s, o) => s + (o.amount_total || 0), 0);
  res.json({ totalOrders, quotations, totalRevenue, status: "Connected" });
}));

// ── FINANCE ───────────────────────────────────────────────────────────────────
router.get("/finance", asyncRoute(async (req, res) => {
  const uid = await odoo.authenticate(req);

  const fetchMoves = (moveType) =>
    odoo.execute(req, uid, "account.move", "search_read",
      [[[["move_type", "=", moveType], ["state", "=", "posted"]]]],
      { fields: ["name", "amount_total", "payment_state", "invoice_date", "move_type"], limit: 200 }
    );

  const [inflows, outflows] = await Promise.all([
    fetchMoves("out_invoice"),
    fetchMoves("in_invoice"),
  ]);

  const groupByMonth = (records) => {
    const map = {};
    records.forEach((r) => {
      if (!r.invoice_date) return;
      const [year, month] = r.invoice_date.split("-");
      const key   = `${year}-${month}`;
      const label = new Date(year, month - 1, 1).toLocaleString("default", { month: "short", year: "numeric" });
      if (!map[key]) map[key] = { key, label, total: 0, count: 0 };
      map[key].total += Number(r.amount_total || 0);
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  };

  const inflowMap  = Object.fromEntries(groupByMonth(inflows).map((m)  => [m.key, m]));
  const outflowMap = Object.fromEntries(groupByMonth(outflows).map((m) => [m.key, m]));
  const allMonths  = [...new Set([...Object.keys(inflowMap), ...Object.keys(outflowMap)])].sort();

  const monthlyData = allMonths.map((key) => ({
    key,
    label:        inflowMap[key]?.label  || outflowMap[key]?.label,
    inflow:       inflowMap[key]?.total  || 0,
    outflow:      outflowMap[key]?.total || 0,
    inflowCount:  inflowMap[key]?.count  || 0,
    outflowCount: outflowMap[key]?.count || 0,
  }));

  res.json({ monthlyData, invoices: inflows });
}));

// ── PROJECTS ──────────────────────────────────────────────────────────────────
router.get("/projects", asyncRoute(async (req, res) => {
  const projects = await odoo.call(req, "project.project", "search_read", [[]],
    { fields: ["name", "active"], limit: 20 });
  res.json(projects);
}));

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
router.get("/analytics", asyncRoute(async (req, res) => {
  const sales = await odoo.call(req, "sale.order", "search_read", [[]],
    { fields: ["amount_total"], limit: 20 });
  const totalRevenue = sales.reduce((s, o) => s + o.amount_total, 0);
  res.json({ totalRevenue, totalOrders: sales.length, sales });
}));

// ── PRODUCTS ──────────────────────────────────────────────────────────────────
router.get("/products", asyncRoute(async (req, res) => {
  const products = await odoo.call(req, "product.template", "search_read", [[]],
    { fields: ["name"], limit: 20 });
  res.json(products);
}));

// ── PROFILE ───────────────────────────────────────────────────────────────────
router.get("/profile", asyncRoute(async (req, res) => {
  const uid  = await odoo.authenticate(req);
  const user = await odoo.execute(req, uid, "res.users", "read", [[uid]],
    { fields: ["name", "login", "groups_id"] });
  res.json({ name: user[0].name, email: user[0].login });
}));

// ── PREDICTIONS ───────────────────────────────────────────────────────────────
router.get("/predictions", asyncRoute(async (req, res) => {
  const sales = await odoo.call(req, "sale.order", "search_read", [[]],
    { fields: ["amount_total"], limit: 50 });
  const totalRevenue     = sales.reduce((s, o) => s + Number(o.amount_total || 0), 0);
  const predictedRevenue = totalRevenue * 1.12;
  const predictedOrders  = Math.round(sales.length * 1.18);
  res.json({
    currentRevenue: totalRevenue, currentOrders: sales.length,
    predictedRevenue, predictedOrders, growth: "12%",
    insight: predictedRevenue > totalRevenue
      ? "Revenue is expected to grow based on recent sales."
      : "Revenue may remain stable based on current sales.",
  });
}));

// ── MONTHLY SALES ─────────────────────────────────────────────────────────────
router.get("/monthly-sales", asyncRoute(async (req, res) => {
  const orders = await odoo.call(req, "sale.order", "search_read", [[]],
    { fields: ["date_order", "amount_total"] });
  const months = { Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:0,Jul:0,Aug:0,Sep:0,Oct:0,Nov:0,Dec:0 };
  orders.forEach((o) => {
    const m = new Date(o.date_order).toLocaleString("en-US", { month: "short" });
    months[m] += Number(o.amount_total || 0);
  });
  res.json(Object.keys(months).map((month) => ({ month, amount: months[month] })));
}));

module.exports = router;