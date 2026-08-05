const vscode = require("vscode");
const crypto = require("node:crypto");
const path = require("node:path");
const YAML = require("yaml");
const { validatePageTui } = require("./validation");
const { createPreviewHtml, createPreviewSession } = require("./preview");
const {
  createVisualEditorHtml,
  buildVisualModel,
  applyJsonOperation,
  applyVisualOperation
} = require("./visual-editor");
const { workflowToActions } = require("./workflow-model");
const STARTER_PAGE = require("./starter");

const VISUAL_EDITOR_VIEW_TYPE = "pageTui.visualEditor";

const COMPONENT_HELP = {
  text: ["text：显示一行文字。", "value、bind 或 template 三选一。"],
  input: ["input：显示单行输入框。", "通常绑定 state.title；默认会自动接收普通字符和 backspace。"],
  column: ["column：从上到下排列 children。", "最常用的页面外层布局。"],
  row: ["row：从左到右排列 children。", "适合标题、状态和并列面板。"],
  panel: ["panel：给 child 加边框和标题。", "可以设置 flex: true 占用剩余空间。"],
  popup: ["popup：居中显示一个弹窗面板。", "可以写 child、children、message、title、width 和 height。"],
  progress: ["progress：显示一个数值进度条。", "bind 绑定当前值，max 设置最大值，可用于展示外部命令进度。"],
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
  call: ["call：调用 service 或外部 shell 命令。", "可把 stdout、日志行或 JSON 写入状态，并用 onLine/onExit 更新页面。"],
  refresh: ["refresh：执行启动器的 refresh 回调。", "适合重新读取文件、数据库或 API。"],
  notify: ["notify：设置 state.notice。", "也可以用 set 修改任意提示变量。"],
  if: ["if：根据 condition 执行 then 或 else。", "支持 notEmpty、equals、all、any 等条件。"]
};

const ROOT_HELP = {
  i18n: ["i18n：应用语言模块。", "用 locale 绑定语言变量，用 locales 映射外部 YAML/JSON 语言文件。"],
  data: ["data：应用共享数据。", "多个页面都需要的任务、用户和配置通常放在这里。"],
  state: ["state：当前页面自己的临时变量。", "例如 selected、title、loading 和 error。"],
  params: ["params：进入当前页面时收到的参数。", "由 push、go、replace 或 reset 传入。"],
  page: ["page：params 的别名。", "推荐新代码统一使用 params。"],
  item: ["item：list 当前项目。", "只在 list 的 label、description 和 style 中有意义。"],
  key: ["key：当前按键对象。", "key.value 可用于文本输入。"],
  index: ["index：list 当前项目的序号，从 0 开始。", "只在 list 项目表达式中可用。"]
};

const COMPONENTS = ["text", "input", "column", "row", "panel", "popup", "progress", "list", "divider", "spacer"];
const KEY_NAMES = ["up", "down", "left", "right", "enter", "escape", "space", "backspace", "character"];
const STYLES = ["title", "primary", "selected", "muted", "border", "success", "warning", "danger", "input"];
const PAGE_FIELDS = ["title", "state", "layout", "keys", "on"];
const PAGE_ROOT_FIELDS = ["name", "title", "state", "layout", "keys", "on"];
const ROOT_FIELDS = ["initial", "data", "i18n", "pages"];
const I18N_FIELDS = ["locale", "fallback", "locales"];
const LAYOUT_FIELDS = ["type", "children", "child", "value", "message", "bind", "template", "visible", "style", "placeholderStyle", "padding", "gap", "width", "height", "max", "label", "showValue", "filled", "empty", "flex", "mask"];
const KEY_TRIGGER_CHARACTERS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const COMPONENT_FIELDS = {
  text: ["value", "bind", "template", "style", "visible"],
  input: ["bind", "placeholder", "character", "mask", "placeholderStyle", "style", "visible"],
  column: ["children", "gap", "padding", "style", "visible"],
  row: ["children", "gap", "padding", "style", "visible"],
  panel: ["title", "child", "children", "style", "flex", "visible"],
  popup: ["title", "child", "children", "message", "width", "height", "padding", "style", "border", "borderStyle", "titleStyle", "visible"],
  progress: ["bind", "value", "max", "label", "showValue", "filled", "empty", "style", "visible"],
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
  call: ["service", "with", "sh", "command", "args", "cwd", "env", "stdio", "blocking", "wait", "result", "stdout", "stderr", "lines", "stderrLines", "json", "code", "check", "interpreter", "maxBuffer", "onLine", "onExit"],
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
  { label: "popup", detail: "弹窗组件节点", body: "type: popup\ntitle: \"${1:提示}\"\nwidth: ${2:40}\nheight: ${3:8}\nmessage: \"${4:内容}\"" },
  { label: "progress", detail: "进度条组件节点", body: "type: progress\nbind: ${1:state.progress}\nmax: ${2:100}\nlabel: \"${3:进度}\"" },
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
let previewLocales = {};
let previewLocaleUris = new Set();

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

function isStandalonePageDocument(document) {
  const fileName = document?.fileName || "";
  if (/\.page\.ya?ml$/i.test(fileName)) return true;
  if (/(^|[\\/])(?:ui[\\/])?pages[\\/][^\\/]+\.ya?ml$/i.test(fileName)) return true;
  if (/(^|[\\/])(?:app|page-tui)\.ya?ml$/i.test(fileName)) return false;
  const text = typeof document?.getText === "function" ? document.getText() : "";
  const hasPageRoot = /^\s*(?:name|title|state|layout|keys|on):/m.test(text);
  const hasManifestRoot = /^\s*(?:initial|data|pages):/m.test(text);
  return hasPageRoot && !hasManifestRoot;
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
  if (keys[0] === "i18n") {
    const current = keys.at(-1);
    if (current === "locale" || current === "language") return ["bind", "value"];
    if (["locales", "files", "sources"].includes(current)) return [];
    return I18N_FIELDS;
  }
  const type = [...stack].reverse().find((item) => item.key === "type")?.value;
  if (type && COMPONENT_FIELDS[type]) return COMPONENT_FIELDS[type];
  const action = isActionContext(document, lineNumber)
    ? [...stack].reverse().find((item) => ACTION_FIELDS[item.key])
    : undefined;
  if (action) return ACTION_FIELDS[action.key];
  if (keys.includes("layout")) return LAYOUT_FIELDS;
  if (keys.includes("pages") && stack.some((item) => item.indent > 0)) return PAGE_FIELDS;
  if (keys.includes("children")) return ["type"];
  if (keys.length === 0) {
    return isStandalonePageDocument(document) ? PAGE_ROOT_FIELDS : ROOT_FIELDS;
  }
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
  const fields = isStandalonePageDocument(document) ? PAGE_ROOT_FIELDS : ROOT_FIELDS;
  return fields.map((name) => completion(
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
  if (root === "data" && stack.length > 1) {
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
      call: "call:\n  sh: ${1:echo hello}\n  stdio: pipe\n  result: ${2:state.callResult}",
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
    return new vscode.Hover(markdown("**Page TUI 模板**\n\n使用 data.x、state.x、params.x 等路径读取变量。当前支持 t、if、count、length、upper、lower 和 default。"), range);
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
  if (!previewSession) {
    previewSession = createPreviewSession(previewDocument.getText(), previewPage, { locales: previewLocales });
  }
  const model = previewSession.model();
  if (model.pageName) previewPage = model.pageName;
  if (!previewReady) {
    previewPanel.webview.html = createPreviewHtml(model, previewNonce);
    return;
  }
  previewPanel.webview.postMessage(previewMessage(model));
}

function schedulePreviewUpdate(document) {
  if (!previewPanel || !previewDocument) return;
  const uri = document.uri.toString();
  if (uri !== previewDocument.uri.toString() && !previewLocaleUris.has(uri)) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    previewTimer = undefined;
    const currentPage = previewSession?.model().pageName || previewPage;
    const loaded = await loadExternalLocaleDocuments(previewDocument);
    previewLocales = loaded.locales;
    previewLocaleUris = loaded.uris;
    previewSession = createPreviewSession(previewDocument.getText(), currentPage, { locales: previewLocales });
    updatePreview();
  }, 120);
}

async function openPreview() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isPageTuiDocument(editor.document)) {
    vscode.window.showWarningMessage("请先打开 app.yaml 或 Page TUI YAML 页面。");
    return;
  }

  const sameDocument = previewDocument?.uri.toString() === editor.document.uri.toString();
  previewDocument = editor.document;
  if (!sameDocument) previewPage = undefined;
  const loaded = await loadExternalLocaleDocuments(editor.document);
  previewLocales = loaded.locales;
  previewLocaleUris = loaded.uris;
  previewSession = createPreviewSession(
    editor.document.getText(),
    sameDocument ? previewPage : undefined,
    { locales: previewLocales }
  );

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
    previewLocales = {};
    previewLocaleUris = new Set();
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

async function loadExternalLocaleDocuments(document) {
  const result = {
    locales: Object.create(null),
    documents: Object.create(null),
    uris: new Set()
  };
  if (document.uri.scheme !== "file") return result;

  let root;
  try {
    root = YAML.parse(document.getText()) || {};
  } catch {
    return result;
  }
  const definition = root.i18n;
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) return result;
  const sources = definition.locales || definition.files || definition.sources;
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) return result;

  for (const [locale, source] of Object.entries(sources)) {
    if (typeof source !== "string") continue;
    const uri = vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), source));
    result.uris.add(uri.toString());
    const info = {
      uri,
      fileName: uri.fsPath
    };
    result.documents[locale] = info;
    try {
      const localeDocument = await vscode.workspace.openTextDocument(uri);
      info.source = localeDocument.getText();
      const messages = YAML.parse(info.source);
      if (!messages || typeof messages !== "object" || Array.isArray(messages)) {
        info.error = "语言文件的根节点必须是对象。";
        continue;
      }
      info.value = messages;
      result.locales[locale] = messages;
    } catch (error) {
      info.error = error.message || String(error);
      // 语言文件缺失或尚未写完时保留翻译键，下一次编辑会重新加载。
    }
  }
  return result;
}

async function loadExternalPageDocuments(document) {
  const pages = {};
  if (document.uri.scheme !== "file") return pages;

  let root;
  try {
    root = YAML.parse(document.getText()) || {};
  } catch {
    return pages;
  }
  if (!root.pages || typeof root.pages !== "object" || Array.isArray(root.pages)) return pages;

  for (const [name, source] of Object.entries(root.pages)) {
    if (typeof source !== "string") continue;
    const uri = vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), source));
    try {
      const pageDocument = await vscode.workspace.openTextDocument(uri);
      pages[name] = {
        uri,
        source: pageDocument.getText(),
        fileName: pageDocument.fileName
      };
    } catch {
      // 缺失的外部页面由当前文档的诊断显示，编辑器仍然可以继续编辑 manifest。
    }
  }
  return pages;
}

function createVisualEditorProvider(extensionUri) {
  return {
    async resolveCustomTextEditor(document, webviewPanel) {
      const mediaRoot = vscode.Uri.joinPath(extensionUri, "media");
      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [mediaRoot]
      };
      let selectedPage;
      let selectedPath = [];
      let externalPages = await loadExternalPageDocuments(document);
      let externalLocales = (await loadExternalLocaleDocuments(document)).documents;
      let selectedLocale;
      let selectedTranslationPath;
      let operationQueue = Promise.resolve();

      const model = () => buildVisualModel(
        document.getText(),
        selectedPage,
        selectedPath,
        {
          externalPages,
          externalLocales,
          selectedLocale,
          selectedTranslationPath
        }
      );

      const sendModel = () => {
        webviewPanel.webview.postMessage({
          type: "model",
          model: model()
        });
      };

      webviewPanel.webview.html = createVisualEditorHtml(model(), {
        cspSource: webviewPanel.webview.cspSource,
        workflowScriptUri: webviewPanel.webview.asWebviewUri(
          vscode.Uri.joinPath(mediaRoot, "workflow-editor.js")
        ),
        workflowStyleUri: webviewPanel.webview.asWebviewUri(
          vscode.Uri.joinPath(mediaRoot, "workflow-editor.css")
        )
      });

      const reloadExternalResources = async () => {
        const [pages, locales] = await Promise.all([
          loadExternalPageDocuments(document),
          loadExternalLocaleDocuments(document)
        ]);
        externalPages = pages;
        externalLocales = locales.documents;
      };

      const replaceDocumentText = async (target, nextText) => {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          target.uri,
          new vscode.Range(target.positionAt(0), target.positionAt(target.getText().length)),
          nextText
        );
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) throw new Error("VS Code 没有接受这次 YAML 修改。");
      };

      const manifestRoot = () => {
        const root = YAML.parse(document.getText()) || {};
        if (!root || typeof root !== "object" || Array.isArray(root)) {
          throw new Error("manifest 根节点必须是对象。");
        }
        return root;
      };

      const addLocale = async (message) => {
        if (document.uri.scheme !== "file") throw new Error("只能为本地 manifest 创建语言文件。");
        const locale = String(message.locale || "").trim();
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(locale)) {
          throw new Error("语言代码只能包含字母、数字、连字符和下划线。");
        }
        if (["__proto__", "constructor", "prototype"].includes(locale)) {
          throw new Error("这个语言代码会与对象字段冲突，请换一个名称。");
        }
        const root = manifestRoot();
        if (root.i18n !== undefined
          && (!root.i18n || typeof root.i18n !== "object" || Array.isArray(root.i18n))) {
          throw new Error("i18n 必须是对象，才能添加语言文件。");
        }
        const currentModel = model();
        if (currentModel.mode !== "manifest") throw new Error("请在 app.yaml 中创建语言文件。");
        if (currentModel.i18n?.locales?.some((entry) => entry.code === locale)) {
          selectedLocale = locale;
          selectedTranslationPath = undefined;
          sendModel();
          return;
        }
        const sourceField = currentModel.i18n?.sourceField || "locales";
        const sourceContainer = root.i18n?.[sourceField];
        if (sourceContainer !== undefined
          && (!sourceContainer || typeof sourceContainer !== "object" || Array.isArray(sourceContainer))) {
          throw new Error(`i18n.${sourceField} 必须是对象。`);
        }

        let relativeFile = String(message.file || "").trim().replace(/\\/g, "/")
          || `locales/${locale}.yaml`;
        if (!/\.(?:ya?ml|json)$/i.test(relativeFile)) relativeFile += ".yaml";
        if (path.isAbsolute(relativeFile) || relativeFile.includes("\0")) {
          throw new Error("语言文件路径必须是 manifest 目录内的相对路径。");
        }
        const manifestDirectory = path.dirname(document.uri.fsPath);
        const filePath = path.resolve(manifestDirectory, relativeFile);
        const containedPath = path.relative(manifestDirectory, filePath);
        if (!containedPath || containedPath === ".." || containedPath.startsWith(`..${path.sep}`) || path.isAbsolute(containedPath)) {
          throw new Error("语言文件路径不能离开 manifest 目录。");
        }

        const fileUri = vscode.Uri.file(filePath);
        let fileExists = true;
        try {
          await vscode.workspace.fs.stat(fileUri);
        } catch {
          fileExists = false;
        }
        if (!fileExists) {
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(filePath)));
          await vscode.workspace.fs.writeFile(fileUri, Buffer.from("{}\n", "utf8"));
        }

        let nextText = document.getText();
        if (root.i18n?.locale === undefined) {
          const localeSpec = root.data && Object.prototype.hasOwnProperty.call(root.data, "locale")
            ? { bind: "data.locale" }
            : locale;
          nextText = applyVisualOperation(nextText, {
            type: "set",
            path: ["i18n", "locale"],
            value: localeSpec
          });
        }
        if (root.i18n?.fallback === undefined && root.i18n?.default === undefined) {
          nextText = applyVisualOperation(nextText, {
            type: "set",
            path: ["i18n", "fallback"],
            value: locale
          });
        }
        nextText = applyVisualOperation(nextText, {
          type: "set",
          path: ["i18n", sourceField, locale],
          value: relativeFile
        });
        await replaceDocumentText(document, nextText);
        await reloadExternalResources();
        selectedLocale = locale;
        selectedTranslationPath = undefined;
        sendModel();
      };

      const deleteLocale = async (locale) => {
        const currentModel = model();
        const entry = currentModel.i18n?.locales?.find((item) => item.code === locale);
        if (!entry) return;
        const confirmed = await vscode.window.showWarningMessage(
          `确定移除语言“${locale}”吗？外部语言文件不会被删除。`,
          { modal: true },
          "移除语言"
        );
        if (confirmed !== "移除语言") return;

        const root = manifestRoot();
        const definition = root.i18n || {};
        const sourceField = currentModel.i18n.sourceField || "locales";
        const remainingLocale = currentModel.i18n.locales
          .map((item) => item.code)
          .find((code) => code !== locale);
        let nextText = applyVisualOperation(document.getText(), {
          type: "delete",
          path: ["i18n", sourceField, locale]
        });
        if (definition.fallback === locale) {
          nextText = applyVisualOperation(nextText, remainingLocale
            ? { type: "set", path: ["i18n", "fallback"], value: remainingLocale }
            : { type: "delete", path: ["i18n", "fallback"] });
        }
        if (definition.default === locale) {
          nextText = applyVisualOperation(nextText, remainingLocale
            ? { type: "set", path: ["i18n", "default"], value: remainingLocale }
            : { type: "delete", path: ["i18n", "default"] });
        }
        if (definition.locale === locale) {
          nextText = applyVisualOperation(nextText, remainingLocale
            ? { type: "set", path: ["i18n", "locale"], value: remainingLocale }
            : { type: "delete", path: ["i18n", "locale"] });
        } else if (definition.locale?.value === locale) {
          nextText = applyVisualOperation(nextText, remainingLocale
            ? { type: "set", path: ["i18n", "locale", "value"], value: remainingLocale }
            : { type: "delete", path: ["i18n", "locale"] });
        }
        await replaceDocumentText(document, nextText);
        await reloadExternalResources();
        selectedLocale = undefined;
        selectedTranslationPath = undefined;
        sendModel();
      };

      const runOperation = async (message) => {
        const operationPage = selectedPage;
        const currentModel = model();
        const locale = typeof message.locale === "string" ? message.locale : selectedLocale;
        const localeEntry = currentModel.i18n?.locales?.find((entry) => entry.code === locale);
        let operation = message.operation;
        let targetInfo;
        if (message.target === "locale") {
          if (!localeEntry) throw new Error("找不到要编辑的语言。");
          if (localeEntry.external) {
            targetInfo = externalLocales[locale];
            if (!targetInfo?.uri) throw new Error(`找不到语言文件：${localeEntry.source}`);
          } else {
            operation = {
              ...operation,
              path: ["i18n", currentModel.i18n.sourceField, locale].concat(operation?.path || [])
            };
          }
        } else if (message.target !== "manifest") {
          targetInfo = externalPages[operationPage];
        }
        const target = targetInfo
          ? await vscode.workspace.openTextDocument(targetInfo.uri)
          : document;
        const source = target.getText();
        const jsonLocale = message.target === "locale"
          && targetInfo
          && path.extname(target.fileName).toLowerCase() === ".json";
        const nextText = jsonLocale
          ? applyJsonOperation(source, operation)
          : applyVisualOperation(source, operation);
        if (nextText === source) return;
        await replaceDocumentText(target, nextText);
        if (targetInfo) targetInfo.source = nextText;
        if (operation?.type === "deletePage" && operation.page === selectedPage) {
          selectedPage = undefined;
          selectedPath = [];
        }
        sendModel();
      };

      const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
        const uri = event.document.uri.toString();
        if (uri === document.uri.toString()) {
          void reloadExternalResources().then(sendModel);
          return;
        }
        if (Object.values(externalPages).some((info) => info.uri.toString() === uri)) {
          const info = Object.values(externalPages).find((item) => item.uri.toString() === uri);
          if (info) info.source = event.document.getText();
          sendModel();
          return;
        }
        if (Object.values(externalLocales).some((info) => info.uri.toString() === uri)) {
          const info = Object.values(externalLocales).find((item) => item.uri.toString() === uri);
          if (info) {
            info.source = event.document.getText();
            info.error = undefined;
          }
          sendModel();
        }
      });
      const enqueueTask = (task) => {
        operationQueue = operationQueue
          .then(task)
          .catch((error) => {
            webviewPanel.webview.postMessage({
              type: "error",
              message: error.message || String(error)
            });
          });
        return operationQueue;
      };
      const enqueueOperation = (message) => enqueueTask(() => runOperation(message));
      const messageSubscription = webviewPanel.webview.onDidReceiveMessage(async (message) => {
        if (!message || typeof message.type !== "string") return;
        if (message.type === "ready") {
          sendModel();
          return;
        }
        if (message.type === "selectPage") {
          selectedPage = typeof message.page === "string" ? message.page : undefined;
          selectedPath = [];
          selectedLocale = undefined;
          selectedTranslationPath = undefined;
          sendModel();
          return;
        }
        if (message.type === "selectNode") {
          selectedPath = Array.isArray(message.path) ? message.path : [];
          selectedLocale = undefined;
          selectedTranslationPath = undefined;
          sendModel();
          return;
        }
        if (message.type === "selectLocale") {
          selectedLocale = typeof message.locale === "string" ? message.locale : undefined;
          selectedTranslationPath = undefined;
          sendModel();
          return;
        }
        if (message.type === "selectTranslation") {
          selectedLocale = typeof message.locale === "string" ? message.locale : undefined;
          selectedTranslationPath = Array.isArray(message.path) ? message.path : undefined;
          sendModel();
          return;
        }
        if (message.type === "addLocale") {
          await enqueueTask(() => addLocale(message));
          return;
        }
        if (message.type === "deleteLocale") {
          const locale = typeof message.locale === "string" ? message.locale : "";
          if (locale) await enqueueTask(() => deleteLocale(locale));
          return;
        }
        if (message.type === "addTranslation") {
          const locale = typeof message.locale === "string" ? message.locale : "";
          const translationPath = Array.isArray(message.path) ? message.path : [];
          if (!locale || !translationPath.length) return;
          selectedLocale = locale;
          selectedTranslationPath = undefined;
          const existing = model().i18n?.translations?.some((entry) => (
            JSON.stringify(entry.path) === JSON.stringify(translationPath)
          ));
          selectedTranslationPath = translationPath;
          if (existing) {
            sendModel();
            return;
          }
          await enqueueOperation({
            target: "locale",
            locale,
            operation: { type: "set", path: translationPath, value: message.value ?? "" }
          });
          return;
        }
        if (message.type === "deleteTranslation") {
          const locale = typeof message.locale === "string" ? message.locale : "";
          const translationPath = Array.isArray(message.path) ? message.path : [];
          if (!locale || !translationPath.length) return;
          selectedLocale = locale;
          selectedTranslationPath = undefined;
          await enqueueOperation({
            target: "locale",
            locale,
            operation: { type: "delete", path: translationPath }
          });
          return;
        }
        if (message.type === "deletePage") {
          const page = typeof message.page === "string" ? message.page : "";
          if (!page) return;
          const confirmed = await vscode.window.showWarningMessage(
            `确定删除页面“${page}”吗？外部页面文件不会被删除。`,
            { modal: true },
            "删除页面"
          );
          if (confirmed !== "删除页面") return;
          await enqueueOperation({
            type: "operation",
            target: "manifest",
            operation: { type: "deletePage", page }
          });
          return;
        }
        if (message.type === "operation") {
          await enqueueOperation(message);
          return;
        }
        if (message.type === "workflowUpdate") {
          try {
            const event = message.workflow?.event;
            const entry = model().workflows?.find((item) => item.source === event?.source
              && item.event === event?.event
              && JSON.stringify(item.path) === JSON.stringify(event?.path));
            if (!entry) throw new Error("当前页面中找不到这个事务事件。");
            const actions = workflowToActions(message.workflow);
            const value = entry.isList === false && actions.length === 1 ? actions[0] : actions;
            await enqueueOperation({
              type: "operation",
              operation: { type: "set", path: entry.path, value }
            });
          } catch (error) {
            webviewPanel.webview.postMessage({
              type: "error",
              message: error.message || String(error)
            });
          }
          return;
        }
        if (message.type === "source") {
          const info = externalPages[selectedPage];
          const sourceDocument = info
            ? await vscode.workspace.openTextDocument(info.uri)
            : document;
          await vscode.window.showTextDocument(sourceDocument, { preview: false });
          return;
        }
        if (message.type === "sourceLocale") {
          const locale = typeof message.locale === "string" ? message.locale : selectedLocale;
          const info = externalLocales[locale];
          const sourceDocument = info?.uri
            ? await vscode.workspace.openTextDocument(info.uri)
            : document;
          await vscode.window.showTextDocument(sourceDocument, { preview: false });
          return;
        }
        if (message.type === "preview") {
          await vscode.window.showTextDocument(document, { preview: true });
          openPreview();
        }
      });

      webviewPanel.onDidDispose(() => {
        changeSubscription.dispose();
        messageSubscription.dispose();
      });
    }
  };
}

async function openVisualEditor(resource) {
  const activeDocument = vscode.window.activeTextEditor?.document;
  let document = activeDocument;
  if (resource && typeof resource.scheme === "string"
    && (!document || document.uri.toString() !== resource.toString())) {
    try {
      document = await vscode.workspace.openTextDocument(resource);
    } catch (error) {
      vscode.window.showErrorMessage(`无法打开 Page TUI 文件：${error.message || String(error)}`);
      return;
    }
  }
  if (!document || !isPageTuiDocument(document)) {
    vscode.window.showWarningMessage("请先打开 app.yaml 或 Page TUI YAML 页面。");
    return;
  }
  try {
    await vscode.commands.executeCommand(
      "vscode.openWith",
      document.uri,
      VISUAL_EDITOR_VIEW_TYPE
    );
  } catch (error) {
    vscode.window.showErrorMessage(`无法打开 Page TUI 可视化编辑器：${error.message || String(error)}`);
  }
}

function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection("page-tui");
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  context.subscriptions.push(diagnostics, statusBar);

  const selector = DOCUMENT_SELECTOR;
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      VISUAL_EDITOR_VIEW_TYPE,
      createVisualEditorProvider(context.extensionUri),
      {
        webviewOptions: { retainContextWhenHidden: false },
        supportsMultipleEditorsPerDocument: false
      }
    ),
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
    vscode.commands.registerCommand("pageTui.openVisualEditor", openVisualEditor),
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
