const { Page } = require("./page");

class PageManager {
  constructor(app, options = {}) {
    this.app = app;
    this.stack = [];
    this.routes = new Map();

    for (const [name, factory] of Object.entries(options.routes || {})) {
      this.register(name, factory);
    }
  }

  get current() {
    return this.stack.at(-1)?.page || null;
  }

  get depth() {
    return this.stack.length;
  }

  get canGoBack() {
    return this.stack.length > 1;
  }

  register(name, factory) {
    if (!name || typeof factory !== "function") {
      throw new TypeError("register(name, factory) requires a route name and a factory function.");
    }
    this.routes.set(name, factory);
    return this;
  }

  hasRoute(name) {
    return this.routes.has(name);
  }

  resolve(target, params) {
    let page = target;

    if (typeof target === "string") {
      const factory = this.routes.get(target);
      if (!factory) {
        throw new Error(`Unknown page route: ${target}`);
      }
      page = factory(params);
    } else if (typeof target === "function") {
      page = target.prototype instanceof Page ? new target(params) : target(params);
    }

    if (page instanceof Page) {
      return page;
    }

    if (page && typeof page === "object") {
      return new Page(page);
    }

    throw new TypeError("A page must be a Page instance, a page options object, a route, or a page factory.");
  }

  async reset(target, params) {
    const page = this.resolve(target, params);
    const previous = this.current;
    if (previous) {
      await previous.onBlur();
      await previous.onLeave();
    }
    this.stack = [];
    await this._enter(page, params);
    this.stack.push({ page, params });
    await page.onFocus();
    this._changed("reset", page);
    return page;
  }

  async push(target, params) {
    const page = this.resolve(target, params);
    const previous = this.current;
    if (previous) {
      await previous.onBlur();
    }
    await this._enter(page, params);
    this.stack.push({ page, params });
    await page.onFocus();
    this._changed("push", page);
    return page;
  }

  async replace(target, params) {
    const page = this.resolve(target, params);
    const previous = this.current;
    if (previous) {
      await previous.onBlur();
      await previous.onLeave();
    }
    await this._enter(page, params);
    if (this.stack.length) {
      this.stack[this.stack.length - 1] = { page, params };
    } else {
      this.stack.push({ page, params });
    }
    await page.onFocus();
    this._changed("replace", page);
    return page;
  }

  async pop(result) {
    if (!this.canGoBack) {
      return false;
    }

    const leaving = this.stack.pop();
    await leaving.page.onBlur();
    await leaving.page.onLeave(result);

    const resumed = this.current;
    await resumed.onResume(result);
    await resumed.onFocus();
    this._changed("pop", resumed);
    return result;
  }

  snapshot() {
    return this.stack.map(({ page, params }) => ({
      name: page.name,
      title: page.title,
      params
    }));
  }

  async _enter(page, params) {
    page._attach?.(this.app);
    page.params = params;
    await page.onEnter(params);
  }

  _changed(action, page) {
    this.app?.emit?.("pageChange", {
      action,
      page,
      stack: this.snapshot()
    });
    this.app?.invalidate?.();
  }
}

module.exports = { PageManager };
