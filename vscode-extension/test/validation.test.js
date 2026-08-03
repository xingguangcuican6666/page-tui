const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validatePageTui } = require("../validation");
const starter = require("../starter");

function errors(source) {
  return validatePageTui(source).filter((issue) => issue.severity === "error");
}

test("starter page is valid", () => {
  assert.deepEqual(errors(starter), []);
});

test("repository example is valid", () => {
  const file = path.join(__dirname, "..", "..", "test", "fixtures", "sample-app.yaml");
  assert.deepEqual(errors(fs.readFileSync(file, "utf8")), []);
});

test("unknown component and route are reported", () => {
  const issues = validatePageTui([
    "initial: home",
    "pages:",
    "  home:",
    "    layout:",
    "      type: card",
    "    keys:",
    "      enter:",
    "        - push:",
    "            page: missing"
  ].join("\n"));

  assert.equal(issues.some((issue) => issue.message.includes("card")), true);
  assert.equal(issues.some((issue) => issue.message.includes("missing")), true);
});

test("standalone page files are supported", () => {
  assert.deepEqual(errors([
    "name: detail",
    "state:",
    "  title: hello",
    "layout:",
    "  type: text",
    "  bind: state.title"
  ].join("\n")), []);
});

test("YAML syntax errors are reported", () => {
  const issues = validatePageTui([
    "pages:",
    "  home:",
    "    layout:",
    "      type: column",
    "      children:",
    "       - type: text",
    "        value: broken"
  ].join("\n"));

  assert.equal(issues.some((issue) => issue.severity === "error"), true);
});
