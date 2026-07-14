const Tenant = require("../models/Tenant");

exports.createTenant = async (req, res) => {
  try {
    const tenant = await Tenant.create(req.body);

    return res.status(201).json({
      success: true,
      message: "Tenant created successfully",
      data: tenant,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};