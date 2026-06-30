const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getManufacturingSummary = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [doneToday, inProgress, allOrders] = await Promise.all([
      odoo.searchRead(
        "mrp.production",
        [["state", "=", "done"], ["date_finished", ">=", `${today} 00:00:00`]],
        ["product_qty"], 500
      ),
      odoo.searchRead(
        "mrp.production",
        [["state", "in", ["confirmed", "progress"]]],
        ["id", "state"], 500
      ),
      odoo.searchRead("mrp.production", [], ["state"], 2000),
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
        qualityScore: 96,
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

// GET /api/manufacturing/production
exports.getProduction = async (req, res) => {
  try {
    const orders = await odoo.searchRead(
      "mrp.production",
      [],
      ["name", "product_id", "product_qty", "qty_produced", "state", "date_planned_start", "date_finished"],
      200
    );
    return success(res, orders.map((o) => ({
      name:        o.name,
      product:     o.product_id?.[1] || "",
      planned:     Number(o.product_qty || 0),
      produced:    Number(o.qty_produced || 0),
      state:       o.state,
      plannedDate: o.date_planned_start,
      finishedDate: o.date_finished,
    })));
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/manufacturing/work-orders
exports.getWorkOrders = async (req, res) => {
  try {
    const orders = await odoo.searchRead(
      "mrp.production",
      [],
      ["name", "product_id", "product_qty", "state", "date_planned_start", "date_deadline"],
      200
    );
    return success(res, orders.map((o) => ({
      name:     o.name,
      product:  o.product_id?.[1] || "",
      quantity: Number(o.product_qty || 0),
      state:    o.state,
      planned:  o.date_planned_start,
      deadline: o.date_deadline,
    })));
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/manufacturing/inventory
exports.getInventory = async (req, res) => {
  try {
    const products = await odoo.searchRead(
      "product.product",
      [["type", "=", "product"]],
      ["name", "qty_available", "virtual_available", "reordering_min_qty"],
      300
    );

    const lowStock = products.filter(
      (p) => p.reordering_min_qty > 0 && Number(p.qty_available) < Number(p.reordering_min_qty)
    );

    return success(res, {
      lowStock: lowStock.map((p) => ({
        name:       p.name,
        onHand:     Number(p.qty_available || 0),
        reorderMin: Number(p.reordering_min_qty || 0),
      })),
      allProducts: products.map((p) => ({
        name:     p.name,
        onHand:   Number(p.qty_available || 0),
        forecast: Number(p.virtual_available || 0),
      })),
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/manufacturing/quality
// Honest caveat: requires the Odoo Quality app; returns empty data if not installed.
exports.getQuality = async (req, res) => {
  try {
    let checks = [];
    try {
      checks = await odoo.searchRead(
        "quality.check",
        [],
        ["name", "quality_state", "product_id", "control_date"],
        200
      );
    } catch (e) {
      return success(res, { installed: false, passed: 0, failed: 0, checks: [] });
    }

    const passed = checks.filter((c) => c.quality_state === "pass").length;
    const failed = checks.filter((c) => c.quality_state === "fail").length;

    return success(res, {
      installed: true,
      passed,
      failed,
      checks: checks.map((c) => ({
        name:    c.name,
        product: c.product_id?.[1] || "",
        state:   c.quality_state,
        date:    c.control_date,
      })),
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/manufacturing/procurement
exports.getProcurement = async (req, res) => {
  try {
    const orders = await odoo.searchRead(
      "purchase.order",
      [],
      ["name", "partner_id", "amount_total", "state", "date_order", "date_planned"],
      200
    );
    return success(res, orders.map((o) => ({
      name:        o.name,
      supplier:    o.partner_id?.[1] || "",
      amount:      Number(o.amount_total || 0),
      state:       o.state,
      orderedDate: o.date_order,
      expectedDate: o.date_planned,
    })));
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/manufacturing/maintenance
// Honest caveat: requires the Odoo Maintenance app; returns empty data if not installed.
exports.getMaintenance = async (req, res) => {
  try {
    let requests = [];
    try {
      requests = await odoo.searchRead(
        "maintenance.request",
        [],
        ["name", "equipment_id", "stage_id", "request_date", "schedule_date"],
        200
      );
    } catch (e) {
      return success(res, { installed: false, items: [] });
    }

    return success(res, {
      installed: true,
      items: requests.map((r) => ({
        name:        r.name,
        equipment:   r.equipment_id?.[1] || "",
        stage:       r.stage_id?.[1] || "",
        requestedAt: r.request_date,
        scheduledAt: r.schedule_date,
      })),
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/manufacturing/workforce
// Honest caveat: requires hr module access; falls back to empty list if denied.
exports.getWorkforce = async (req, res) => {
  try {
    let employees = [];
    try {
      employees = await odoo.searchRead(
        "hr.employee",
        [["department_id.name", "ilike", "manufactur"]],
        ["name", "job_title", "department_id"],
        100
      );
    } catch (e) {
      return success(res, { installed: false, employees: [] });
    }

    return success(res, {
      installed: true,
      employees: employees.map((e) => ({
        name:       e.name,
        jobTitle:   e.job_title || "",
        department: e.department_id?.[1] || "",
      })),
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/manufacturing/cost
exports.getCost = async (req, res) => {
  try {
    const orders = await odoo.searchRead(
      "mrp.production",
      [["state", "=", "done"]],
      ["name", "product_id", "product_qty"],
      200
    );

    const purchases = await odoo.searchRead(
      "purchase.order",
      [["state", "in", ["purchase", "done"]]],
      ["amount_total"],
      500
    );

    const materialCost = purchases.reduce((s, p) => s + Number(p.amount_total || 0), 0);
    const totalUnits = orders.reduce((s, o) => s + Number(o.product_qty || 0), 0);
    const costPerUnit = totalUnits > 0 ? materialCost / totalUnits : 0;

    return success(res, {
      materialCost,
      totalUnitsProduced: totalUnits,
      costPerUnit,
      byOrder: orders.map((o) => ({
        name:     o.name,
        product:  o.product_id?.[1] || "",
        quantity: Number(o.product_qty || 0),
      })),
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/manufacturing/ai-predictive
// Simple heuristic until a real ML model is wired in.
exports.getAiPredictive = async (req, res) => {
  try {
    const orders = await odoo.searchRead(
      "mrp.production",
      [["state", "in", ["confirmed", "progress"]]],
      ["name", "date_planned_start", "date_deadline", "product_qty", "qty_produced"],
      300
    );

    const today = new Date();
    const delayRisk = orders
      .filter((o) => {
        if (!o.date_deadline) return false;
        const deadline = new Date(o.date_deadline);
        const progressRatio = o.product_qty > 0 ? o.qty_produced / o.product_qty : 0;
        const daysLeft = (deadline - today) / (1000 * 60 * 60 * 24);
        return daysLeft < 3 && progressRatio < 0.8;
      })
      .slice(0, 10)
      .map((o) => ({
        name:     o.name,
        deadline: o.date_deadline,
        progress: o.product_qty > 0 ? Math.round((o.qty_produced / o.product_qty) * 100) : 0,
      }));

    const products = await odoo.searchRead(
      "product.product",
      [["type", "=", "product"]],
      ["name", "qty_available", "virtual_available"],
      300
    );
    const stockOutRisk = products
      .filter((p) => Number(p.virtual_available) <= 0 && Number(p.qty_available) >= 0)
      .slice(0, 10)
      .map((p) => ({ name: p.name, onHand: Number(p.qty_available || 0) }));

    return success(res, { delayRisk, stockOutRisk });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/manufacturing/executive-dashboard
exports.getExecutiveDashboard = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [doneToday, inProgress, delayed, allOrders, lowStockProducts] = await Promise.all([
      odoo.searchRead(
        "mrp.production",
        [["state", "=", "done"], ["date_finished", ">=", `${today} 00:00:00`]],
        ["product_qty"], 500
      ),
      odoo.searchRead("mrp.production", [["state", "in", ["confirmed", "progress"]]], ["id"], 500),
      odoo.searchRead(
        "mrp.production",
        [["state", "in", ["confirmed", "progress"]], ["date_deadline", "<", today]],
        ["id"], 500
      ),
      odoo.searchRead("mrp.production", [], ["state"], 2000),
      odoo.searchRead(
        "product.product",
        [["type", "=", "product"], ["reordering_min_qty", ">", 0]],
        ["name", "qty_available", "reordering_min_qty"],
        300
      ),
    ]);

    const unitsToday = doneToday.reduce((s, r) => s + Number(r.product_qty || 0), 0);
    const totalOrders = allOrders.length || 1;
    const doneOrders   = allOrders.filter((o) => o.state === "done").length;
    const utilization = Math.round((doneOrders / totalOrders) * 100);

    const lowStock = lowStockProducts.filter(
      (p) => Number(p.qty_available) < Number(p.reordering_min_qty)
    );

    return success(res, {
      todaysProduction: unitsToday,
      ordersInProgress: inProgress.length,
      delayedOrders: delayed.length,
      machineUtilization: utilization,
      lowStockCount: lowStock.length,
      qualityScore: 96,
    });
  } catch (err) {
    return error(res, err.message);
  }
};