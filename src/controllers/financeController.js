const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getFinance = async (req, res) => {
  const { partnerId } = req.user;
  try {
    const base = [["partner_id", "=", partnerId], ["state", "=", "posted"]];
    const [inflows, outflows] = await Promise.all([
      odoo.searchRead("account.move", [...base, ["move_type", "=", "out_invoice"]],
        ["name", "amount_total", "payment_state", "invoice_date"], 200),
      odoo.searchRead("account.move", [...base, ["move_type", "=", "in_invoice"]],
        ["name", "amount_total", "payment_state", "invoice_date"], 200),
    ]);

    const groupByMonth = (records) => {
      const map = {};
      records.forEach((r) => {
        if (!r.invoice_date) return;
        const [y, m] = r.invoice_date.split("-");
        const key    = `${y}-${m}`;
        const label  = new Date(y, m - 1, 1).toLocaleString("default", { month: "short", year: "numeric" });
        if (!map[key]) map[key] = { key, label, total: 0, count: 0 };
        map[key].total += Number(r.amount_total || 0);
        map[key].count += 1;
      });
      return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
    };

    const im   = Object.fromEntries(groupByMonth(inflows).map((m)  => [m.key, m]));
    const om   = Object.fromEntries(groupByMonth(outflows).map((m) => [m.key, m]));
    const keys = [...new Set([...Object.keys(im), ...Object.keys(om)])].sort();

    return success(res, {
      monthlyData: keys.map((k) => ({
        key: k, label: im[k]?.label || om[k]?.label,
        inflow: im[k]?.total || 0, outflow: om[k]?.total || 0,
        inflowCount: im[k]?.count || 0, outflowCount: om[k]?.count || 0,
      })),
      invoices: inflows,
    });
  } catch (err) {
    return error(res, err.message);
  }
};