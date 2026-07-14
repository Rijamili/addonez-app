const Tenant = require("../models/Tenant");

const { createTenant } = require("./adminController");

const bootstrap = async (req, res, next) => {
  try {
    const count = await Tenant.count();

    // If a tenant already exists, don't allow bootstrap again
    if (count > 0) {
      return res.status(403).json({
        success: false,
        message: "Bootstrap has already been completed.",
      });
    }

    return createTenant(req, res, next);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  bootstrap,
};