const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

exports.getCrmSummary = async (req, res) => {
  try {
    const [won, lost, open] = await Promise.all([
      odoo.searchRead("crm.lead", [["stage_id.is_won", "=", true]], ["expected_revenue"], 1000),
      odoo.searchRead("crm.lead", [["active", "=", false], ["probability", "=", 0]], ["id"], 1000),
      odoo.searchRead("crm.lead", [["active", "=", true], ["stage_id.is_won", "=", false]], ["expected_revenue"], 1000),
    ]);

    const pipelineValue = open.reduce((s, r) => s + Number(r.expected_revenue || 0), 0);
    const winRate = won.length + lost.length > 0
      ? Math.round((won.length / (won.length + lost.length)) * 100)
      : 0;

    return success(res, {
      tags: { converted: won.length, pending: open.length, pipelineValue, winRate },
      reportGroups: [
        { key: "leads",         label: "Leads" },
        { key: "opportunities", label: "Opportunities" },
        { key: "sales-performance", label: "Sales performance" },
        { key: "customers",     label: "Customers" },
        { key: "activity",      label: "Activity" },
        { key: "revenue-forecast", label: "Revenue and forecast" },
        { key: "ai-predictive", label: "AI predictive" },
        { key: "executive-dashboard", label: "Executive dashboard" },
      ],
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/crm/leads
exports.getLeads = async (req, res) => {
  try {
    const leads = await odoo.searchRead(
      "crm.lead",
      [["active", "=", true]],
      ["name", "partner_name", "stage_id", "source_id", "user_id", "create_date", "probability"],
      200
    );
    return success(res, leads.map((l) => ({
      name:        l.name,
      partner:     l.partner_name || "",
      stage:       l.stage_id?.[1] || "",
      source:      l.source_id?.[1] || "Unknown",
      salesperson: l.user_id?.[1] || "Unassigned",
      createdAt:   l.create_date,
      probability: l.probability,
    })));
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/crm/opportunities
exports.getOpportunities = async (req, res) => {
  try {
    const opps = await odoo.searchRead(
      "crm.lead",
      [["active", "=", true], ["type", "=", "opportunity"]],
      ["name", "partner_name", "stage_id", "expected_revenue", "probability", "date_deadline", "user_id"],
      200
    );
    return success(res, opps.map((o) => ({
      name:           o.name,
      partner:        o.partner_name || "",
      stage:          o.stage_id?.[1] || "",
      expectedRevenue: Number(o.expected_revenue || 0),
      probability:    o.probability,
      expectedClose:  o.date_deadline,
      salesperson:    o.user_id?.[1] || "Unassigned",
    })));
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/crm/sales-performance
exports.getSalesPerformance = async (req, res) => {
  try {
    const opps = await odoo.searchRead(
      "crm.lead",
      [["active", "=", true]],
      ["user_id", "expected_revenue", "stage_id"],
      1000
    );

    const byRep = {};
    opps.forEach((o) => {
      const rep = o.user_id?.[1] || "Unassigned";
      if (!byRep[rep]) byRep[rep] = { salesperson: rep, dealsHandled: 0, won: 0, revenue: 0 };
      byRep[rep].dealsHandled += 1;
      if (o.stage_id && /won/i.test(o.stage_id[1] || "")) {
        byRep[rep].won += 1;
        byRep[rep].revenue += Number(o.expected_revenue || 0);
      }
    });

    const rows = Object.values(byRep)
      .map((r) => ({ ...r, conversionRate: r.dealsHandled ? Math.round((r.won / r.dealsHandled) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    return success(res, rows);
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/crm/customers
exports.getCustomers = async (req, res) => {
  try {
    const partners = await odoo.searchRead(
      "res.partner",
      [["customer_rank", ">", 0]],
      ["name", "email", "phone", "city", "create_date"],
      200
    );
    return success(res, partners.map((p) => ({
      name:      p.name,
      email:     p.email || "",
      phone:     p.phone || "",
      city:      p.city || "",
      createdAt: p.create_date,
    })));
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/crm/activity
exports.getActivity = async (req, res) => {
  try {
    const activities = await odoo.searchRead(
      "mail.activity",
      [],
      ["summary", "activity_type_id", "date_deadline", "user_id", "res_name"],
      200
    );

    const today = new Date().toISOString().slice(0, 10);
    const dueToday = activities.filter((a) => a.date_deadline === today).length;
    const overdue  = activities.filter((a) => a.date_deadline < today).length;

    return success(res, {
      dueToday,
      overdue,
      items: activities.map((a) => ({
        summary:    a.summary || a.activity_type_id?.[1] || "Activity",
        type:       a.activity_type_id?.[1] || "",
        dueDate:    a.date_deadline,
        owner:      a.user_id?.[1] || "Unassigned",
        relatedTo:  a.res_name || "",
      })),
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/crm/revenue-forecast
exports.getRevenueForecast = async (req, res) => {
  try {
    const opps = await odoo.searchRead(
      "crm.lead",
      [["active", "=", true], ["type", "=", "opportunity"]],
      ["expected_revenue", "probability", "date_deadline"],
      1000
    );

    const pipelineForecast = opps.reduce(
      (s, o) => s + (Number(o.expected_revenue || 0) * (Number(o.probability || 0) / 100)),
      0
    );

    const thisMonth = new Date().toISOString().slice(0, 7);
    const closingThisMonth = opps.filter((o) => (o.date_deadline || "").startsWith(thisMonth));
    const expectedThisMonth = closingThisMonth.reduce((s, o) => s + Number(o.expected_revenue || 0), 0);

    return success(res, {
      pipelineForecast,
      expectedThisMonth,
      dealsClosingThisMonth: closingThisMonth.length,
      totalOpenOpportunities: opps.length,
    });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/crm/ai-predictive
// Simple heuristic scoring until a real ML model is wired in.
exports.getAiPredictive = async (req, res) => {
  try {
    const opps = await odoo.searchRead(
      "crm.lead",
      [["active", "=", true], ["type", "=", "opportunity"]],
      ["name", "partner_name", "probability", "expected_revenue", "date_deadline", "write_date"],
      1000
    );

    const likelyToClose = opps
      .filter((o) => Number(o.probability || 0) >= 70)
      .sort((a, b) => Number(b.probability) - Number(a.probability))
      .slice(0, 10)
      .map((o) => ({ name: o.name, partner: o.partner_name || "", confidence: Math.round(o.probability) }));

    const now = Date.now();
    const atRisk = opps
      .filter((o) => {
        const lastTouch = o.write_date ? new Date(o.write_date).getTime() : 0;
        const daysSince = (now - lastTouch) / (1000 * 60 * 60 * 24);
        return daysSince > 14 && Number(o.probability || 0) > 0 && Number(o.probability || 0) < 70;
      })
      .slice(0, 10)
      .map((o) => ({ name: o.name, partner: o.partner_name || "", reason: "No activity in over 2 weeks" }));

    return success(res, { likelyToClose, atRisk });
  } catch (err) {
    return error(res, err.message);
  }
};

// GET /api/crm/executive-dashboard
exports.getExecutiveDashboard = async (req, res) => {
  try {
    const [open, won, lost, leadsToday] = await Promise.all([
      odoo.searchRead("crm.lead", [["active", "=", true], ["stage_id.is_won", "=", false]], ["expected_revenue", "probability"], 1000),
      odoo.searchRead("crm.lead", [["stage_id.is_won", "=", true]], ["id", "user_id"], 1000),
      odoo.searchRead("crm.lead", [["active", "=", false], ["probability", "=", 0]], ["id"], 1000),
      odoo.searchRead("crm.lead", [["create_date", ">=", new Date().toISOString().slice(0, 10) + " 00:00:00"]], ["id"], 500),
    ]);

    const pipelineValue = open.reduce((s, r) => s + Number(r.expected_revenue || 0), 0);
    const winRate = won.length + lost.length > 0
      ? Math.round((won.length / (won.length + lost.length)) * 100)
      : 0;

    const bySalesperson = {};
    won.forEach((w) => {
      const name = w.user_id?.[1] || "Unassigned";
      bySalesperson[name] = (bySalesperson[name] || 0) + 1;
    });
    const topSalesperson = Object.entries(bySalesperson).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

    return success(res, {
      totalPipelineValue: pipelineValue,
      newLeadsToday: leadsToday.length,
      winRate,
      lostDeals: lost.length,
      topSalesperson,
      conversionRate: winRate,
    });
  } catch (err) {
    return error(res, err.message);
  }
};