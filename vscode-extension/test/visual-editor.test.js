const test = require("node:test");
const assert = require("node:assert/strict");
const YAML = require("yaml");
const {
  applyVisualOperation,
  buildVisualModel,
  createVisualEditorHtml
} = require("../visual-editor");

const source = [
  "initial: home",
  "data:",
  "  items:",
  "    - title: first",
  "pages:",
  "  home:",
  "    title: 首页",
  "    state:",
  "      selected: 0",
  "    layout:",
  "      type: column",
  "      children:",
  "        - type: text",
  "          value: Hello",
  "    keys:",
  "      enter:",
  "        - set:",
  "            path: state.selected",
  "            value: 1",
  "    on:",
  "      enter:",
  "        - refresh"
].join("\n");

test("可视化模型识别页面、布局、变量和动作", () => {
  const model = buildVisualModel(source, "home");

  assert.equal(model.ok, true);
  assert.equal(model.mode, "manifest");
  assert.deepEqual(model.pages.map((page) => page.name), ["home"]);
  assert.equal(model.layoutTree.type, "column");
  assert.equal(model.layoutTree.children[0].type, "text");
  assert.equal(model.layoutTree.children[0].preview.value, "Hello");
  assert.deepEqual(model.data.map((item) => item.key), ["items"]);
  assert.deepEqual(model.state.map((item) => item.key), ["selected"]);
  assert.deepEqual(
    model.actions.events.map((event) => event.source + "." + event.event),
    ["keys.enter", "on.enter"]
  );
});

test("选择布局节点、变量和动作时会返回对应属性模型", () => {
  const layout = buildVisualModel(source, "home", ["pages", "home", "layout", "children", 0]);
  assert.equal(layout.selectedKind, "layout");
  assert.equal(layout.selectedNode.value, "Hello");

  const variable = buildVisualModel(source, "home", ["pages", "home", "state", "selected"]);
  assert.equal(variable.selectedKind, "state");
  assert.equal(variable.selectedNode, 0);

  const action = buildVisualModel(source, "home", ["pages", "home", "keys", "enter", 0]);
  assert.equal(action.selectedKind, "action");
  assert.equal(action.selectedAction.name, "set");
  assert.equal(action.selectedAction.config.path, "state.selected");
});

test("独立 page 文件也可以直接用可视化模型", () => {
  const model = buildVisualModel([
    "name: detail",
    "title: 详情",
    "state:",
    "  message: hello",
    "layout:",
    "  type: text",
    "  bind: state.message",
    "keys: {}"
  ].join("\n"));

  assert.equal(model.mode, "page");
  assert.equal(model.selectedPage, "detail");
  assert.equal(model.layoutTree.type, "text");
  assert.equal(model.state[0].key, "message");
});

test("manifest 引用的外部页面会使用外部文件的布局和写回路径", () => {
  const model = buildVisualModel([
    "initial: home",
    "data:",
    "  items: []",
    "pages:",
    "  home: ./pages/home.yaml"
  ].join("\n"), "home", [], {
    externalPages: {
      home: {
        uri: "file:///workspace/pages/home.yaml",
        source: [
          "name: home",
          "state:",
          "  selected: 0",
          "layout:",
          "  type: text",
          "  value: 外部页面"
        ].join("\n")
      }
    }
  });

  assert.equal(model.selectedPageExternal, true);
  assert.equal(model.selectedPageUri, "file:///workspace/pages/home.yaml");
  assert.deepEqual(model.layoutPath, ["layout"]);
  assert.equal(model.layoutTree.label, "外部页面");
  assert.ok(model.variablePaths.includes("data.items"));
  assert.ok(model.variablePaths.includes("state.selected"));
});

test("可视化操作会保留 YAML 并修改目标节点", () => {
  const changed = applyVisualOperation(source, {
    type: "set",
    path: ["pages", "home", "state", "selected"],
    value: 2
  });
  assert.equal(YAML.parse(changed).pages.home.state.selected, 2);
  assert.match(changed, /state:/);

  const appended = applyVisualOperation(changed, {
    type: "append",
    path: ["pages", "home", "layout", "children"],
    value: { type: "divider" }
  });
  assert.equal(YAML.parse(appended).pages.home.layout.children.length, 2);

  const moved = applyVisualOperation(appended, {
    type: "move",
    path: ["pages", "home", "layout", "children", 1],
    direction: "up"
  });
  assert.equal(YAML.parse(moved).pages.home.layout.children[0].type, "divider");

  const deleted = applyVisualOperation(moved, {
    type: "delete",
    path: ["pages", "home", "layout", "children", 0]
  });
  assert.equal(YAML.parse(deleted).pages.home.layout.children.length, 1);
});

test("删除页面会同步 initial，并保留其他 YAML 内容", () => {
  const manifest = [
    "# 页面入口",
    "initial: home",
    "pages:",
    "  home:",
    "    title: 首页",
    "    layout:",
    "      type: text",
    "      value: 首页",
    "  detail:",
    "    title: 详情",
    "    layout:",
    "      type: text",
    "      value: 详情"
  ].join("\n");

  const deleted = applyVisualOperation(manifest, {
    type: "deletePage",
    page: "home"
  });
  const parsed = YAML.parse(deleted);

  assert.equal(parsed.pages.home, undefined);
  assert.equal(parsed.initial, "detail");
  assert.equal(parsed.pages.detail.title, "详情");
  assert.match(deleted, /# 页面入口/);
});

test("共享变量和页面变量都可以删除", () => {
  const withoutData = applyVisualOperation(source, {
    type: "delete",
    path: ["data", "items"]
  });
  const withoutState = applyVisualOperation(withoutData, {
    type: "delete",
    path: ["pages", "home", "state", "selected"]
  });
  const parsed = YAML.parse(withoutState);

  assert.equal(parsed.data.items, undefined);
  assert.equal(parsed.pages.home.state.selected, undefined);
});

test("布局移动支持向下移动和拖拽到同级节点前", () => {
  const initial = [
    "layout:",
    "  type: column",
    "  children:",
    "    - type: text",
    "      value: a",
    "    - type: text",
    "      value: b",
    "    - type: text",
    "      value: c"
  ].join("\n");

  const down = applyVisualOperation(initial, {
    type: "move",
    path: ["layout", "children", 1],
    direction: "down"
  });
  assert.deepEqual(YAML.parse(down).layout.children.map((node) => node.value), ["a", "c", "b"]);

  const dropped = applyVisualOperation(initial, {
    type: "move",
    path: ["layout", "children", 0],
    targetPath: ["layout", "children", 2]
  });
  assert.deepEqual(YAML.parse(dropped).layout.children.map((node) => node.value), ["b", "a", "c"]);
});

test("布局节点可以拖入 panel，并保留 panel 原有内容", () => {
  const initial = [
    "layout:",
    "  type: column",
    "  children:",
    "    - type: panel",
    "      title: Info",
    "      child:",
    "        type: text",
    "        value: old",
    "    - type: text",
    "      value: new"
  ].join("\n");

  const moved = applyVisualOperation(initial, {
    type: "moveInto",
    path: ["layout", "children", 1],
    targetPath: ["layout", "children", 0]
  });
  const panel = YAML.parse(moved).layout.children[0];

  assert.equal(panel.type, "panel");
  assert.equal(panel.child.type, "column");
  assert.deepEqual(panel.child.children.map((node) => node.value), ["old", "new"]);
  assert.equal(YAML.parse(moved).layout.children.length, 1);
});

test("布局节点可以拖入空 panel", () => {
  const initial = [
    "layout:",
    "  type: column",
    "  children:",
    "    - type: panel",
    "      title: Info",
    "    - type: text",
    "      value: new"
  ].join("\n");

  const moved = applyVisualOperation(initial, {
    type: "moveInto",
    path: ["layout", "children", 1],
    targetPath: ["layout", "children", 0]
  });
  const panel = YAML.parse(moved).layout.children[0];

  assert.equal(panel.child.value, "new");
  assert.equal(YAML.parse(moved).layout.children.length, 1);
});

test("可视化编辑器 HTML 包含安全 CSP 和 VS Code 消息桥", () => {
  const html = createVisualEditorHtml(buildVisualModel(source, "home"));

  assert.match(html, /Page TUI 可视化编辑器/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /acquireVsCodeApi/);
  assert.match(html, /data-command="add-component"/);
  assert.match(html, /data-action-path/);
  assert.match(html, /draggable="true"/);
  assert.match(html, /type: intoContainer \? "moveInto"/);
  assert.match(html, /findLayoutNode\(model\.layoutTree, targetPath\)/);
  assert.match(html, /data-command="delete-page"/);
  assert.match(html, /data-variable-delete-path/);
  assert.match(html, /type: "deletePage"/);
  assert.doesNotMatch(html, /window\.confirm/);
  assert.match(html, /data-node-preview/);
  assert.match(html, /id="hover-preview" class="hover-preview"/);
  assert.match(html, /preview-text/);
  assert.match(html, /mouseenter/);
  assert.match(html, /bindHoverPreviews/);
  assert.match(html, /pointer-events: auto/);
  assert.doesNotMatch(html, /document\.addEventListener\("mouseover"/);
  assert.match(html, /variable-paths/);
  const script = html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("样式、条件和 if 分支提供结构化编辑控件", () => {
  const structuredSource = [
    "initial: home",
    "data:",
    "  items: []",
    "pages:",
    "  home:",
    "    state:",
    "      selected: 0",
    "      notice: ready",
    "    layout:",
    "      type: text",
    "      value: hello",
    "      visible:",
    "        notEmpty: state.notice",
    "      style:",
    "        when:",
    "          equals:",
    "            - state.selected",
    "            - 0",
    "        value: success",
    "        else: muted",
    "    keys:",
    "      enter:",
    "        - if:",
    "            condition:",
    "              equals:",
    "                - state.selected",
    "                - 0",
    "            then:",
    "              - set:",
    "                  path: state.notice",
    "                  value: saved",
    "            else:",
    "              - notify: invalid"
  ].join("\n");

  const layoutHtml = createVisualEditorHtml(buildVisualModel(
    structuredSource,
    "home",
    ["pages", "home", "layout"]
  ));
  assert.match(layoutHtml, /style-editor/);
  assert.match(layoutHtml, /style-values/);
  assert.match(layoutHtml, /data-condition-op/);
  assert.match(layoutHtml, /data-condition-operand-mode/);
  assert.match(layoutHtml, /conditionOperandValues/);
  assert.match(layoutHtml, /condition-operand-label/);
  assert.match(layoutHtml, /conditionTypes/);

  const actionHtml = createVisualEditorHtml(buildVisualModel(
    structuredSource,
    "home",
    ["pages", "home", "keys", "enter", 0]
  ));
  assert.match(actionHtml, /条件类型与参数/);
  assert.match(actionHtml, /data-condition-operator/);
  assert.match(actionHtml, /syncConditionEditorState/);
  assert.match(actionHtml, /requestAnimationFrame/);
  assert.match(actionHtml, /renderActionBranch/);
  assert.match(actionHtml, /data-action-branch="' \+ esc\(field\)/);
  assert.match(actionHtml, /data-action-branch-type/);
  assert.match(actionHtml, /data-action-branch-add/);
});
