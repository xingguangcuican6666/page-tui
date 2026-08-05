const test = require("node:test");
const assert = require("node:assert/strict");
const YAML = require("yaml");
const {
  applyJsonOperation,
  applyVisualOperation,
  buildVisualModel,
  createVisualEditorHtml
} = require("../visual-editor");

function loadVisualEditorRuntime(html) {
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const definitions = script
    .replace("const vscode = acquireVsCodeApi();", "const posted = []; const window = { dispatchEvent() {}, clearTimeout() {}, setTimeout() {} }; const vscode = { postMessage(message) { posted.push(message); } };")
    .split('window.addEventListener("scroll",')[0];
  return new Function(definitions + "\nreturn { posted, renderConditionNode, variableKeyParts: typeof variableKeyParts === 'function' ? variableKeyParts : undefined, branchActionValue: typeof branchActionValue === 'function' ? branchActionValue : undefined, navigationTargetInfo: typeof navigationTargetInfo === 'function' ? navigationTargetInfo : undefined, renderNavigationTargetEditor: typeof renderNavigationTargetEditor === 'function' ? renderNavigationTargetEditor : undefined, commitNavigationEditor: typeof commitNavigationEditor === 'function' ? commitNavigationEditor : undefined, localizedValueInfo: typeof localizedValueInfo === 'function' ? localizedValueInfo : undefined, localizedValueDefault: typeof localizedValueDefault === 'function' ? localizedValueDefault : undefined, localizedValueFromEditor: typeof localizedValueFromEditor === 'function' ? localizedValueFromEditor : undefined, renderLocalizedEditor: typeof renderLocalizedEditor === 'function' ? renderLocalizedEditor : undefined, renderTranslationInspector: typeof renderTranslationInspector === 'function' ? renderTranslationInspector : undefined };")();
}

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

test("可见文本属性提供结构化翻译键模式", () => {
  const translatedSource = [
    "initial: home",
    "pages:",
    "  home:",
    "    layout:",
    "      type: text",
    "      value:",
    "        t: home.greeting",
    "        with:",
    "          name:",
    "            bind: data.name"
  ].join("\n");
  const html = createVisualEditorHtml(buildVisualModel(
    translatedSource,
    "home",
    ["pages", "home", "layout"]
  ));

  assert.match(html, /data-localized-editor/);

  const runtime = loadVisualEditorRuntime(html);
  assert.equal(runtime.localizedValueInfo({ t: "home.title" }).mode, "translation");
  assert.deepEqual(runtime.localizedValueInfo("$data.title"), { mode: "bind", text: "data.title" });
  assert.deepEqual(runtime.localizedValueDefault("translation", "标题"), { t: "标题" });
  const markup = runtime.renderLocalizedEditor({
    t: "home.greeting",
    with: { name: { bind: "data.name" } }
  }, "layout.value");
  assert.match(markup, /option value="translation" selected>翻译键/);
  assert.match(markup, /data-localized-key value="home\.greeting"/);
  assert.match(markup, /data-localized-with/);
  const controls = {
    "[data-localized-mode]": { value: "translation" },
    "[data-localized-key]": { value: "home.greeting" },
    "[data-localized-with]": { value: '{"name":{"bind":"data.name"}}' }
  };
  assert.deepEqual(runtime.localizedValueFromEditor({
    querySelector(selector) {
      return controls[selector];
    }
  }), {
    t: "home.greeting",
    with: { name: { bind: "data.name" } }
  });
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

test("可视化模型支持 popup 和外部 shell call 字段", () => {
  const model = buildVisualModel([
    "initial: home",
    "pages:",
    "  home:",
    "    state:",
    "      callResult: null",
    "    layout:",
    "      type: popup",
    "      title: 提示",
    "      width: 40",
    "      height: 8",
    "      message: 继续吗？",
    "    keys:",
    "      enter:",
    "        - call:",
    "            sh: \"printf ok\"",
    "            stdio: pipe",
    "            result: state.callResult"
  ].join("\n"), "home", ["pages", "home", "keys", "enter", 0]);

  assert.equal(model.componentTypes.includes("popup"), true);
  assert.equal(model.layoutTree.type, "popup");
  assert.equal(model.layoutTree.preview.message, "继续吗？");
  assert.equal(model.selectedAction.name, "call");
  assert.equal(model.selectedAction.config.sh, "printf ok");
  assert.equal(model.actionFields.call.includes("sh"), true);
  assert.equal(model.actionFields.call.includes("wait"), true);
});

test("可视化模型支持 progress 和 shell 输出回调字段", () => {
  const model = buildVisualModel([
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
    "            sh: \"printf done\"",
    "            lines: state.logs",
    "            json: state.items",
    "            onExit:",
    "              - push: result"
  ].join("\n"), "home", ["pages", "home", "keys", "enter", 0]);

  assert.equal(model.componentTypes.includes("progress"), true);
  assert.equal(model.layoutTree.type, "progress");
  assert.equal(model.layoutTree.preview.max, 100);
  assert.equal(model.actionFields.call.includes("lines"), true);
  assert.equal(model.actionFields.call.includes("json"), true);
  assert.equal(model.actionFields.call.includes("onLine"), true);
  assert.equal(model.actionFields.call.includes("onExit"), true);
  assert.equal(model.actionJsonFields.includes("onExit"), true);
});

test("可视化模型为每个事件生成可编辑流程图", () => {
  const model = buildVisualModel([
    "initial: home",
    "pages:",
    "  home:",
    "    layout: { type: text, value: home }",
    "    keys:",
    "      enter:",
    "        - call:",
    "            command: ./install.sh",
    "            wait: false",
    "            onExit:",
    "              - replace: result",
    "    on:",
    "      enter:",
    "        - set: { path: state.ready, value: true }"
  ].join("\n"), "home");

  assert.deepEqual(model.workflows.map((item) => item.id), ["keys.enter", "on.enter"]);
  const commandFlow = model.workflows[0].workflow;
  const command = commandFlow.nodes.find((node) => node.data?.actionType === "call");
  assert.equal(commandFlow.edges.some((edge) => edge.source === command.id && edge.sourceHandle === "exit"), true);
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

test("可视化模型展开外部语言文件并选择翻译键", () => {
  const model = buildVisualModel([
    "initial: home",
    "i18n:",
    "  locale: zh-CN",
    "  fallback: en",
    "  locales:",
    "    zh-CN: locales/zh-CN.yaml",
    "    en:",
    "      common:",
    "        title: Installer",
    "pages:",
    "  home:",
    "    layout: { type: text, value: home }"
  ].join("\n"), "home", [], {
    externalLocales: {
      "zh-CN": {
        uri: "file:///workspace/locales/zh-CN.yaml",
        fileName: "/workspace/locales/zh-CN.yaml",
        source: [
          "common:",
          "  title: 安装程序",
          "  greeting: 你好"
        ].join("\n")
      }
    },
    selectedLocale: "zh-CN",
    selectedTranslationPath: ["common", "title"]
  });

  assert.equal(model.selectedKind, "translation");
  assert.equal(model.i18n.sourceField, "locales");
  assert.equal(model.i18n.selectedLocaleExternal, true);
  assert.equal(model.i18n.selectedLocaleUri, "file:///workspace/locales/zh-CN.yaml");
  assert.deepEqual(model.i18n.translations.map((entry) => entry.key), [
    "common.title",
    "common.greeting"
  ]);
  assert.deepEqual(model.i18n.selectedTranslationPath, ["common", "title"]);
  assert.equal(model.i18n.selectedTranslationValue, "安装程序");
  assert.equal(model.i18n.locales.find((locale) => locale.code === "en").entryCount, 1);
});

test("可视化模型保留内联语言别名和嵌套写回路径", () => {
  const model = buildVisualModel([
    "initial: home",
    "i18n:",
    "  locale: en",
    "  files:",
    "    en:",
    "      app:",
    "        title: Installer",
    "pages:",
    "  home:",
    "    layout: { type: text, value: home }"
  ].join("\n"), "home", [], {
    selectedLocale: "en"
  });

  assert.equal(model.selectedKind, "locale");
  assert.equal(model.i18n.sourceField, "files");
  assert.equal(model.i18n.selectedLocaleExternal, false);
  assert.deepEqual(model.i18n.translations[0].path, ["app", "title"]);
});

test("翻译文件和翻译值提供独立可视化编辑控件", () => {
  const i18nSource = [
    "initial: home",
    "i18n:",
    "  locale: en",
    "  locales:",
    "    en:",
    "      app:",
    "        title: Installer",
    "pages:",
    "  home:",
    "    layout: { type: text, value: home }"
  ].join("\n");
  const html = createVisualEditorHtml(buildVisualModel(i18nSource, "home", [], {
    selectedLocale: "en",
    selectedTranslationPath: ["app", "title"]
  }));
  const runtime = loadVisualEditorRuntime(html);
  const inspector = runtime.renderTranslationInspector();

  assert.match(html, /<h2>翻译文件<\/h2>/);
  assert.match(html, /data-command=\"add-locale\"/);
  assert.match(html, /data-command=\"add-translation\"/);
  assert.match(html, /type: \"selectTranslation\"/);
  assert.match(inspector, /value="app\.title" readonly/);
  assert.match(inspector, /data-translation-value>Installer<\/textarea>/);
  assert.match(inspector, /data-command="save-translation"/);
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

test("JSON 语言文件写回后仍是合法 JSON", () => {
  const source = JSON.stringify({ common: { title: "Installer", old: "remove" } }, null, 4);
  const changed = applyJsonOperation(source, {
    type: "set",
    path: ["common", "greeting"],
    value: "Hello"
  });
  const deleted = applyJsonOperation(changed, {
    type: "delete",
    path: ["common", "old"]
  });
  const parsed = JSON.parse(deleted);

  assert.equal(parsed.common.title, "Installer");
  assert.equal(parsed.common.greeting, "Hello");
  assert.equal(parsed.common.old, undefined);
  assert.match(deleted, /\n    "common"/);
  assert.doesNotMatch(deleted, /^common:/m);
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
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
});

test("工作流画布独立打开且不改变现有布局编辑方式", () => {
  const html = createVisualEditorHtml(buildVisualModel(source, "home"), {
    cspSource: "vscode-webview://test",
    workflowScriptUri: "vscode-webview://test/media/workflow-editor.js",
    workflowStyleUri: "vscode-webview://test/media/workflow-editor.css"
  });

  assert.match(html, /id="layout-workspace" class="workspace"/);
  assert.match(html, /data-command="open-workflow"/);
  assert.match(html, /data-command="close-workflow"/);
  assert.doesNotMatch(html, /data-editor-mode=/);
  assert.match(html, /id="workflow-root"/);
  assert.match(html, /href="vscode-webview:\/\/test\/media\/workflow-editor\.css"/);
  assert.match(html, /src="vscode-webview:\/\/test\/media\/workflow-editor\.js"/);
  assert.match(html, /page-tui-workflow-model/);
  assert.match(html, /page-tui-workflow-error/);
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
  assert.match(actionHtml, /data-action-branch-field/);
  assert.match(actionHtml, /branch-action-advanced/);
});

test("Webview 比较条件会同时渲染左值和右值", () => {
  const html = createVisualEditorHtml(buildVisualModel(source, "home"));
  const { renderConditionNode } = loadVisualEditorRuntime(html);

  const condition = renderConditionNode({ equals: ["state.selected", 0] }, true);

  assert.match(condition, />左值<\/label>/);
  assert.match(condition, /data-condition-operand="left"/);
  assert.match(condition, />右值<\/label>/);
  assert.match(condition, /data-condition-operand="right"/);
});

test("Webview 页面变量字段名会拆分为嵌套路径", () => {
  const html = createVisualEditorHtml(buildVisualModel(source, "home"));
  const { variableKeyParts } = loadVisualEditorRuntime(html);

  assert.equal(typeof variableKeyParts, "function");
  assert.deepEqual(variableKeyParts("local.item"), ["local", "item"]);
  assert.deepEqual(variableKeyParts("items"), ["items"]);
  assert.deepEqual(variableKeyParts("local..item"), []);
});

test("Webview 导航目标会解析为结构化控件", () => {
  const navigationSource = [
    "initial: home",
    "data:",
    "  items:",
    "    - title: start",
    "      page: detail",
    "pages:",
    "  home:",
    "    state:",
    "      selected: 0",
    "    keys:",
    "      enter:",
    "        - push:",
    "            page:",
    "              itemAt:",
    "                list: data.items",
    "                index: state.selected",
    "                key: page",
    "            params: {}",
    "  detail:",
    "    layout:",
    "      type: text",
    "      value: detail"
  ].join("\n");
  const html = createVisualEditorHtml(buildVisualModel(
    navigationSource,
    "home",
    ["pages", "home", "keys", "enter", 0]
  ));
  const { navigationTargetInfo, renderNavigationTargetEditor } = loadVisualEditorRuntime(html);
  const markup = renderNavigationTargetEditor({
    itemAt: { list: "data.items", index: "state.selected", key: "page" }
  }, { scope: "action", field: "page" });

  assert.match(markup, /data-navigation-editor/);
  assert.match(markup, /data-navigation-mode/);
  assert.match(markup, /data-navigation-item-list/);
  assert.match(markup, /value="data\.items"/);
  assert.match(markup, /data-navigation-item-index/);
  assert.match(markup, /value="state\.selected"/);
  assert.match(markup, /data-navigation-item-key/);
  assert.match(markup, /value="page"/);
  assert.doesNotMatch(markup, /data-action-field="page"/);
  assert.equal(typeof navigationTargetInfo, "function");
  assert.equal(typeof renderNavigationTargetEditor, "function");
  assert.equal(navigationTargetInfo({ itemAt: { list: "data.items", index: "state.selected", key: "page" } }).mode, "itemAt");
});

test("Webview 导航目标回写会保留当前动作类型", () => {
  const navigationSource = [
    "initial: home",
    "pages:",
    "  home:",
    "    keys:",
    "      enter:",
    "        - push:",
    "            page: detail",
    "  detail:",
    "    layout:",
    "      type: text",
    "      value: detail"
  ].join("\n");
  const html = createVisualEditorHtml(buildVisualModel(
    navigationSource,
    "home",
    ["pages", "home", "keys", "enter", 0]
  ));
  const { commitNavigationEditor, posted } = loadVisualEditorRuntime(html);

  assert.equal(typeof commitNavigationEditor, "function");
  commitNavigationEditor({
    dataset: { navigationScope: "action", navigationField: "page" }
  }, { bind: "state.nextPage" });

  assert.deepEqual(posted.at(-1).operation.value, {
    push: { page: { bind: "state.nextPage" } }
  });
});

test("Webview 分支动作的结构化字段会保留动作配置", () => {
  const html = createVisualEditorHtml(buildVisualModel(source, "home"));
  const { branchActionValue } = loadVisualEditorRuntime(html);

  assert.equal(typeof branchActionValue, "function");
  assert.deepEqual(branchActionValue("push", { page: "First Info", params: {} }), {
    push: { page: "First Info", params: {} }
  });
  assert.deepEqual(branchActionValue("call", { service: "tasks.save", with: { id: "state.id" } }), {
    call: { service: "tasks.save", with: { id: "state.id" } }
  });
  assert.deepEqual(branchActionValue("call", { sh: "printf ok", wait: false, result: "state.process" }), {
    call: { sh: "printf ok", wait: false, result: "state.process" }
  });
  assert.deepEqual(branchActionValue("call", { command: "task", lines: "state.logs", onExit: [{ push: "result" }] }), {
    call: { command: "task", lines: "state.logs", onExit: [{ push: "result" }] }
  });
});
