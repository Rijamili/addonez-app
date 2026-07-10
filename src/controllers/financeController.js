const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getFinance = async (req, res) => {
  try {
    const base = [["state", "=", "posted"]];

    const [revenueInvoices, paidInvoices, vendorBills] = await Promise.all([
      // Revenue = all posted customer invoices
      odoo.searchRead(
        "account.move",
        [...base, ["move_type", "=", "out_invoice"]],
        ["name", "amount_total", "payment_state", "invoice_date", "partner_id"],
        10000
      ),

      // Cash Inflow = only paid customer invoices
      odoo.searchRead(
        "account.move",
        [
          ...base,
          ["move_type", "=", "out_invoice"],
          ["payment_state", "=", "paid"]
        ],
        ["amount_total", "invoice_date"],
        10000
      ),

      // Outflow = vendor bills
     // Cash Outflow = only paid vendor bills
odoo.searchRead(
  "account.move",
  [
    ...base,
    ["move_type", "=", "in_invoice"],
    ["payment_state", "=", "paid"],
  ],
  ["amount_total", "invoice_date", "payment_state"],
  10000
),
    ]);

    const groupByMonth = (records) => {
      const map = {};

      records.forEach((r) => {
        if (!r.invoice_date) return;

        const [y, m] = r.invoice_date.split("-");
        const key = `${y}-${m}`;
        const label = new Date(y, m - 1, 1).toLocaleString("default", {
          month: "short",
          year: "numeric",
        });

        if (!map[key]) {
          map[key] = {
            key,
            label,
            total: 0,
            count: 0,
          };
        }

        map[key].total += Number(r.amount_total || 0);
        map[key].count += 1;
      });

      return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
    };

    const revenueMap = Object.fromEntries(
      groupByMonth(revenueInvoices).map((m) => [m.key, m])
    );

    const inflowMap = Object.fromEntries(
      groupByMonth(paidInvoices).map((m) => [m.key, m])
    );

    const outflowMap = Object.fromEntries(
      groupByMonth(vendorBills).map((m) => [m.key, m])
    );

    const keys = [
      ...new Set([
        ...Object.keys(revenueMap),
        ...Object.keys(inflowMap),
        ...Object.keys(outflowMap),
      ]),
    ].sort();

    return success(res, {
      monthlyData: keys.map((k) => ({
        key: k,
        label:
          revenueMap[k]?.label ||
          inflowMap[k]?.label ||
          outflowMap[k]?.label,

        // Revenue = posted invoices
        revenue: revenueMap[k]?.total || 0,

        // Cash Inflow = paid invoices
        inflow: inflowMap[k]?.total || 0,

        // Vendor bills
        outflow: outflowMap[k]?.total || 0,

        revenueCount: revenueMap[k]?.count || 0,
        inflowCount: inflowMap[k]?.count || 0,
        outflowCount: outflowMap[k]?.count || 0,
      })),

      invoices: revenueInvoices,
    });
  } catch (err) {
    return error(res, err.message);
  }
};