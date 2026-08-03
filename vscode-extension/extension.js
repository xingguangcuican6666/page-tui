const vscode = require("vscode");
const crypto = require("node:crypto");
const path = require("node:path");
const YAML = require("yaml");
const { validatePageTui } = require("./validation");
const { createPreviewHtml, createPreviewSession } = require("./preview");
const STARTER_PAGE = require("./starter");

const COMPONENT_HELP = {
  text: ["text：显示一行文字。", "value、bind 或 template 三选一。"],
  input: ["input：显示单行输入框。", "通常绑定 state.title，并配合 character/backspace 动作。"],
  column: ["column：从上到下排列 children。", "最常用的页面外层布局。"],
  row: ["row：从左到右排列 children。", "适合标题、状态和并列面板。"],
  panel: ["panel：给 child 加边框和标题。", "可以设置 flex: true 占用剩余空间。"],
  list: ["list：显示可选择的数组。", "items 是数组路径，selected 是从 0 开始的序号。"],
  divider: ["divider：显示横向分隔线。", "可以设置 character 和 style。"],
  spacer: ["spacer：占用空白高度。", "height 或 lines 表示空白行数。"]
};

const ACTION_HELP = {
  set: ["set：设置 data、state 或 params 变量。", "示例：path: state.notice，value: \"保存成功\"。"],
  move: ["move：移动数字选择。", "需要 path、by 和 list。"],
  toggle: ["toggle：切换布尔值。", "可以直接切换 path，也可以切换列表项目的 field。"],
  remove: ["remove：从数组中删除一个项目。", "需要 list 和 index。"],
  append: ["append：追加字符串或数组项目。", "path 用于字符串，list 用于数组。"],
  backspace: ["backspace：删除字符串末尾的一个 Unicode 字符。", "需要 path。"],
  push: ["push：把页面压入页面栈。", "页面返回时会恢复上一页。"],
  go: ["go：push 的别名。", "适合表达“去某个页面”。"],
  replace: ["replace：替换当前页面。", "返回时不会回到被替换的页面。"],
  reset: ["reset：清空页面栈后打开新页面。", "适合退出登录或结束流程。"],
  pop: ["pop：返回上一页。", "根页面执行时会退出应用。"],
  quit: ["quit：退出应用。", "可以指定 code。"],
  call: ["call：调用启动器注册的白名单 service。", "复杂业务逻辑放在 Node.js 中。"],
  refresh: ["refresh：执行启动器的 refresh 回调。", "适合重新读取文件、数据库或 API。"],
  notify: ["notify：设置 state.notice。", "也可以用 set 修改任意提示变量。"],
  if: ["if：根据 condition 执行 then 或 else。", "支持 notEmpty、equals、all、any 等条件。"]
};

const ROOT_HELP = {
  data: ["data：应用共享数据。", "多个页面都需要的任务、用户和配置通常放在这里。"],
  state: ["state：当前页面自己的临时变量。", "例如 selected、title、loading 和 error。"],
  params: ["params：进入当前页面时收到的参数。", "由 push、go、replace 或 reset 传入。"],
  page: ["page：params 的别名。", "推荐新代码统一使用 params。"],
  item: ["item：list 当前项目。", "只在 list 的 label、description 和 style 中有意义。"],
  key: ["key：当前按键对象。", "key.value 可用于文本输入。"],
  index: ["index：list 当前项目的序号，从 0 开始。", "只在 list 项目表达式中可用。"]
};

const COMPONENTS = ["text", "input", "column", "row", "panel", "list", "divider", "spacer"];
const KEY_NAMES = ["up", "down", "left", "right", "enter", "escape", "space", "backspace", "character"];
const STYLES = ["title", "primary", "selected", "muted", "border", "success", "warning", "danger", "input"];
const PAGE_FIELDS = ["title", "state", "layout", "keys", "on"];
const ROOT_FIELDS = ["initial", "data", "pages"];
const LAYOUT_FIELDS = ["type", "children", "child", "value", "bind", "template", "visible", "style", "padding", "gap", "flex"];
const KEY_TRIGGER_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const COMPONENT_FIELDS = {
  text: ["value", "bind", "template", "style", "visible"],
  input: ["bind", "placeholder", "character", "style", "visible"],
  column: ["children", "gap", "padding", "style", "visible"],
  row: ["children", "gap", "padding", "style", "visible"],
  panel: ["title", "child", "children", "style", "flex", "visible"],
  list: ["items", "selected", "label", "description", "itemStyle", "selectedStyle", "visible"],
  divider: ["character", "style", "visible"],
  spacer: ["height", "lines", "visible"]
};
const ACTION_FIELDS = {
  set: ["path", "value", "then"],
  move: ["path", "by", "list", "within"],
  toggle: ["path", "list", "index", "field"],
  remove: ["list", "index", "within"],
  append: ["path", "list", "value"],
  backspace: ["path"],
  push: ["page", "route", "params"],
  go: ["page", "route", "params"],
  replace: ["page", "route", "params"],
  reset: ["page", "route", "params"],
  pop: ["result"],
  quit: ["code"],
  call: ["with", "args"],
  if: ["condition", "then", "else"]
};
const ACTION_CONTAINER_KEYS = new Set(["keys", "on", "then", "else"]);
const DOCUMENT_SELECTOR = [
  { language: "page-tui-yaml" },
  { language: "yaml" }
];
const DATA_LIST_ITEMS = [
  {
    label: "object",
    detail: "数据对象项",
    body: "${1:key}: ${2:value}"
  },
  {
    label: "value",
    detail: "数据值项",
    body: "${1:value}"
  }
];
const LAYOUT_LIST_ITEMS = [
  { label: "text", detail: "文本组件节点", body: "type: text\nvalue: ${1:文本}" },
  { label: "input", detail: "输入组件节点", body: "type: input\nbind: ${1:state.value}" },
  { label: "column", detail: "垂直布局节点", body: "type: column\nchildren:\n  - ${1:text}" },
  { label: "row", detail: "水平布局节点", body: "type: row\nchildren:\n  - ${1:text}" },
  { label: "panel", detail: "面板组件节点", body: "type: panel\ntitle: \"${1:标题}\"\nchild:\n  type: text" },
  { label: "list", detail: "列表组件节点", body: "type: list\nitems: ${1:data.items}\nselected: ${2:state.selected}" },
  { label: "divider", detail: "分隔线组件节点", body: "type: divider" },
  { label: "spacer", detail: "空白组件节点", body: "type: spacer\nheight: ${1:1}" }
];
const PAGE_LIST_ITEMS = [
  {
    label: "page",
    detail: "页面节点",
    body: "name: ${1:detail}\ntitle: \"${2:详情}\"\nlayout:\n  type: ${3:column}"
  }
];

let diagnostics;
let statusBar;
let previewPanel;
let previewDocument;
let previewSession;
let previewPage;
let previewTimer;
let previewReady = false;
let previewNonce;

function isPageTuiDocument(document) {
  if (!document) return false;
  if (document.languageId === "page-tui-yaml") return true;
  if (document.languageId !== "yaml") return false;
  if (document.fileName.endsWith(".page.yaml")
    || document.fileName.endsWith(".page.yml")
    || /(^|[\\/])app\.ya?ml$/.test(document.fileName)
    || /(^|[\\/])ui[\\/]pages[\\/].*\.ya?ml$/.test(document.fileName)) return true;
  const text = typeof document.getText === "function" ? document.getText() : "";
  return /^\s*(?:initial|pages):\s*$/m.test(text);
}

function markdown(text) {
  const value = new vscode.MarkdownString(text);
  value.isTrusted = false;
  return value;
}

function completion(label, kind, detail, insertText, documentation) {
  const item = new vscode.CompletionItem(label, kind);
  item.detail = "Page TUI · " + detail;
  item.filterText = label;
  item.sortText = "0_" + label;
  item.keepWhitespace = true;
  item.insertText = insertText instanceof vscode.SnippetString
    ? insertText
    : new vscode.SnippetString(insertText || label);
  if (documentation) item.documentation = markdown(documentation);
  return item;
}

function lineBefore(document, position) {
  return document.lineAt(position.line).text.slice(0, position.character);
}

function collectPaths(value, root, output, prefix = root, depth = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 3) return;
  for (const [key, child] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) continue;
    const path = prefix + "." + key;
    output.add(path);
    collectPaths(child, root, output, path, depth + 1);
  }
}

function knownPaths(document) {
  const output = new Set(["data", "state", "params", "page", "item", "key", "index"]);
  try {
    const root = YAML.parse(document.getText()) || {};
    collectPaths(root.data, "data", output);
    if (root.state) collectPaths(root.state, "state", output);
    if (root.pages && typeof root.pages === "object") {
      for (const page of Object.values(root.pages)) {
        if (page && typeof page === "object") collectPaths(page.state, "state", output);
      }
    }
  } catch {
    // YAML 语法错误由 diagnostics 显示，这里只返回基础路径。
  }
  return Array.from(output);
}

function pageRoutes(document) {
  try {
    const root = YAML.parse(document.getText()) || {};
    if (root.pages && typeof root.pages === "object") return Object.keys(root.pages);
  } catch {
    // 等 YAML 修复后，下一次编辑会重新计算。
  }
  return [];
}

function syntaxStack(document, lineNumber) {
  const stack = [];
  for (let index = 0; index < lineNumber; index += 1) {
    const line = document.lineAt(index).text;
    const match = line.match(/^(\s*)(?:-\s*)?([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) continue;
    const indent = match[1].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    stack.push({ key: match[2], value: (match[3] || "").trim(), indent });
  }
  return stack;
}

function structuralFields(document, lineNumber) {
  const line = document.lineAt(lineNumber).text;
  if (!/^\s*[A-Za-z0-9_-]*\s*$/.test(line)) return [];
  const stack = syntaxStack(document, lineNumber);
  const keys = stack.map((item) => item.key);
  if (keys.includes("keys")) return [];
  const type = [...stack].reverse().find((item) => item.key === "type")?.value;
  if (type && COMPONENT_FIELDS[type]) return COMPONENT_FIELDS[type];
  const action = isActionContext(document, lineNumber)
    ? [...stack].reverse().find((item) => ACTION_FIELDS[item.key])
    : undefined;
  if (action) return ACTION_FIELDS[action.key];
  if (keys.includes("layout")) return LAYOUT_FIELDS;
  if (keys.includes("pages") && stack.some((item) => item.indent > 0)) return PAGE_FIELDS;
  if (keys.includes("children")) return ["type"];
  if (keys.length === 0) return ROOT_FIELDS;
  return [];
}

function fieldCompletions(fields) {
  return fields.map((name) => completion(
    name,
    vscode.CompletionItemKind.Property,
    "Page TUI 字段",
    name + ":"
  ));
}

function rootFieldCompletions(document, position) {
  const before = lineBefore(document, position);
  if (!/^\s*[A-Za-z0-9_-]*$/.test(before)) return [];
  if (syntaxStack(document, position.line).length > 0) return [];
  return ROOT_FIELDS.map((name) => completion(
    name,
    vscode.CompletionItemKind.Property,
    "Page TUI manifest",
    name + ":"
  ));
}

function isKeyFieldContext(document, lineNumber) {
  const line = document.lineAt(lineNumber).text;
  if (!/^\s*[A-Za-z0-9_-]*\s*$/.test(line)) return false;
  const stack = syntaxStack(document, lineNumber);
  return stack[stack.length - 1]?.key === "keys";
}

function keyCompletions(document, position, prefix) {
  if (!isKeyFieldContext(document, position.line)) return [];
  return KEY_NAMES
    .filter((name) => name.startsWith(prefix))
    .map((name) => completion(
      name,
      vscode.CompletionItemKind.Event,
      "Page TUI 按键",
      name + ":"
    ));
}

function isActionContext(document, lineNumber) {
  const stack = syntaxStack(document, lineNumber);
  if (stack[0]?.key === "data") return false;
  return stack.some((item) => ACTION_CONTAINER_KEYS.has(item.key));
}

function listItemCompletions(document, position, prefix) {
  const stack = syntaxStack(document, position.line);
  const root = stack[0]?.key;
  let candidates = [];
  if (root === "data") {
    candidates = DATA_LIST_ITEMS;
  } else if (root === "pages" && stack.some((item) => item.key === "children")) {
    candidates = LAYOUT_LIST_ITEMS;
  } else if (stack.some((item) => item.key === "children")) {
    candidates = LAYOUT_LIST_ITEMS;
  } else if (root === "pages") {
    candidates = PAGE_LIST_ITEMS;
  }
  return candidates
    .filter((item) => item.label.startsWith(prefix))
    .map((item) => completion(
      item.label,
      vscode.CompletionItemKind.Property,
      item.detail,
      indentActionSnippet(document, position, item.body)
    ));
}

function indentActionSnippet(document, position, body) {
  const line = document.lineAt(position.line).text;
  const baseIndent = line.match(/^\s*/)?.[0].length || 0;
  const continuationIndent = " ".repeat(baseIndent + 2);
  return body.split("\n").map((part, index) => {
    if (index === 0 || !part) return part;
    return continuationIndent + part;
  }).join("\n");
}

function provideCompletions(document, position) {
  if (!isPageTuiDocument(document)) return [];
  const before = lineBefore(document, position);
  const prefixMatch = before.match(/[A-Za-z0-9_.-]*$/);
  const prefix = prefixMatch ? prefixMatch[0] : "";

  // 根节点不能依赖 YAML 解析结果：用户刚输入 `da` 时，文档暂时还不是合法对象。
  const rootFields = rootFieldCompletions(document, position);
  if (rootFields.length) return rootFields;

  if (/\btype:\s*[A-Za-z0-9_-]*$/.test(before)) {
    return COMPONENTS.map((name) => completion(
      name,
      vscode.CompletionItemKind.Value,
      "Page TUI 布局组件",
      name,
      COMPONENT_HELP[name][0] + "\n\n" + COMPONENT_HELP[name][1]
    ));
  }

  if (/\b(?:style|borderStyle|titleStyle|selectedStyle|itemStyle|disabledStyle):\s*[A-Za-z0-9_-]*$/.test(before)) {
    return STYLES.map((name) => completion(name, vscode.CompletionItemKind.Value, "Page TUI 样式", name));
  }

  if (/\b(?:page|route):\s*[A-Za-z0-9_-]*$/.test(before)) {
    return pageRoutes(document).map((name) => completion(
      name,
      vscode.CompletionItemKind.Reference,
      "manifest 中已注册的页面",
      name
    ));
  }

  const variableContext = before.includes("{{")
    || /\b(?:bind|items|selected|path|within|list|index|notEmpty|empty|truthy):\s*[A-Za-z0-9_.-]*$/.test(before);
  if (variableContext) {
    return knownPaths(document).map((name) => completion(
      name,
      vscode.CompletionItemKind.Variable,
      "Page TUI 变量路径",
      name,
      ROOT_HELP[name.split(".")[0]]?.[0] || "Page TUI 变量路径"
    ));
  }

  if (!isActionContext(document, position.line) && /^\s*-\s*[A-Za-z0-9_-]*$/.test(before)) {
    const items = listItemCompletions(document, position, prefix);
    if (items.length) return items;
  }

  if (isActionContext(document, position.line) && /^\s*-\s*[A-Za-z0-9_-]*$/.test(before)) {
    const snippets = {
      set: "set:\n  path: ${1:state.notice}\n  value: ${2:操作成功}",
      move: "move:\n  path: ${1:state.selected}\n  by: ${2:1}\n  list: ${3:data.items}",
      toggle: "toggle:\n  path: ${1:state.enabled}",
      append: "append:\n  path: ${1:state.title}\n  value:\n    bind: key.value",
      push: "push:\n  page: ${1:detail}\n  params:\n    ${2:item}:\n      bind: ${3:state.item}",
      pop: "pop",
      call: "call: ${1:tasks.save}\n  with:\n    value:\n      bind: ${2:state.value}",
      refresh: "refresh",
      if: "if:\n  condition:\n    notEmpty: ${1:state.title}\n  then:\n    - ${2:pop}\n  else:\n    - set:\n        path: ${3:state.error}\n        value: \\\"${4:请输入内容}\\\""
    };
    return Object.entries(snippets).map(([name, body]) => completion(
      name,
      vscode.CompletionItemKind.Keyword,
      ACTION_HELP[name]?.[0] || "Page TUI 动作",
      indentActionSnippet(document, position, body.replaceAll("\\\"", "")),
      ACTION_HELP[name]?.[1]
    ));
  }

  const keys = keyCompletions(document, position, prefix);
  if (keys.length) return keys;

  const fields = structuralFields(document, position.line);
  if (fields.length) return fieldCompletions(fields);

  if (prefix.length > 0 && ROOT_HELP[prefix]) {
    return [completion(prefix, vscode.CompletionItemKind.Variable, ROOT_HELP[prefix][0], prefix)];
  }
  return [];
}

function provideHover(document, position) {
  if (!isPageTuiDocument(document)) return undefined;
  const range = document.getWordRangeAtPosition(position, /[A-Za-z0-9_.-]+/);
  const word = range ? document.getText(range) : "";
  const root = word.split(".")[0];
  if (COMPONENT_HELP[word]) {
    return new vscode.Hover(markdown("**" + COMPONENT_HELP[word][0] + "**\n\n" + COMPONENT_HELP[word][1]), range);
  }
  if (ACTION_HELP[word]) {
    return new vscode.Hover(markdown("**" + ACTION_HELP[word][0] + "**\n\n" + ACTION_HELP[word][1]), range);
  }
  if (ROOT_HELP[root]) {
    return new vscode.Hover(markdown("**" + ROOT_HELP[root][0] + "**\n\n" + ROOT_HELP[root][1]), range);
  }
  if (document.lineAt(position.line).text.includes("{{")) {
    return new vscode.Hover(markdown("**Page TUI 模板**\n\n使用 data.x、state.x、params.x 等路径读取变量。当前支持 if、count、length、upper、lower 和 default。"), range);
  }
  return undefined;
}

function updateDiagnostics(document) {
  if (!diagnostics || !isPageTuiDocument(document)) return;
  const text = document.getText();
  const issues = validatePageTui(text);
  const result = issues.map((issue) => {
    const start = document.positionAt(issue.start);
    const end = document.positionAt(Math.min(text.length, issue.end));
    const severity = issue.severity === "warning"
      ? vscode.DiagnosticSeverity.Warning
      : vscode.DiagnosticSeverity.Error;
    const diagnostic = new vscode.Diagnostic(new vscode.Range(start, end), issue.message, severity);
    diagnostic.source = "Page TUI";
    return diagnostic;
  });
  diagnostics.set(document.uri, result);
  updateStatus(document, result);
}

function updateStatus(document, result) {
  if (!statusBar) return;
  if (!isPageTuiDocument(document)) {
    statusBar.hide();
    return;
  }
  const errors = result.filter((item) => item.severity === vscode.DiagnosticSeverity.Error).length;
  const warnings = result.filter((item) => item.severity === vscode.DiagnosticSeverity.Warning).length;
  statusBar.text = errors
    ? "$(error) Page TUI: " + errors + " 个错误"
    : warnings
      ? "$(warning) Page TUI: " + warnings + " 个提醒"
      : "$(check) Page TUI";
  statusBar.tooltip = "点击校验当前 Page TUI 文件";
  statusBar.command = "pageTui.validate";
  statusBar.show();
}

async function exists(uri) {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function createStarter() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const defaultUri = folder ? vscode.Uri.joinPath(folder.uri, "ui", "app.yaml") : undefined;
  const target = await vscode.window.showSaveDialog({
    defaultUri,
    saveLabel: "创建 Page TUI 页面",
    filters: { "Page TUI YAML": ["yaml", "yml"] }
  });
  if (!target) return;
  if (await exists(target)) {
    const choice = await vscode.window.showWarningMessage(
      "文件已经存在，要覆盖它吗？",
      { modal: true },
      "覆盖"
    );
    if (choice !== "覆盖") return;
  }
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(target.fsPath)));
  await vscode.workspace.fs.writeFile(target, Buffer.from(STARTER_PAGE, "utf8"));
  const document = await vscode.workspace.openTextDocument(target);
  await vscode.languages.setTextDocumentLanguage(document, "page-tui-yaml");
  await vscode.window.showTextDocument(document);
  updateDiagnostics(document);
}

async function insertTemplate() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("请先打开一个 Page TUI YAML 文件。");
    return;
  }
  await editor.edit((edit) => edit.replace(editor.selection, STARTER_PAGE));
  await vscode.languages.setTextDocumentLanguage(editor.document, "page-tui-yaml");
  updateDiagnostics(editor.document);
}

async function setLanguage() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("请先打开要设置的 YAML 文件。");
    return;
  }
  await vscode.languages.setTextDocumentLanguage(editor.document, "page-tui-yaml");
  vscode.window.showInformationMessage("当前文件已启用 Page TUI 补全和校验。");
  updateDiagnostics(editor.document);
}

function validateCurrent() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  updateDiagnostics(editor.document);
  const issues = validatePageTui(editor.document.getText());
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  if (errors) {
    vscode.window.showErrorMessage("Page TUI 校验发现 " + errors + " 个错误和 " + warnings + " 个提醒。");
  } else if (warnings) {
    vscode.window.showWarningMessage("Page TUI 校验通过，但有 " + warnings + " 个提醒。");
  } else {
    vscode.window.showInformationMessage("Page TUI 校验通过，没有发现问题。");
  }
}

function runProject() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showWarningMessage("请先打开一个项目文件夹。");
    return;
  }
  const command = vscode.workspace.getConfiguration("pageTui").get("runCommand", "npm start");
  const terminal = vscode.window.createTerminal({
    name: "Page TUI",
    cwd: folder.uri.fsPath
  });
  terminal.show(true);
  terminal.sendText(command);
}

function openDocs() {
  const url = vscode.workspace.getConfiguration("pageTui").get(
    "docsUrl",
    "https://github.com/xingguangcuican6666/page-tui/tree/main/docs"
  );
  vscode.env.openExternal(vscode.Uri.parse(url));
}

function previewMessage(model) {
  return {
    type: "update",
    body: model.body,
    error: model.error,
    pageName: model.pageName,
    pageNames: model.pageNames,
    variables: model.variables || {}
  };
}

function updatePreview() {
  if (!previewPanel || !previewDocument) return;
  if (!previewSession) previewSession = createPreviewSession(previewDocument.getText(), previewPage);
  const model = previewSession.model();
  if (model.pageName) previewPage = model.pageName;
  if (!previewReady) {
    previewPanel.webview.html = createPreviewHtml(model, previewNonce);
    return;
  }
  previewPanel.webview.postMessage(previewMessage(model));
}

function schedulePreviewUpdate(document) {
  if (!previewPanel || !previewDocument || document.uri.toString() !== previewDocument.uri.toString()) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = undefined;
    const currentPage = previewSession?.model().pageName || previewPage;
    previewSession = createPreviewSession(document.getText(), currentPage);
    updatePreview();
  }, 120);
}

function openPreview() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isPageTuiDocument(editor.document)) {
    vscode.window.showWarningMessage("请先打开 app.yaml 或 Page TUI YAML 页面。");
    return;
  }

  const sameDocument = previewDocument?.uri.toString() === editor.document.uri.toString();
  previewDocument = editor.document;
  if (!sameDocument) previewPage = undefined;
  previewSession = createPreviewSession(editor.document.getText(), sameDocument ? previewPage : undefined);

  if (previewPanel) {
    previewPanel.reveal(vscode.ViewColumn.Beside);
    updatePreview();
    return;
  }

  previewReady = false;
  previewNonce = crypto.randomBytes(16).toString("hex");
  previewPanel = vscode.window.createWebviewPanel(
    "pageTuiPreview",
    "Page TUI 实时预览",
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  previewPanel.onDidDispose(() => {
    clearTimeout(previewTimer);
    previewTimer = undefined;
    previewPanel = undefined;
    previewDocument = undefined;
    previewSession = undefined;
    previewPage = undefined;
    previewReady = false;
  });
  previewPanel.webview.onDidReceiveMessage((message) => {
    if (message?.type === "ready") {
      previewReady = true;
      updatePreview();
    } else if (message?.type === "selectPage") {
      previewPage = typeof message.page === "string" ? message.page : undefined;
      previewSession?.dispatch({ type: "selectPage", page: previewPage });
      updatePreview();
    } else if (message?.type === "interaction") {
      previewSession?.dispatch(message.event || {});
      updatePreview();
    } else if (message?.type === "reset") {
      previewSession?.reset();
      updatePreview();
    }
  });
  updatePreview();
}

function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection("page-tui");
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  context.subscriptions.push(diagnostics, statusBar);

  const selector = DOCUMENT_SELECTOR;
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      selector,
      { provideCompletionItems: provideCompletions },
      ".",
      "{",
      ":",
      " ",
      ...KEY_TRIGGER_CHARACTERS
    ),
    vscode.languages.registerHoverProvider(selector, { provideHover }),
    vscode.commands.registerCommand("pageTui.createStarter", createStarter),
    vscode.commands.registerCommand("pageTui.insertTemplate", insertTemplate),
    vscode.commands.registerCommand("pageTui.validate", validateCurrent),
    vscode.commands.registerCommand("pageTui.setLanguage", setLanguage),
    vscode.commands.registerCommand("pageTui.preview", openPreview),
    vscode.commands.registerCommand("pageTui.run", runProject),
    vscode.commands.registerCommand("pageTui.openDocs", openDocs),
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (vscode.workspace.getConfiguration("pageTui").get("autoValidate", true)) {
        updateDiagnostics(event.document);
      }
      schedulePreviewUpdate(event.document);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDiagnostics(editor.document);
        updateStatus(editor.document, diagnostics.get(editor.document.uri) || []);
      }
    }),
    vscode.workspace.onDidOpenTextDocument((document) => updateDiagnostics(document))
  );

  for (const document of vscode.workspace.textDocuments) updateDiagnostics(document);
  if (vscode.window.activeTextEditor) {
    updateStatus(vscode.window.activeTextEditor.document, []);
  }
}

function deactivate() {
  clearTimeout(previewTimer);
  if (previewPanel) previewPanel.dispose();
}

module.exports = {
  activate,
  deactivate,
  provideCompletions,
  provideHover
};
