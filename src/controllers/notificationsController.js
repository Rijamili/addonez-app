const OdooService = require("../config/OdooService");

exports.getNotifications = async (req, res, next) => {
  try {
    const activities = await OdooService.searchRead(
      "mail.activity",
      [],
      [
        "summary",
        "note",
        "date_deadline",
        "state",
      ]
    );

    const data = activities.map((item) => ({
      id: item.id,
      title: item.summary || "Activity",
      note: item.note || "",
      deadline: item.date_deadline,
      state: item.state,
    }));

    res.json({
      success: true,
      data,
    });
  } catch (err) {
    next(err);
  }
};