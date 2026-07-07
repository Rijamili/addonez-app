// src/config/requestContext.js
// Holds "which tenant is this request for" using Node's built-in AsyncLocalStorage.
// Set once in the auth middleware; readable from anywhere downstream (even
// deep inside OdooService) without passing it through every function.

const { AsyncLocalStorage } = require("async_hooks");

const als = new AsyncLocalStorage();

const run = (tenant, fn) => als.run({ tenant }, fn);
const getTenant = () => als.getStore()?.tenant || null;

module.exports = { run, getTenant };