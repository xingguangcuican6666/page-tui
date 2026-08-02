const ui = require("../ui");

class Page {
  constructor(options = {}) {
    this.name = options.name || this.constructor.name || "page";
    this.title = options.title || this.name;
    this.meta = options.meta || {};
    this.app = null;
    this.params = undefined;
    this._render = options.render;
    this._keyHandler = options.onKey;
    this._enterHandler = options.onEnter;
    this._leaveHandler = options.onLeave;
    this._resumeHandler = options.onResume;
    this._focusHandler = options.onFocus;
    this._blurHandler = options.onBlur;
    this._resizeHandler = options.onResize;
  }

  _attach(app) {
    if (this.app && this.app !== app) {
      throw new Error(`Page "${this.name}" is already attached to another app.`);
    }
    this.app = app;
    return this;
  }

  invalidate() {
    this.app?.invalidate();
  }

  push(page, params) {
    return this.app?.push(page, params);
  }

  replace(page, params) {
    return this.app?.replace(page, params);
  }

  reset(page, params) {
    return this.app?.reset(page, params);
  }

  go(route, params) {
    return this.app?.go(route, params);
  }

  back(result) {
    return this.app?.back(result);
  }

  quit(code = 0) {
    return this.app?.quit(code);
  }

  render(context) {
    if (typeof this._render === "function") {
      return this._render.call(this, context);
    }
    return ui.text(this.title);
  }

  async onEnter(params) {
    if (typeof this._enterHandler === "function") {
      return this._enterHandler.call(this, params);
    }
    return undefined;
  }

  async onLeave(result) {
    if (typeof this._leaveHandler === "function") {
      return this._leaveHandler.call(this, result);
    }
    return undefined;
  }

  async onResume(result) {
    if (typeof this._resumeHandler === "function") {
      return this._resumeHandler.call(this, result);
    }
    return undefined;
  }

  async onFocus() {
    if (typeof this._focusHandler === "function") {
      return this._focusHandler.call(this);
    }
    return undefined;
  }

  async onBlur() {
    if (typeof this._blurHandler === "function") {
      return this._blurHandler.call(this);
    }
    return undefined;
  }

  async onResize(size) {
    if (typeof this._resizeHandler === "function") {
      return this._resizeHandler.call(this, size);
    }
    return undefined;
  }

  async onKey(key) {
    if (typeof this._keyHandler === "function") {
      return this._keyHandler.call(this, key);
    }
    return false;
  }
}

function createPage(options = {}) {
  return new Page(options);
}

module.exports = { Page, createPage };
