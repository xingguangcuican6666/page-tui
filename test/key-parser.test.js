const test = require("node:test");
const assert = require("node:assert/strict");
const { KeyParser } = require("../src/core/key-parser");

test("KeyParser translates terminal sequences and control keys", () => {
  const keys = [];
  const parser = new KeyParser((key) => keys.push(key));

  parser.push("\u001b[A\u001b[3~x\u0003");
  parser.dispose();

  assert.deepEqual(keys.map((key) => [key.name, key.value, key.ctrl]), [
    ["up", undefined, false],
    ["delete", undefined, false],
    ["x", "x", false],
    ["c", "c", true]
  ]);
});
