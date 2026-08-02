const { EventEmitter } = require("node:events");
const { PageManager } = require("./page-manager");
const { Renderer } = require("./renderer");
const { Terminal } = require("./terminal");
const ui = require("../ui");

class App extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.theme = options.theme || {};
    this.terminal = options.terminal || new Terminal(options.terminalOptions);
    this.renderer = options.renderer || new Renderer(this.terminal.output, {
      color: options.color,
      theme: this.theme
    });
    this.pageManager = new PageManager(this, { routes: options.routes });
    this.pages = this.pageManager;
    this.initialPage = options.initialPage ?? options.page;
    this.initialParams = options.initialParams;
    this.running = false;
    this.closed = false;
    this._renderQueued = false;
    this._keyQueue = Promise.resolve();
    this._lastError = null;
  }

  get currentPage() {
    return this.pageManager.current;
  }

  register(name, factory) {
    this.pageManager.register(name, factory);
    return this;
  }

  async start() {
    if (this.running) return this;
    if (!this.currentPage) {
      if (this.initialPage == null) {
        throw new Error("App.start() needs an initialPage or a page pushed before start().");
      }
      await this.pageManager.reset(this.initialPage, this.initialParams);
    }

    this.terminal.start({
      onKey: (key) => this.handleKey(key),
      onResize: (size) => this.handleResize(size)
    });
    this.running = true;
    this.render();
    this.emit("start", this);
    return this;
  }

  run() {
    return this.start();
  }

  async push(page, params) {
    return this.pageManager.push(page, params);
  }

  async replace(page, params) {
    return this.pageManager.replace(page, params);
  }

  async reset(page, params) {
    return this.pageManager.reset(page, params);
  }

  async go(route, params) {
    return this.push(route, params);
  }

  async back(result) {
    if (this.pageManager.canGoBack) {
      return this.pageManager.pop(result);
    }
    return this.quit(0);
  }

  handleKey(key) {
    this._keyQueue = this._keyQueue
      .then(() => this._dispatchKey(key))
      .catch((error) => this.handleError(error));
    return this._keyQueue;
  }

  handleResize(size) {
    this._keyQueue = this._keyQueue
      .then(async () => {
        if (this.currentPage) await this.currentPage.onResize(size);
        this.invalidate();
      })
      .catch((error) => this.handleError(error));
    return this._keyQueue;
  }

  async _dispatchKey(key) {
    if (this.closed || !this.currentPage) return;

    if (key.ctrl && key.name === "c") {
      this.quit(130);
      return;
    }

    const handled = await this.currentPage.onKey(key);
    if (!handled && key.name === "q") {
      this.quit(0);
      return;
    }
    if (!handled && key.name === "escape") {
      await this.back();
      return;
    }

    this.invalidate();
  }

  invalidate() {
    if (this._renderQueued || this.closed || !this.running) return;
    this._renderQueued = true;
    queueMicrotask(() => {
      this._renderQueued = false;
      if (!this.closed) this.render();
    });
  }

  render() {
    if (!this.currentPage) return [];

    const size = this.terminal.size;
    try {
      const view = this.currentPage.render({
        app: this,
        manager: this.pageManager,
        page: this.currentPage,
        width: size.width,
        height: size.height,
        theme: this.theme
      });
      const lines = this.renderer.render(view, {
        width: size.width,
        height: size.height,
        theme: this.theme
      });
      this.emit("render", { page: this.currentPage, lines });
      return lines;
    } catch (error) {
      this.handleError(error);
      return [];
    }
  }

  handleError(error) {
    this._lastError = error;
    if (typeof this.options.onError === "function") {
      this.options.onError(error, this);
      return;
    }
    if (this.listenerCount("error") > 0) {
      this.emit("error", error);
      return;
    }

    if (this.running && !this.closed) {
      const size = this.terminal.size;
      this.renderer.render(
        ui.panel(ui.text(error?.stack || error?.message || String(error)), {
          title: "TUI error",
          borderStyle: "danger",
          padding: 1
        }),
        { width: size.width, height: size.height, theme: { danger: { fg: "red" } } }
      );
    }
  }

  quit(code = 0) {
    if (this.closed) return;
    this.closed = true;
    this.running = false;
    this.terminal.stop();
    if (code) process.exitCode = code;
    this.emit("quit", code);
  }

  close(code = 0) {
    this.quit(code);
  }
}

function createApp(options = {}) {
  return new App(options);
}

module.exports = { App, createApp };
