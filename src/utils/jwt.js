// src/utils/jwt.js — Dynamic JWT using secret from Odoo System Parameters
const jwt              = require("jsonwebtoken");
const OdooConfigService = require("../config/OdooConfigService");

const generateToken = async (payload) => {
  const { secret, expiresIn } = await OdooConfigService.getJwtConfig();
  return jwt.sign(payload, secret, { expiresIn });
};

const verifyToken = async (token) => {
  const { secret } = await OdooConfigService.getJwtConfig();
  return jwt.verify(token, secret);
};

module.exports = { generateToken, verifyToken };