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

test("dynamic navigation targets are not reported as unknown routes", () => {
  assert.deepEqual(errors([
    "initial: home",
    "pages:",
    "  home:",
    "    keys:",
    "      enter:",
    "        - push:",
    "            page: \"{{ state.nextPage }}\""
  ].join("\n")), []);
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

test("popup layout and shell call are valid", () => {
  assert.deepEqual(errors([
    "initial: home",
    "pages:",
    "  home:",
    "    layout:",
    "      type: popup",
    "      title: 提示",
    "      message: 继续吗？",
    "    keys:",
    "      enter:",
    "        - call:",
    "            sh: \"printf ok\"",
    "            stdio: pipe",
    "            result: state.callResult"
  ].join("\n")), []);
});

test("progress layout and shell output callbacks are valid", () => {
  assert.deepEqual(errors([
    "initial: home",
    "pages:",
    "  home:",
    "    state:",
    "      progress: 25",
    "      logs: []",
    "    layout:",
    "      type: progress",
    "      bind: state.progress",
    "      max: 100",
    "      label: 下载",
    "    keys:",
    "      enter:",
    "        - call:",
    "            sh: \"printf 'done\\n'\"",
    "            wait: false",
    "            lines: state.logs",
    "            json: state.items",
    "            onLine:",
    "              - set:",
    "                  path: state.lastLine",
    "                  value:",
    "                    bind: key.value",
    "            onExit:",
    "              - set:",
    "                  path: state.exitCode",
    "                  value:",
    "                    bind: key.code"
  ].join("\n")), []);
});

test("external language modules and translated text are valid", () => {
  assert.deepEqual(errors([
    "initial: home",
    "data:",
    "  locale: zh-CN",
    "i18n:",
    "  locale:",
    "    bind: data.locale",
    "  fallback: zh-CN",
    "  locales:",
    "    zh-CN: locales/zh-CN.yaml",
    "    en:",
    "      home:",
    "        title: Home",
    "pages:",
    "  home:",
    "    layout:",
    "      type: text",
    "      value:",
    "        t: home.title"
  ].join("\n")), []);
});

test("invalid language module definitions are reported", () => {
  const issues = errors([
    "initial: home",
    "i18n:",
    "  locale:",
    "    bind: 42",
    "  fallback: false",
    "  locales:",
    "    en: []",
    "pages:",
    "  home:",
    "    layout:",
    "      type: text",
    "      value: Home"
  ].join("\n"));

  assert.equal(issues.some((issue) => issue.message.includes("locale.bind")), true);
  assert.equal(issues.some((issue) => issue.message.includes("fallback")), true);
  assert.equal(issues.some((issue) => issue.message.includes("语言 “en”")), true);
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
