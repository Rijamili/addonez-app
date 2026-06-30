const odoo = require("../config/OdooService");
const { success, error } = require("../utils/response");

// GET /api/crm  →  converted / pending / pipeline tags + report group list
exports.getCrmSummary = async (req, res) => {
  try {
    const [won, lost, open] = await Promise.all([
      odoo.searchRead(
        "crm.lead",
        [["stage_id.is_won", "=", true]],
        ["expected_revenue"],
        1000
      ),
      odoo.searchRead(
        "crm.lead",
        [["active", "=", false], ["probability", "=", 0]],
        ["id"],
        1000
      ),
      odoo.searchRead(
        "crm.lead",
        [["active", "=", true], ["stage_id.is_won", "=", false]],
        ["expected_revenue"],
        1000
      ),
    ]);

    const pipelineValue = open.reduce((s, r) => s + Number(r.expected_revenue || 0), 0);
    const winRate = won.length + lost.length > 0
      ? Math.round((won.length / (won.length + lost.length)) * 100)
      : 0;

    return success(res, {
      tags: {
        converted: won.length,
        pending:   open.length,
        pipelineValue,
        winRate,
      },
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

// GET /api/crm/leads  →  drill-down example for the "Leads" report group
exports.getLeads = async (req, res) => {
  try {
    const leads = await odoo.searchRead(
      "crm.lead",
      [["active", "=", true]],
      ["name", "partner_name", "stage_id", "source_id", "user_id", "create_date", "probability"],
      200
    );
    return success(res, leads);
  } catch (err) {
    return error(res, err.message);
  }
};