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
  "      nextPage: detail",
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
  "            page:",
  "              bind: state.nextPage",
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

test("预览条件可以解析普通 state 路径并显示 popup", () => {
  const session = createPreviewSession([
    "initial: home",
    "pages:",
    "  home:",
    "    state:",
    "      show: false",
    "    layout:",
    "      type: column",
    "      children:",
    "        - type: popup",
    "          title: 提示",
    "          visible: { equals: [ state.show, true ] }",
    "          message: 已显示",
    "    keys:",
    "      enter:",
    "        - set:",
    "            path: state.show",
    "            value: true"
  ].join("\n"));

  assert.doesNotMatch(session.model().body, /已显示/);
  session.dispatch({ type: "key", key: "enter" });
  assert.match(session.model().body, /已显示/);
});

test("预览将 mask 输入渲染为密码控件", () => {
  const session = createPreviewSession([
    "initial: home",
    "pages:",
    "  home:",
    "    state:",
    "      password: secret",
    "    layout:",
    "      type: input",
    "      bind: state.password",
    "      mask: true"
  ].join("\n"));

  assert.match(session.model().body, /type="password"/);
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

test("预览按绑定状态渲染进度条", () => {
  const session = createPreviewSession([
    "initial: home",
    "pages:",
    "  home:",
    "    state:",
    "      progress: 25",
    "    layout:",
    "      type: progress",
    "      bind: state.progress",
    "      max: 100",
    "      label: 下载"
  ].join("\n"));

  assert.match(session.model().body, /component-progress/);
  assert.match(session.model().body, /progress-fill/);
  assert.match(session.model().body, /width:25%/);
  assert.match(session.model().body, /25%/);
});

test("预览按变量切换内联和外部语言模块", () => {
  const session = createPreviewSession([
    "initial: home",
    "data:",
    "  locale: en",
    "  name: Ada",
    "  items: []",
    "i18n:",
    "  locale:",
    "    bind: data.locale",
    "  fallback: zh-CN",
    "  locales:",
    "    en: locales/en.yaml",
    "    zh-CN:",
    "      home:",
    "        title: 安装程序",
    "        greeting: \"你好，{{ params.name }}\"",
    "        placeholder: 请输入内容",
    "        empty: 暂无内容",
    "pages:",
    "  home:",
    "    title:",
    "      t: home.title",
    "    state:",
    "      value: \"\"",
    "    layout:",
    "      type: column",
    "      children:",
    "        - type: text",
    "          value:",
    "            t: home.greeting",
    "            with:",
    "              name:",
    "                bind: data.name",
    "        - type: text",
    "          template: \"{{ t('home.title') }}\"",
    "        - type: input",
    "          bind: state.value",
    "          placeholder:",
    "            t: home.placeholder",
    "        - type: list",
    "          items: data.items",
    "          emptyText:",
    "            t: home.empty",
    "    keys:",
    "      l:",
    "        - set:",
    "            path: data.locale",
    "            value: zh-CN"
  ].join("\n"), undefined, {
    locales: {
      en: {
        home: {
          title: "Installer",
          greeting: "Hello, {{ params.name }}",
          placeholder: "Type a value",
          empty: "No content"
        }
      }
    }
  });

  assert.match(session.model().body, /Installer/);
  assert.match(session.model().body, /Hello, Ada/);
  assert.match(session.model().body, /placeholder="Type a value"/);
  assert.match(session.model().body, /No content/);

  session.dispatch({ type: "key", key: "l" });
  assert.match(session.model().body, /安装程序/);
  assert.match(session.model().body, /你好，Ada/);
  assert.match(session.model().body, /placeholder="请输入内容"/);
  assert.match(session.model().body, /暂无内容/);
});
