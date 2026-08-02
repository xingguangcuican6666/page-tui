const { App, createApp } = require("./core/app");
const { Page, createPage } = require("./core/page");
const { PageManager } = require("./core/page-manager");
const { Renderer } = require("./core/renderer");
const { Terminal } = require("./core/terminal");
const declarative = require("./declarative");
const ui = require("./ui");

module.exports = {
  App,
  Page,
  PageManager,
  Renderer,
  Terminal,
  createApp,
  createPage,
  ...declarative,
  ui,
  ...ui
};
