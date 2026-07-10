const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getSales = async (req, res) => {
  const { uid }  = req.user;
  const limit    = parseInt(req.query.limit  || "20");
  const offset   = parseInt(req.query.offset || "0");
  const sortDir  = (req.query.sort || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  try {
    const domain = [["user_id.id", "=", uid]];

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
        `date_order ${sortDir}`
      ),
      odoo.searchRead("sale.order", domain, ["amount_total"], 5000),
    ]);

    const totalSales = allOrders.reduce((s, o) => s + Number(o.amount_total || 0), 0);

    return success(res, { orders, totalSales, totalCount: allOrders.length });
  } catch (err) {
    return error(res, err.message);
  }
};

exports.getMonthlySales = async (req, res) => {
  const { uid } = req.user;
  try {
    const orders = await odoo.searchRead("sale.order", [], ["date_order", "amount_total"]);
    const months = { Jan:0,Feb:0,Mar:0,Apr:0,May:0,Jun:0,Jul:0,Aug:0,Sep:0,Oct:0,Nov:0,Dec:0 };
    orders.forEach((o) => {
      const m = new Date(o.date_order).toLocaleString("en-US", { month: "short" });
      if (months[m] !== undefined) months[m] += Number(o.amount_total || 0);
    });
    return success(res, Object.keys(months).map((month) => ({ month, amount: months[month] })));
  } catch (err) {
    return error(res, err.message);
  }
};