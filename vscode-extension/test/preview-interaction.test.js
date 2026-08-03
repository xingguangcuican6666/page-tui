const test = require("node:test");
const assert = require("node:assert/strict");
const { createPreviewHtml, createPreviewSession } = require("../preview");

const source = [
  "initial: home",
  "data:",
  "  items:",
  "    - title: first",
  "    - title: second",
  "pages:",
  "  home:",
  "    state:",
  "      selected: 0",
  "      title: \"\"",
  "    layout:",
  "      type: column",
  "      children:",
  "        - type: list",
  "          items: data.items",
  "          selected: state.selected",
  "          label: \"{{ item.title }}\"",
  "        - type: input",
  "          bind: state.title",
  "    keys:",
  "      down:",
  "        - move:",
  "            path: state.selected",
  "            by: 1",
  "            list: data.items",
  "      enter:",
  "        - push:",
  "            page: detail",
  "      character:",
  "        - append:",
  "            path: state.title",
  "            value:",
  "              bind: key.value",
  "  detail:",
  "    layout:",
  "      type: text",
  "      value: detail"
].join("\n");

test("预览会响应列表点击、输入和键盘 action", () => {
  const session = createPreviewSession(source);

  session.dispatch({ type: "selectList", path: "state.selected", index: 1 });
  assert.match(session.model().body, /second/);
  assert.match(session.model().body, /data-preview-list-item="1"[^>]* class="list-item is-selected/);

  session.dispatch({ type: "input", path: "state.title", value: "hello" });
  assert.match(session.model().body, /value="hello"/);

  session.dispatch({ type: "key", key: "x", value: "x" });
  assert.match(session.model().body, /value="hellox"/);

  session.dispatch({ type: "key", key: "enter" });
  assert.equal(session.model().pageName, "detail");
});

test("预览 Webview 注册了交互事件桥", () => {
  const html = createPreviewHtml(createPreviewSession(source).model());

  assert.match(html, /data-preview-input/);
  assert.match(html, /data-preview-list-item/);
  assert.match(html, /type: "interaction"/);
  assert.match(html, /addEventListener\("keydown"/);
});

test("预览显示实时变量并可以重置会话", () => {
  const session = createPreviewSession(source);
  assert.equal(session.model().variables.state.title, "");

  session.dispatch({ type: "input", path: "state.title", value: "changed" });
  assert.equal(session.model().variables.state.title, "changed");

  session.dispatch({ type: "key", key: "enter" });
  assert.equal(session.model().pageName, "detail");
  session.reset();
  assert.equal(session.model().pageName, "home");
  assert.equal(session.model().variables.state.title, "");

  const html = createPreviewHtml(session.model());
  assert.match(html, /实时变量/);
  assert.match(html, /重置预览/);
  assert.match(html, /class="variables-tree"/);
  assert.match(html, /function renderVariableTree/);
  assert.match(html, /class="variable-group"/);
  assert.match(html, /renderVariableTree\(message\.variables/);
  assert.doesNotMatch(html, /<pre id="variables">/);
  const script = html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/);
  assert.ok(script);
  assert.doesNotThrow(() => new Function("acquireVsCodeApi", script[1]));
});
