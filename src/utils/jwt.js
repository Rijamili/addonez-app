// src/utils/jwt.js — JWT secret comes straight from JWT_SECRET (.env),
// no more lookup against Odoo System Parameters.
const jwt = require("jsonwebtoken");
const { bootstrap } = require("../config/bootstrap");

const generateToken = (payload) =>
  jwt.sign(payload, bootstrap.jwt.secret, { expiresIn: bootstrap.jwt.expiresIn });

const verifyToken = (token) => jwt.verify(token, bootstrap.jwt.secret);

module.exports = { generateToken, verifyToken };
