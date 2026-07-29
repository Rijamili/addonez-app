// src/config/requestContext.js
// Holds "which tenant is this request for" using Node's built-in AsyncLocalStorage.
// Set once in the auth middleware; readable from anywhere downstream (even
// deep inside OdooService) without passing it through every function.

const { AsyncLocalStorage } = require("async_hooks");

const als = new AsyncLocalStorage();

const run = (tenant, fn, user = null) =>
  als.run({ tenant, companyIds: user?.companyIds || null }, fn);

const getTenant = () => als.getStore()?.tenant || null;
const getCompanyIds = () => als.getStore()?.companyIds || null;

module.exports = { run, getTenant, getCompanyIds };