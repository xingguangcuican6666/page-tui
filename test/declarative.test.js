const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createDeclarativeApp, renderView, Terminal } = require("../src");

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = false;
  }
}

class FakeOutput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = false;
    this.columns = 80;
    this.rows = 24;
  }

  write() {}
}

function key(name, value = name) {
  return { name, value, ctrl: false, meta: false };
}

test("YAML pages bind variables and navigate through the page stack", async () => {
  const terminal = new Terminal({ input: new FakeInput(), output: new FakeOutput() });
  const app = createDeclarativeApp({
    manifest: path.join(__dirname, "..", "examples", "easy-tasks", "app.yaml"),
    terminal,
    renderer: { render: () => [] }
  });

  await app.start();
  assert.equal(app.currentPage.name, "home");
  assert.equal(app.data.tasks.length, 3);

  await app.currentPage.onKey(key("down"));
  assert.equal(app.currentPage.state.selected, 1);

  await app.currentPage.onKey(key("enter"));
  assert.equal(app.currentPage.name, "detail");
  assert.equal(app.currentPage.params.task.title, "学习变量绑定");

  await app.currentPage.onKey(key("escape"));
  assert.equal(app.currentPage.name, "home");

  await app.currentPage.onKey(key("n"));
  assert.equal(app.currentPage.name, "create");
  await app.currentPage.onKey(key("x"));
  await app.currentPage.onKey(key("y"));
  assert.equal(app.currentPage.state.title, "xy");
  await app.currentPage.onKey(key("enter"));

  assert.equal(app.currentPage.name, "home");
  assert.equal(app.data.tasks.at(-1).title, "xy");
  app.quit();
});

test("YAML view templates compile into the existing renderer", () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      data: { tasks: [{ title: "Read YAML", done: false }] },
      pages: {
        home: {
          state: { selected: 0 },
          layout: {
            type: "column",
            children: [
              { type: "text", template: "Tasks: {{ count(data.tasks) }}" },
              {
                type: "list",
                items: "data.tasks",
                selected: "state.selected",
                label: "{{ index }} - {{ item.title }}"
              }
            ]
          }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  const page = app.pageManager.resolve("home");
  page._attach(app);
  const lines = renderView(page.render(), 30, 4, { color: false });
  assert.equal(lines.some((line) => line.includes("Tasks: 1")), true);
  assert.equal(lines.some((line) => line.includes("0 - Read YAML")), true);
});

test("declarative pages can call an allowlisted service", async () => {
  let received;
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { value: "hello" },
          layout: { type: "text", value: "service" },
          keys: {
            s: {
              call: "demo.save",
              with: { value: { bind: "state.value" } }
            }
          }
        }
      }
    },
    services: {
      "demo.save": (payload) => {
        received = payload;
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("s"));
  assert.deepEqual(received, { value: "hello" });
  app.quit();
});
