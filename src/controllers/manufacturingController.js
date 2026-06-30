const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

// GET /api/manufacturing  →  KPI tiles + report group list
exports.getManufacturingSummary = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [doneToday, inProgress, allOrders] = await Promise.all([
      odoo.searchRead(
        "mrp.production",
        [["state", "=", "done"], ["date_finished", ">=", `${today} 00:00:00`]],
        ["product_qty"],
        500
      ),
      odoo.searchRead(
        "mrp.production",
        [["state", "in", ["confirmed", "progress"]]],
        ["id", "state"],
        500
      ),
      odoo.searchRead(
        "mrp.production",
        [],
        ["state"],
        2000
      ),
    ]);

    const unitsToday = doneToday.reduce((s, r) => s + Number(r.product_qty || 0), 0);
    const totalOrders = allOrders.length || 1;
    const doneOrders   = allOrders.filter((o) => o.state === "done").length;
    const machineUtilization = Math.round((doneOrders / totalOrders) * 100);

    return success(res, {
      kpis: {
        todaysProduction: unitsToday,
        ordersInProgress: inProgress.length,
        machineUtilization,
        qualityScore: 96, // wire to quality.check pass rate when the Quality app is installed
      },
      reportGroups: [
        { key: "production",    label: "Production" },
        { key: "work-orders",   label: "Work orders" },
        { key: "inventory",     label: "Inventory and material" },
        { key: "quality",       label: "Quality" },
        { key: "procurement",   label: "Procurement" },
        { key: "maintenance",   label: "Maintenance" },
        { key: "workforce",     label: "Workforce" },
        { key: "cost",          label: "Cost and profitability" },
        { key: "ai-predictive", label: "AI predictive" },
        { key: "executive-dashboard", label: "Executive dashboard" },
      ],
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/manufacturing/work-orders  →  drill-down example for "Work orders"
exports.getWorkOrders = async (req, res) => {
  try {
    const orders = await odoo.searchRead(
      "mrp.production",
      [],
      ["name", "product_id", "product_qty", "state", "date_planned_start", "date_deadline"],
      200
    );
    return success(res, orders);
  } catch (err) {
    return error(res, err.message);
  }
};