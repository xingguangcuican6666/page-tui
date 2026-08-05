const { createDeclarativeApp, loadManifest, loadPages, readDocument } = require("./app");
const { createI18n, loadI18n } = require("./i18n");
const { DeclarativePage, compileLayout, executeAction, executeActions } = require("./page");

module.exports = {
  DeclarativePage,
  compileLayout,
  createDeclarativeApp,
  createI18n,
  executeAction,
  executeActions,
  loadManifest,
  loadI18n,
  loadPages,
  readDocument
};
