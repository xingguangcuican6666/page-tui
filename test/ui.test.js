const test = require("node:test");
const assert = require("node:assert/strict");
const { list, panel, popup, progress, renderView, Renderer, text } = require("../src");
const { stringWidth } = require("../src/utils/text");

test("list and panel render to a fixed viewport without ANSI when color is disabled", () => {
  const lines = renderView(
    panel(list(["first", "second"], { selected: 1 }), { title: "Items" }),
    24,
    7,
    { color: false }
  );

  assert.equal(lines.length, 7);
  assert.equal(lines.every((line) => stringWidth(line) === 24), true);
  assert.equal(lines.some((line) => line.includes("❯ second")), true);
  assert.equal(lines.some((line) => line.includes("╭ Items")), true);
  assert.equal(lines.join("\n").includes("\u001b["), false);
});

test("popup renders a centered dialog inside the viewport", () => {
  const lines = renderView(
    popup(text("确认继续"), { title: "提示", width: 20, height: 5 }),
    30,
    9,
    { color: false }
  );

  assert.equal(lines.length, 9);
  assert.equal(lines.every((line) => stringWidth(line) === 30), true);
  assert.equal(lines.some((line) => line.includes("╭ 提示")), true);
  assert.equal(lines.some((line) => line.includes("确认继续")), true);
});

test("progress renders a bounded bar with a label and percentage", () => {
  const lines = renderView(
    progress(25, { max: 100, label: "下载" }),
    30,
    2,
    { color: false }
  );

  assert.equal(lines.length, 2);
  assert.equal(lines.every((line) => stringWidth(line) === 30), true);
  assert.equal(lines.some((line) => line.includes("下载")), true);
  assert.equal(lines.some((line) => line.includes("25%")), true);
});

test("renderer clears the full terminal before drawing a new frame", () => {
  const output = {
    isTTY: true,
    columns: 20,
    rows: 4,
    writes: [],
    write(value) {
      this.writes.push(String(value));
    }
  };
  const renderer = new Renderer(output, { color: false });

  renderer.render(text("old frame"), { width: 20, height: 4, color: false });
  renderer.render(text("new frame"), { width: 20, height: 4, color: false });

  assert.match(output.writes.at(-1), /^\u001b\[H\u001b\[2J/);
});
