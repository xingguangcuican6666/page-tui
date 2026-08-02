const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { createApp } = require("../core/app");
const { cloneValue } = require("./value");
const { DeclarativePage } = require("./page");

function readDocument(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  if (filePath.endsWith(".json")) return JSON.parse(source);
  return YAML.parse(source);
}

function loadManifest(manifest) {
  if (typeof manifest === "object") return { document: manifest, baseDir: process.cwd() };
  if (typeof manifest !== "string") throw new TypeError("createDeclarativeApp() 需要 manifest 文件路径或配置对象。");
  const filePath = path.resolve(manifest);
  return { document: readDocument(filePath), baseDir: path.dirname(filePath) };
}

function loadPages(document, baseDir) {
  const pages = {};
  for (const [name, source] of Object.entries(document.pages || {})) {
    const definition = typeof source === "string"
      ? readDocument(path.resolve(baseDir, source))
      : source;
    pages[name] = { ...definition, name: definition.name || name };
  }
  return pages;
}

function createDeclarativeApp(options = {}) {
  const loaded = loadManifest(options.manifest || options.definition);
  const document = loaded.document || {};
  const pages = loadPages(document, loaded.baseDir);
  const data = {
    ...cloneValue(document.data || {}),
    ...cloneValue(options.data || {})
  };
  const runtime = {
    data,
    services: options.services || {},
    refresh: options.refresh
  };
  const routes = Object.fromEntries(
    Object.entries(pages).map(([name, definition]) => [
      name,
      () => new DeclarativePage(name, definition, runtime)
    ])
  );

  const {
    manifest: _manifest,
    definition: _definition,
    data: _data,
    services: _services,
    refresh: _refresh,
    ...appOptions
  } = options;
  const app = createApp({
    ...appOptions,
    initialPage: options.initialPage || document.initial || Object.keys(pages)[0],
    routes
  });

  runtime.app = app;
  app.data = data;
  app.definition = document;
  app.declarative = runtime;
  return app;
}

module.exports = { createDeclarativeApp, loadManifest, loadPages, readDocument };
