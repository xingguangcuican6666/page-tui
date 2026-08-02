const test = require("node:test");
const assert = require("node:assert/strict");
const { list, panel, renderView } = require("../src");
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
