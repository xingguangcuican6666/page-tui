const test = require("node:test");
const assert = require("node:assert/strict");
const { Page, PageManager } = require("../src");

class TracePage extends Page {
  constructor(name, trace) {
    super({ name, title: name });
    this.trace = trace;
  }

  async onEnter(params) {
    this.trace.push(`${this.name}:enter:${params?.id || "none"}`);
  }

  async onLeave(result) {
    this.trace.push(`${this.name}:leave:${result || "none"}`);
  }

  async onResume(result) {
    this.trace.push(`${this.name}:resume:${result || "none"}`);
  }

  async onFocus() {
    this.trace.push(`${this.name}:focus`);
  }

  async onBlur() {
    this.trace.push(`${this.name}:blur`);
  }
}

test("PageManager maintains a stack and calls lifecycle hooks", async () => {
  const trace = [];
  const app = {
    invalidate() {},
    emit() {}
  };
  const manager = new PageManager(app);

  await manager.reset(new TracePage("home", trace), { id: 1 });
  await manager.push(new TracePage("detail", trace), { id: 2 });
  await manager.pop("saved");

  assert.deepEqual(manager.snapshot().map((page) => page.name), ["home"]);
  assert.deepEqual(trace, [
    "home:enter:1",
    "home:focus",
    "home:blur",
    "detail:enter:2",
    "detail:focus",
    "detail:blur",
    "detail:leave:saved",
    "home:resume:saved",
    "home:focus"
  ]);
});

test("PageManager resolves route factories", async () => {
  const app = { invalidate() {}, emit() {} };
  const manager = new PageManager(app, {
    routes: { home: (params) => new Page({ name: params.name }) }
  });

  await manager.reset("home", { name: "route-home" });
  assert.equal(manager.current.name, "route-home");
  assert.equal(manager.hasRoute("home"), true);
});
