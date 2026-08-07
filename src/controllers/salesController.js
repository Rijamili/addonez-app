const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");
const { withOwnerFilter } = require("../config/dataScope");

exports.getSales = async (req, res) => {
  const { uid }  = req.user;
  const limit    = parseInt(req.query.limit  || "20");
  const offset   = parseInt(req.query.offset || "0");
  const sortDir  = (req.query.sort || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  // sortBy lets a caller ask for the highest-VALUE orders first
  // (?sortBy=amount_total) instead of the most recent ones. Previously
  // this always sorted by date_order — which is fine for a general
  // sales list, but meant the Dashboard's "Top Sales Orders" widget
  // (which should show the biggest deals) was actually just showing
  // the newest ones instead.
  const sortBy   = req.query.sortBy === "amount_total" ? "amount_total" : "date_order";
  try {
    // Employees only see orders where they're the salesperson. Company
    // owners/Admin see every order their Odoo company context allows
    // (allowed_company_ids, applied automatically in OdooService) —
    // previously EVERY role was scoped to "user_id.id = uid", which
    // meant a company owner only ever saw their own personal orders
    // instead of the whole company's.
    const domain = withOwnerFilter([], "user_id.id", req);

    // The paginated list (for displaying rows) and the true total (across
    // ALL of this user's orders, not just the current page) come from
    // separate queries — see prior note on why.
    //
    // The paginated `orders` list is sorted by date_order so it shows the
    // most RECENT orders first (desc by default, ?sort=asc to flip it).
    // The `allOrders` total-sum query doesn't need a sort — every row is
    // read regardless of order.
    const [orders, allOrders] = await Promise.all([
      odoo.searchRead(
        "sale.order", domain,
        ["name", "partner_id", "amount_total", "state", "date_order"],
        limit, offset,
        `${sortBy} ${sortDir}`
      ),
      odoo.searchRead("sale.order", domain, ["amount_total"], 5000),
    ]);

    const totalSales = allOrders.reduce((s, o) => s + Number(o.amount_total || 0), 0);

    return success(res, { orders, totalSales, totalCount: allOrders.length });
  } catch (err) {
    // A fresh tenant whose Odoo doesn't have the Sales app installed
    // yet will fail here with "Object sale.order doesn't exist" — the
    // Dashboard's "Top Sales Orders" widget calls this unconditionally
    // (it isn't gated behind requireModule("sales") the way the Sales
    // screen itself is), so this needs to degrade to an empty result
    // rather than 500 and take the whole dashboard down with it.
    if (/doesn't exist|does not exist/i.test(err.message || "")) {
      return success(res, { orders: [], totalSales: 0, totalCount: 0 });
    }
    return error(res, err.message);
  }
};

// GET /api/sales/:id — single order detail (used by the "view sales
// order" link from Day Book and anywhere else that needs to open one
// specific order rather than the list).
exports.getSaleOrder = async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    if (!orderId) return error(res, "A valid order id is required.", 400);

    const domain = withOwnerFilter([["id", "=", orderId]], "user_id.id", req);
    const orders = await odoo.searchRead(
      "sale.order", domain,
      ["name", "partner_id", "amount_total", "amount_untaxed", "amount_tax", "state", "date_order", "user_id"],
      1
    );
    if (!orders.length) return error(res, "Order not found, or you don't have access to it.", 404);

    const lines = await odoo.searchRead(
      "sale.order.line",
      [["order_id", "=", orderId], ["display_type", "=", false]],
      ["name", "product_uom_qty", "price_unit", "price_subtotal"],
      200
    );

    return success(res, {
      ...orders[0],
      lines: lines.map((l) => ({
        name: l.name,
        quantity: l.product_uom_qty,
        unitPrice: l.price_unit,
        subtotal: l.price_subtotal,
      })),
    });
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getMonthlySales = async (req, res) => {
  const { uid } = req.user;
  try {
    const domain = withOwnerFilter([], "user_id.id", req);
    const orders = await odoo.searchRead("sale.order", domain, ["date_order", "amount_total"]);
    const months = { Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:0,Jul:0,Aug:0,Sep:0,Oct:0,Nov:0,Dec:0 };
    orders.forEach((o) => {
      const m = new Date(o.date_order).toLocaleString("en-US", { month: "short" });
      if (months[m] !== undefined) months[m] += Number(o.amount_total || 0);
    });
    return success(res, Object.keys(months).map((month) => ({ month, amount: months[month] })));
  } catch (err) {
    // Same "Sales app not installed yet on this fresh tenant" case as
    // getSales — degrade to an empty (all-zero) chart instead of 500ing.
    if (/doesn't exist|does not exist/i.test(err.message || "")) {
      const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      return success(res, months.map((month) => ({ month, amount: 0 })));
    }
    return error(res, err.message);
  }
};