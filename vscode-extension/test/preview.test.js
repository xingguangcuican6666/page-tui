const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createPreviewHtml, renderPreview } = require("../preview");

const example = fs.readFileSync(
  path.join(__dirname, "..", "..", "examples", "easy-tasks", "app.yaml"),
  "utf8"
);

test("实时预览渲染 manifest、变量和页面列表", () => {
  const model = renderPreview(example);

  assert.equal(model.error, null);
  assert.equal(model.pageName, "home");
  assert.deepEqual(model.pageNames, ["home", "detail", "create"]);
  assert.match(model.body, /任务列表/);
  assert.match(model.body, /看懂页面布局/);
  assert.match(model.body, /theme-title/);
});

test("实时预览可以切换页面并支持独立 page 文件", () => {
  const selected = renderPreview(example, "detail");
  assert.equal(selected.pageName, "detail");
  assert.match(selected.body, /任务详情/);

  const standalone = renderPreview([
    "name: detail",
    "state:",
    "  title: 预览标题",
    "layout:",
    "  type: text",
    "  bind: state.title"
  ].join("\n"));
  assert.equal(standalone.error, null);
  assert.equal(standalone.pageName, "detail");
  assert.match(standalone.body, /预览标题/);
});

test("YAML 错误会显示在预览面板中", () => {
  const model = renderPreview("pages:\n  home: [");

  assert.equal(model.pageNames.length, 0);
  assert.match(model.error, /YAML 解析失败/);
  assert.match(model.body, /预览暂时无法更新/);
});

test("Webview 页面包含页面选择器和消息监听", () => {
  const html = createPreviewHtml(renderPreview(example));

  assert.match(html, /Page TUI 实时预览/);
  assert.match(html, /id="page"/);
  assert.match(html, /selectPage/);
  assert.match(html, /message\.body/);
});
