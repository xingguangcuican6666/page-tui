const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const extensionRoot = path.join(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"));
const extensionSource = fs.readFileSync(path.join(extensionRoot, "extension.js"), "utf8");

class CompletionItem {
  constructor(label, kind) {
    this.label = label;
    this.kind = kind;
  }
}

class SnippetString {
  constructor(value) {
    this.value = value;
  }
}

class MarkdownString {
  constructor(value) {
    this.value = value;
  }
}

const vscodeMock = {
  CompletionItem,
  CompletionItemKind: {
    Event: "event",
    Keyword: "keyword",
    Property: "property",
    Reference: "reference",
    Value: "value",
    Variable: "variable"
  },
  MarkdownString,
  SnippetString
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "vscode") return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};

const { provideCompletions } = require("../extension");
Module._load = originalLoad;

function documentFrom(lines, languageId = "yaml", fileName = "/workspace/ui/app.yaml") {
  return {
    fileName,
    languageId,
    lineAt(line) {
      return { text: lines[line] };
    },
    getText() {
      return lines.join("\n");
    }
  };
}

test("app.yaml activates for the normal YAML language too", () => {
  assert.equal(packageJson.activationEvents.includes("onLanguage:yaml"), true);
});

test("实时预览命令已注册", () => {
  assert.equal(packageJson.activationEvents.includes("onCommand:pageTui.preview"), true);
  assert.equal(
    packageJson.contributes.commands.some((command) => command.command === "pageTui.preview"),
    true
  );
});

test("可视化编辑器 custom editor 和命令已注册", () => {
  assert.equal(packageJson.activationEvents.includes("onCommand:pageTui.openVisualEditor"), true);
  assert.equal(
    packageJson.contributes.commands.some((command) => command.command === "pageTui.openVisualEditor"),
    true
  );
  assert.equal(
    packageJson.contributes.customEditors.some((editor) => editor.viewType === "pageTui.visualEditor"),
    true
  );
  const visualEditor = packageJson.contributes.customEditors.find(
    (editor) => editor.viewType === "pageTui.visualEditor"
  );
  assert.equal(visualEditor.selector.every((item) => typeof item.filenamePattern === "string"), true);
  assert.equal(visualEditor.selector.some((item) => Object.prototype.hasOwnProperty.call(item, "filename")), false);
  assert.match(extensionSource, /message\.type === "deletePage"/);
  assert.match(extensionSource, /showWarningMessage\(/);
  assert.match(extensionSource, /webviewOptions: \{ retainContextWhenHidden: false \}/);
});

test("工作流 Webview 资源会随扩展本地打包", () => {
  const script = packageJson.scripts["build:webview"];
  const javascript = path.join(extensionRoot, "media", "workflow-editor.js");
  const stylesheet = path.join(extensionRoot, "media", "workflow-editor.css");

  assert.equal(typeof script, "string");
  assert.match(packageJson.scripts["vscode:prepublish"], /build:webview/);
  assert.equal(fs.statSync(javascript).size > 1000, true);
  assert.equal(fs.statSync(stylesheet).size > 100, true);
  assert.match(extensionSource, /asWebviewUri/);
});

test("root fields are suggested while typing data", () => {
  const document = documentFrom(["da"], "page-tui-yaml");
  const items = provideCompletions(document, { line: 0, character: 2 });
  const data = items.find((item) => item.label === "data");
  assert.ok(data);
  assert.equal(data.insertText.value, "data:");
  assert.equal(data.detail, "Page TUI · Page TUI manifest");
  assert.equal(data.filterText, "data");
});

test("language module fields are suggested", () => {
  const rootDocument = documentFrom(["i1"]);
  const rootItems = provideCompletions(rootDocument, { line: 0, character: 1 });
  assert.equal(rootItems.some((item) => item.label === "i18n"), true);

  const i18nDocument = documentFrom(["i18n:", "  lo"]);
  const i18nItems = provideCompletions(i18nDocument, { line: 1, character: 4 });
  assert.equal(i18nItems.some((item) => item.label === "locale"), true);
  assert.equal(i18nItems.some((item) => item.label === "locales"), true);
});

test("manifest root does not suggest page-only keys", () => {
  const document = documentFrom(["ke"], "page-tui-yaml", "/workspace/ui/app.yaml");
  const items = provideCompletions(document, { line: 0, character: 2 });
  assert.equal(items.some((item) => item.label === "keys"), false);
});

test("standalone page files suggest page root keys", () => {
  const document = documentFrom(["ke"], "page-tui-yaml", "/workspace/ui/pages/home.yaml");
  const items = provideCompletions(document, { line: 0, character: 2 });
  const keys = items.find((item) => item.label === "keys");
  assert.ok(keys);
  assert.equal(keys.insertText.value, "keys:");
});

test("Page TUI keeps automatic quick suggestions enabled", () => {
  const defaults = packageJson.contributes.configurationDefaults["[page-tui-yaml]"];
  assert.equal(defaults["editor.quickSuggestions"].other, true);
  assert.equal(defaults["editor.suggest.snippetsPreventQuickSuggestions"], false);
});

test("page fields are suggested on an empty page line", () => {
  const document = documentFrom([
    "pages:",
    "  home:",
    "    "
  ]);
  const items = provideCompletions(document, { line: 2, character: 4 });
  assert.equal(items.some((item) => item.label === "state"), true);
  assert.equal(items.some((item) => item.label === "layout"), true);
  assert.equal(items.some((item) => item.label === "keys"), true);
});

test("keys are suggested while typing a key name", () => {
  const document = documentFrom([
    "pages:",
    "  home:",
    "    keys:",
    "      e"
  ]);
  const items = provideCompletions(document, { line: 3, character: 7 });
  assert.equal(items.some((item) => item.label === "enter"), true);
  assert.equal(items.some((item) => item.label === "escape"), true);
});

test("action snippets preserve the YAML indentation of the current list item", () => {
  const document = documentFrom([
    "pages:",
    "  home:",
    "    keys:",
    "      enter:",
    "        - "
  ]);
  const items = provideCompletions(document, { line: 4, character: 10 });
  const set = items.find((item) => item.label === "set");
  assert.ok(set);
  assert.match(set.insertText.value, /\n {12}path:/);
});

test("action snippets are not suggested for arbitrary data lists", () => {
  const document = documentFrom([
    "data:",
    "  items:",
    "    - "
  ], "page-tui-yaml");
  const items = provideCompletions(document, { line: 2, character: 6 });
  assert.equal(items.some((item) => item.label === "append"), false);
  assert.equal(items.some((item) => item.label === "set"), false);
});

test("data lists offer data item templates", () => {
  const document = documentFrom([
    "data:",
    "  items:",
    "    - "
  ], "page-tui-yaml");
  const items = provideCompletions(document, { line: 2, character: 6 });
  const object = items.find((item) => item.label === "object");
  const value = items.find((item) => item.label === "value");
  assert.ok(object);
  assert.ok(value);
  assert.equal(object.detail, "Page TUI · 数据对象项");
  assert.match(object.insertText.value, /key/);
});

test("data itself remains an object rather than a list", () => {
  const document = documentFrom([
    "data:",
    "  - "
  ], "page-tui-yaml");
  const items = provideCompletions(document, { line: 1, character: 4 });
  assert.equal(items.some((item) => item.label === "object"), false);
  assert.equal(items.some((item) => item.label === "value"), false);
});

test("layout children offer component node templates", () => {
  const document = documentFrom([
    "pages:",
    "  home:",
    "    layout:",
    "      children:",
    "        - "
  ], "page-tui-yaml");
  const items = provideCompletions(document, { line: 4, character: 10 });
  const text = items.find((item) => item.label === "text");
  const column = items.find((item) => item.label === "column");
  assert.ok(text);
  assert.ok(column);
  assert.equal(items.some((item) => item.label === "set"), false);
  assert.match(text.insertText.value, /type: text/);
});

test("data fields named like actions are not treated as action objects", () => {
  const document = documentFrom([
    "data:",
    "  set:",
    "    "
  ], "page-tui-yaml");
  const items = provideCompletions(document, { line: 2, character: 4 });
  assert.equal(items.some((item) => item.label === "path"), false);
  assert.equal(items.some((item) => item.label === "value"), false);
});

test("action snippets remain available inside a page key handler", () => {
  const document = documentFrom([
    "pages:",
    "  home:",
    "    keys:",
    "      enter:",
    "        - "
  ], "page-tui-yaml");
  const items = provideCompletions(document, { line: 4, character: 10 });
  assert.equal(items.some((item) => item.label === "append"), true);
  assert.equal(items.some((item) => item.label === "set"), true);
});

test("the extension does not provide AI inline text", () => {
  assert.equal(extensionSource.includes("registerInlineCompletionItemProvider"), false);
});
