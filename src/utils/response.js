// src/utils/response.js
const success = (res, data, message = "Success", code = 200) =>
  res.status(code).json({ success: true, message, data });

const error = (res, message = "Error", code = 500, errors = null) =>
  res.status(code).json({ success: false, message, ...(errors && { errors }) });

module.exports = { success, error };