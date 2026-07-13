// // src/middleware/validate.js
// const { validationResult } = require("express-validator");
// const { error } = require("../utils/response");
// const validate  = (req, res, next) => {
//   const errs = validationResult(req);
//   if (!errs.isEmpty()) return error(res, "Validation failed", 422, errs.array());
//   next();
// };
// module.exports = { validate };
const { validationResult } = require("express-validator");
const { error } = require("../utils/response");

const validate = (req, res, next) => {
  const errs = validationResult(req);

  if (!errs.isEmpty()) {
    console.log("Validation Errors:", errs.array());
    console.log("Request Body:", req.body);

    return error(res, "Validation failed", 422, errs.array());
  }

  next();
};

module.exports = { validate };