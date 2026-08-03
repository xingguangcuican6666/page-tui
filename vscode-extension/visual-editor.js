const crypto = require("node:crypto");
const YAML = require("yaml");

const COMPONENTS = ["text", "input", "column", "row", "panel", "list", "divider", "spacer"];
const ACTIONS = ["set", "move", "toggle", "remove", "append", "backspace", "push", "go", "replace", "reset", "pop", "quit", "call", "refresh", "notify", "if"];
const EVENTS = ["up", "down", "left", "right", "enter", "escape", "space", "backspace", "character"];
const LIFECYCLE_EVENTS = ["enter", "resume"];
const STYLE_PRESETS = ["title", "primary", "selected", "muted", "border", "success", "warning", "danger", "input"];
const CONDITION_TYPES = [
  { key: "direct", label: "直接判断变量" },
  { key: "notEmpty", label: "非空" },
  { key: "empty", label: "为空" },
  { key: "truthy", label: "真值" },
  { key: "equals", label: "等于" },
  { key: "notEquals", label: "不等于" },
  { key: "all", label: "全部满足" },
  { key: "any", label: "任一满足" },
  { key: "not", label: "取反" },
  { key: "custom", label: "高级 JSON" }
];
const ACTION_FIELDS = {
  set: ["path", "value"],
  move: ["path", "by", "list"],
  toggle: ["path", "list", "index", "field"],
  remove: ["list", "index"],
  append: ["path", "list", "value"],
  backspace: ["path"],
  push: ["page", "params"],
  go: ["page", "params"],
  replace: ["page", "params"],
  reset: ["page", "params"],
  pop: ["result"],
  quit: ["code"],
  call: ["service", "with"],
  refresh: [],
  notify: ["value"],
  if: ["condition", "then", "else"]
};
const ACTION_NUMBER_FIELDS = new Set(["by", "code"]);
const ACTION_JSON_FIELDS = new Set(["params", "with", "condition", "then", "else"]);
const ACTION_VALUE_FIELDS = new Set(["value", "result", "index"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getAt(root, path) {
  let value = root;
  for (const part of path || []) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }
  return value;
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function describeAction(action) {
  if (typeof action === "string") return action;
  if (!isObject(action)) return "未命名动作";
  if (typeof action.do === "string") return action.do;
  return Object.keys(action).find((key) => ACTIONS.includes(key)) || "未命名动作";
}

function layoutLabel(node, type) {
  if (!isObject(node)) return type;
  return safeString(node.title || node.value || node.template || node.bind, type);
}

function layoutPreviewValue(value) {
  if (value === undefined || value === null) return undefined;
  if (isObject(value) || Array.isArray(value)) return safeString(value);
  return value;
}

function layoutPreview(node, type, childCount) {
  const preview = { type, children: childCount };
  if (!isObject(node)) {
    preview.text = layoutPreviewValue(node) || "空布局";
    return preview;
  }

  for (const key of [
    "value", "template", "bind", "title", "placeholder", "style", "itemStyle",
    "selectedStyle", "gap", "padding", "flex", "items", "selected", "label",
    "description", "character", "border", "borderStyle", "titleStyle", "height",
    "lines", "visible"
  ]) {
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      preview[key] = layoutPreviewValue(node[key]);
    }
  }
  return preview;
}

function buildLayoutTree(node, path) {
  if (node === undefined || node === null) return undefined;
  if (Array.isArray(node)) {
    return {
      path,
      type: "group",
      label: "布局列表",
      children: node.map((child, index) => buildLayoutTree(child, path.concat(index))),
      preview: layoutPreview(node, "group", node.length)
    };
  }
  if (!isObject(node)) {
    return {
      path,
      type: "text",
      label: safeString(node, "空布局"),
      children: [],
      preview: layoutPreview(node, "text", 0)
    };
  }

  const type = typeof node.type === "string" ? node.type : (node.children ? "column" : "text");
  const children = [];
  if (Array.isArray(node.children)) {
    node.children.forEach((child, index) => {
      children.push(buildLayoutTree(child, path.concat(["children", index])));
    });
  }
  if (isObject(node.child)) {
    children.push(buildLayoutTree(node.child, path.concat("child")));
  }
  return {
    path,
    type,
    label: layoutLabel(node, type),
    children,
    preview: layoutPreview(node, type, children.length)
  };
}

function pagePath(manifest, name) {
  return manifest ? ["pages", name] : [];
}

function parsePageSource(source) {
  if (typeof source !== "string") return undefined;
  try {
    const document = YAML.parseDocument(source, { prettyErrors: false });
    if (document.errors?.length) return undefined;
    const value = document.toJS({ mapAsMap: false });
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function pageEntries(root, manifest, externalPages = {}) {
  if (!manifest) {
    return [{
      name: root.name || "当前页面",
      path: [],
      page: root,
      external: false
    }];
  }
  return Object.entries(root.pages || {}).map(([name, page]) => {
    const external = typeof page === "string";
    const externalInfo = external ? externalPages[name] : undefined;
    const externalSource = typeof externalInfo === "string"
      ? externalInfo
      : externalInfo?.source;
    return {
      name,
      path: pagePath(true, name),
      page: external ? (parsePageSource(externalSource) || page) : page,
      external,
      uri: typeof externalInfo?.uri === "string" ? externalInfo.uri : externalInfo?.uri?.toString(),
      fileName: externalInfo?.fileName
    };
  });
}

function actionModel(page, basePath) {
  const events = [];
  for (const source of ["keys", "on"]) {
    const container = isObject(page?.[source]) ? page[source] : {};
    for (const [event, actions] of Object.entries(container)) {
      const eventPath = basePath.concat([source, event]);
      const isList = Array.isArray(actions);
      const list = isList ? actions : [actions];
      events.push({
        source,
        event,
        path: eventPath,
        actions: list.map((action, index) => ({
          label: describeAction(action),
          path: isList ? eventPath.concat(index) : eventPath,
          value: action,
          name: describeAction(action)
        }))
      });
    }
  }
  return { events };
}

function actionDetails(action) {
  if (typeof action === "string") return { name: action, config: {} };
  if (!isObject(action)) return { name: "", config: {} };
  if (typeof action.do === "string") {
    const config = { ...action };
    delete config.do;
    return { name: action.do, config };
  }
  const name = Object.keys(action).find((key) => ACTIONS.includes(key)) || "";
  if (name === "call" && Object.prototype.hasOwnProperty.call(action, "with")) {
    return { name, config: { service: action.call, with: action.with } };
  }
  const raw = name ? action[name] : {};
  if (isObject(raw)) return { name, config: { ...raw } };
  if (raw === undefined || raw === null) return { name, config: {} };
  const scalarField = name === "backspace" ? "path" : name === "call" ? "service" : name === "quit" ? "code" : "value";
  return { name, config: { [scalarField]: raw } };
}

function actionDefaults(name) {
  const defaults = {
    set: { path: "state.notice", value: "" },
    move: { path: "state.selected", by: 1, list: "data.items" },
    toggle: { path: "state.enabled" },
    remove: { list: "data.items", index: 0 },
    append: { path: "state.title", value: "" },
    backspace: { path: "state.title" },
    push: { page: "", params: {} },
    go: { page: "", params: {} },
    replace: { page: "", params: {} },
    reset: { page: "", params: {} },
    pop: {},
    quit: { code: 0 },
    call: { service: "", with: {} },
    refresh: {},
    notify: "",
    if: { condition: { notEmpty: "state.value" }, then: [], else: [] }
  };
  return defaults[name] ? JSON.parse(JSON.stringify(defaults[name])) : {};
}

function variableEntries(value, basePath) {
  if (!isObject(value)) return [];
  return Object.entries(value).map(([key, item]) => ({
    key,
    path: basePath.concat(key),
    type: Array.isArray(item) ? "array" : typeof item,
    preview: safeString(item, "空")
  }));
}

function collectVariablePaths(value, basePath, output, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return;
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const path = basePath.concat(key);
      output.add(path.join("."));
      collectVariablePaths(child, path, output, depth + 1);
    }
  }
}

function variablePaths(root, page) {
  const paths = new Set(["data", "state", "params", "page", "item", "key", "index"]);
  collectVariablePaths(root.data, ["data"], paths);
  collectVariablePaths(page?.state, ["state"], paths);
  return Array.from(paths);
}

function samePath(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every((part, index) => part === right[index]);
}

function componentInsertPath(root, layoutPath, selectedPath) {
  const selected = getAt(root, selectedPath);
  if (Array.isArray(selected)) return selectedPath;
  if (isObject(selected) && (Array.isArray(selected.children)
    || selected.type === "column"
    || selected.type === "row")) {
    return selectedPath.concat("children");
  }
  const layout = getAt(root, layoutPath);
  if (Array.isArray(layout)) return layoutPath;
  if (isObject(layout) && (Array.isArray(layout.children)
    || layout.type === "column"
    || layout.type === "row")) {
    return layoutPath.concat("children");
  }
  return null;
}

function buildVisualModel(source, requestedPage, requestedPath = [], options = {}) {
  const text = String(source || "");
  let document;
  try {
    document = YAML.parseDocument(text, { prettyErrors: false });
  } catch (error) {
    return { ok: false, error: error.message || String(error), pages: [] };
  }
  if (document.errors?.length) {
    return {
      ok: false,
      error: document.errors[0].message || String(document.errors[0]),
      pages: []
    };
  }

  let root;
  try {
    root = document.toJS({ mapAsMap: false });
  } catch (error) {
    return { ok: false, error: error.message || String(error), pages: [] };
  }
  if (!isObject(root)) {
    return { ok: false, error: "Page TUI 文件的根节点必须是对象。", pages: [] };
  }

  const manifest = isObject(root.pages);
  const entries = pageEntries(root, manifest, options.externalPages || {});
  const selected = entries.find((item) => item.name === requestedPage) || entries[0];
  if (!selected) {
    return {
      ok: true,
      mode: manifest ? "manifest" : "page",
      pages: [],
      data: [],
      actions: { events: [] },
      selectedPage: undefined,
      selectedPath: [],
      selectedNode: undefined,
      layoutTree: undefined
    };
  }

  const page = isObject(selected.page) ? selected.page : {};
  const selectedRoot = selected.external ? page : root;
  const basePath = selected.external ? [] : selected.path;
  const layoutPath = basePath.concat("layout");
  const layout = getAt(selectedRoot, layoutPath);
  const actions = actionModel(page, basePath);
  const requestedNodeRoot = requestedPath[0] === "data" || requestedPath[0] === "pages"
    ? root
    : selectedRoot;
  const requestedNode = Array.isArray(requestedPath) ? getAt(requestedNodeRoot, requestedPath) : undefined;
  const selectedAction = actions.events
    .flatMap((event) => event.actions)
    .find((action) => samePath(action.path, requestedPath));
  const statePath = basePath.concat("state");
  const isDataSelection = requestedPath.length > 1 && requestedPath[0] === "data";
  const isStateSelection = requestedPath.length > statePath.length
    && statePath.every((part, index) => requestedPath[index] === part);
  const selectedKind = selectedAction
    ? "action"
    : isDataSelection
      ? "data"
      : isStateSelection
        ? "state"
        : (isObject(requestedNode) || Array.isArray(requestedNode))
          && requestedPath.length >= basePath.length
          && basePath.every((part, index) => requestedPath[index] === part)
          ? "layout"
          : "layout";
  const selectedPath = selectedKind === "action" || selectedKind === "data" || selectedKind === "state"
    ? requestedPath
    : requestedPath.length > 0
      && (isObject(requestedNode) || Array.isArray(requestedNode))
      && requestedPath.length >= basePath.length
      ? requestedPath
      : layoutPath;
  const selectedNode = getAt(
    selectedPath[0] === "data" || selectedPath[0] === "pages" ? root : selectedRoot,
    selectedPath
  );
  const data = variableEntries(root.data, ["data"]);
  const state = variableEntries(page.state, statePath);

  return {
    ok: true,
    mode: manifest ? "manifest" : "page",
    initial: root.initial,
    pages: entries.map((item) => ({
      name: item.name,
      path: item.path,
      external: item.external,
      title: isObject(item.page) ? item.page.title : undefined,
      fileName: item.fileName
    })),
    selectedPage: selected.name,
    selectedPagePath: basePath,
    selectedPageExternal: selected.external,
    selectedPageUri: selected.uri,
    selectedPath,
    selectedKind,
    selectedNode,
    selectedAction: selectedAction
      ? { path: selectedAction.path, ...actionDetails(selectedAction.value) }
      : undefined,
    layoutPath,
    layoutTree: buildLayoutTree(layout, layoutPath),
    componentInsertPath: componentInsertPath(selectedRoot, layoutPath, selectedPath),
    data,
    state,
    variablePaths: variablePaths(root, page),
    actions,
    componentTypes: COMPONENTS,
    stylePresets: STYLE_PRESETS,
    conditionTypes: CONDITION_TYPES,
    actionTypes: ACTIONS,
    eventTypes: EVENTS,
    lifecycleEventTypes: LIFECYCLE_EVENTS,
    actionFields: ACTION_FIELDS,
    actionNumberFields: Array.from(ACTION_NUMBER_FIELDS),
    actionJsonFields: Array.from(ACTION_JSON_FIELDS),
    actionValueFields: Array.from(ACTION_VALUE_FIELDS),
    actionPathFields: ["path", "list", "within", "index"],
    actionRouteFields: ["page", "route"]
  };
}

function nodeToValue(node) {
  if (node && typeof node.toJSON === "function") return node.toJSON();
  return node;
}

function pathStartsWith(path, prefix) {
  return Array.isArray(path)
    && Array.isArray(prefix)
    && prefix.length < path.length
    && prefix.every((part, index) => part === path[index]);
}

function canAppendIntoLayoutNode(node) {
  if (YAML.isSeq(node)) return true;
  if (!YAML.isMap(node)) return false;
  const type = nodeToValue(node.get("type"));
  return type === "panel"
    || type === "column"
    || type === "row"
    || YAML.isSeq(node.get("children"));
}

function appendIntoLayoutNode(node, item) {
  if (YAML.isSeq(node)) {
    node.add(item);
    return true;
  }
  if (!YAML.isMap(node)) return false;

  const type = nodeToValue(node.get("type"));
  if (type === "panel") {
    const child = node.get("child");
    if (child !== undefined) {
      if (YAML.isMap(child)) {
        const childType = nodeToValue(child.get("type"));
        const childChildren = child.get("children");
        if ((childType === "column" || childType === "row") && YAML.isSeq(childChildren)) {
          childChildren.add(item);
          return true;
        }
      }
      node.set("child", { type: "column", children: [child, item] });
      return true;
    }

    const children = node.get("children");
    if (YAML.isSeq(children)) {
      children.add(item);
      return true;
    }
    node.set("child", item);
    return true;
  }

  const children = node.get("children");
  if (YAML.isSeq(children)) {
    children.add(item);
    return true;
  }
  if (type === "column" || type === "row") {
    node.set("children", [item]);
    return true;
  }
  return false;
}

function applyVisualOperation(source, operation) {
  const document = YAML.parseDocument(String(source || ""), { prettyErrors: false });
  if (document.errors?.length) throw new Error(document.errors[0].message || "YAML 语法错误");
  const path = Array.isArray(operation?.path) ? operation.path : [];

  switch (operation?.type) {
    case "set":
      if (!path.length) throw new Error("不能替换整个文档根节点。");
      document.setIn(path, operation.value);
      break;
    case "delete":
      if (path.length) document.deleteIn(path);
      break;
    case "deletePage": {
      const pageName = operation.page;
      if (typeof pageName !== "string" || !pageName) throw new Error("页面名称不能为空。");
      const pages = document.getIn(["pages"]);
      if (!YAML.isMap(pages)) throw new Error("当前文件不是页面清单。");
      const exists = pages.items.some((item) => nodeToValue(item.key) === pageName);
      if (!exists) break;

      document.deleteIn(["pages", pageName]);
      if (document.get("initial") === pageName) {
        const remaining = document.getIn(["pages"]);
        const nextPage = YAML.isMap(remaining)
          ? remaining.items
            .map((item) => nodeToValue(item.key))
            .find((name) => typeof name === "string" && name.length > 0)
          : undefined;
        if (nextPage) document.set("initial", nextPage);
        else document.delete("initial");
      }
      break;
    }
    case "append": {
      const current = document.getIn(path);
      if (YAML.isSeq(current)) {
        current.add(operation.value);
      } else if (current !== undefined && current !== null) {
        document.setIn(path, [nodeToValue(current), operation.value]);
      } else {
        document.setIn(path, [operation.value]);
      }
      break;
    }
    case "move": {
      const parentPath = path.slice(0, -1);
      const index = Number(path[path.length - 1]);
      const sequence = document.getIn(parentPath);
      if (!YAML.isSeq(sequence) || !Number.isInteger(index)) break;
      let target;
      let insertIndex;
      if (Array.isArray(operation.targetPath)) {
        const targetParentPath = operation.targetPath.slice(0, -1);
        if (JSON.stringify(parentPath) !== JSON.stringify(targetParentPath)) break;
        target = Number(operation.targetPath[operation.targetPath.length - 1]);
        insertIndex = target > index ? target - 1 : target;
      } else {
        target = operation.direction === "up" ? index - 1 : index + 1;
        insertIndex = target;
      }
      if (!Number.isInteger(target) || target < 0 || target >= sequence.items.length || target === index) break;
      const item = sequence.items.splice(index, 1)[0];
      sequence.items.splice(insertIndex, 0, item);
      break;
    }
    case "moveInto": {
      const targetPath = Array.isArray(operation.targetPath) ? operation.targetPath : [];
      const parentPath = path.slice(0, -1);
      const index = Number(path[path.length - 1]);
      const sequence = document.getIn(parentPath);
      const targetNode = document.getIn(targetPath);
      if (!YAML.isSeq(sequence)
        || !Number.isInteger(index)
        || index < 0
        || index >= sequence.items.length
        || !targetPath.length
        || samePath(path, targetPath)
        || pathStartsWith(targetPath, path)
        || !canAppendIntoLayoutNode(targetNode)) {
        break;
      }
      const item = sequence.items.splice(index, 1)[0];
      if (!appendIntoLayoutNode(targetNode, item)) {
        sequence.items.splice(index, 0, item);
      }
      break;
    }
    case "wrapLayout": {
      const existing = document.getIn(path);
      document.setIn(path, {
        type: "column",
        children: [nodeToValue(existing), operation.value]
      });
      break;
    }
    default:
      throw new Error("不认识的可视化编辑操作。");
  }

  return document.toString();
}

function htmlJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function createVisualEditorHtml(model) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const initial = htmlJson(model);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
:root { color-scheme: light dark; --border: var(--vscode-panel-border); --muted: var(--vscode-descriptionForeground); --card: var(--vscode-editorWidget-background); --accent: var(--vscode-textLink-foreground); }
* { box-sizing: border-box; }
body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px var(--vscode-font-family); }
button, input, select, textarea { color: inherit; font: inherit; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--border)); border-radius: 3px; padding: 5px 7px; }
button { cursor: pointer; }
button:hover { background: var(--vscode-list-hoverBackground); }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); }
.toolbar h1 { font-size: 14px; margin: 0 auto 0 0; }
.toolbar .primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
.workspace { display: grid; grid-template-columns: 210px minmax(280px, 1fr) 310px; height: calc(100vh - 42px); min-height: 480px; }
aside, main { min-width: 0; overflow: auto; }
aside { border-right: 1px solid var(--border); padding: 10px; }
aside.inspector { border-right: 0; border-left: 1px solid var(--border); }
section { margin-bottom: 18px; }
h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin: 0 0 7px; }
.page-list, .data-list, .action-list { display: grid; gap: 4px; }
.page-row { display: flex; gap: 4px; min-width: 0; }
.page-row .page-button { flex: 1; min-width: 0; }
.variable-row { display: flex; gap: 4px; min-width: 0; }
.variable-row .variable-select { flex: 1; min-width: 0; }
.variable-delete { flex: 0 0 28px; padding-left: 4px; padding-right: 4px; opacity: .72; }
.variable-delete:hover { opacity: 1; color: var(--vscode-errorForeground); border-color: var(--vscode-errorForeground); }
.page-button { text-align: left; width: 100%; }
.page-delete { flex: 0 0 28px; padding-left: 4px; padding-right: 4px; opacity: .72; }
.page-delete:hover { opacity: 1; color: var(--vscode-errorForeground); border-color: var(--vscode-errorForeground); }
.page-button.active, .node-button.active { outline: 1px solid var(--accent); background: var(--vscode-list-activeSelectionBackground); }
.canvas { padding: 14px; }
.canvas-header { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.canvas-header strong { margin-right:auto; }
.tree { border: 1px solid var(--border); border-radius: 5px; padding: 10px; background: var(--card); min-height: 180px; }
.node { margin: 4px 0; }
.node-button { display: flex; align-items: center; gap: 7px; width: 100%; text-align: left; border: 0; background: transparent; }
.node-button[draggable="true"] { cursor: grab; }
.node-button.dragging { opacity: .45; }
.node.drop-target { outline: 1px dashed var(--accent); }
.node-button .type { color: var(--accent); font-weight: 600; }
.node-button .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-children { margin-left: 18px; border-left: 1px dashed var(--border); padding-left: 7px; }
.hover-preview { position: fixed; z-index: 1000; display: none; width: min(320px, calc(100vw - 24px)); max-height: min(300px, calc(100vh - 24px)); overflow: auto; padding: 8px 10px; border: 1px solid #454545; border-radius: 4px; background: #252526; color: #d4d4d4; box-shadow: 0 4px 12px rgba(0, 0, 0, .42); pointer-events: auto; contain: layout paint; }
.hover-preview[data-visible="true"] { display: block; }
.preview-head { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
.preview-type { color: var(--accent); font-weight: 700; }
.preview-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.preview-surface { min-height: 44px; margin-top: 8px; padding: 8px; border: 1px solid var(--border); background: var(--vscode-editor-background); }
.preview-text { padding: 6px 8px; border-left: 3px solid var(--accent); }
.preview-tone-title { font-weight: 700; }
.preview-tone-primary { color: var(--vscode-textLink-foreground); }
.preview-tone-muted { color: var(--muted); }
.preview-tone-success { color: var(--vscode-testing-iconPassed); }
.preview-tone-warning { color: var(--vscode-editorWarning-foreground); }
.preview-tone-danger { color: var(--vscode-errorForeground); }
.preview-input { padding: 6px 8px; border: 1px solid var(--vscode-focusBorder, var(--accent)); background: var(--vscode-input-background); color: var(--muted); }
.preview-layout { display: flex; gap: 6px; min-height: 30px; }
.preview-layout.column { flex-direction: column; }
.preview-layout.row { flex-direction: row; }
.preview-block { flex: 1; min-height: 24px; border: 1px solid var(--border); background: var(--card); }
.preview-panel { border: 1px solid var(--border); }
.preview-panel-title { padding: 4px 7px; color: var(--accent); border-bottom: 1px solid var(--border); font-weight: 600; }
.preview-panel-body { min-height: 25px; padding: 7px; }
.preview-list { display: grid; gap: 3px; }
.preview-list-row { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border: 1px solid transparent; }
.preview-list-row.selected { border-color: var(--accent); background: var(--vscode-list-activeSelectionBackground); }
.preview-marker { color: var(--accent); }
.preview-divider { height: 1px; margin: 12px 0; background: var(--border); }
.preview-spacer { min-height: 8px; border: 1px dashed var(--border); }
.preview-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; color: var(--muted); font-size: 11px; }
.preview-meta span { padding: 2px 4px; border: 1px solid var(--border); border-radius: 3px; }
.empty { color: var(--muted); padding: 18px 4px; }
.field { display:grid; grid-template-columns: 84px 1fr; gap:7px; align-items:center; margin:7px 0; }
.field-wide { display:block; }
.field-wide > label { display:block; margin-bottom:5px; }
.field label { color: var(--muted); }
.field input, .field select { width:100%; min-width:0; }
.field textarea { width:100%; min-width:0; min-height:72px; resize:vertical; }
.field-combo { display:flex; gap:5px; min-width:0; }
.field-combo > input, .field-combo > select { flex:1; min-width:0; }
.condition-editor { display:grid; gap:6px; padding:7px; border:1px solid var(--border); border-radius:4px; background: var(--vscode-editorWidget-background); }
.condition-toolbar { display:flex; gap:5px; min-width:0; }
.condition-toolbar select { flex:1; min-width:0; }
.condition-operand { display:grid; gap:4px; min-width:0; }
.condition-operand-label { color: var(--muted); font-size:12px; }
.condition-operand-control { display:flex; gap:5px; min-width:0; }
.condition-operand-control select { flex:0 0 92px; min-width:0; }
.condition-operand-control input { flex:1; min-width:0; }
.condition-list { display:grid; gap:5px; }
.condition-item { display:grid; grid-template-columns: minmax(0, 1fr) auto; gap:5px; align-items:start; }
.condition-item > button { padding-left:5px; padding-right:5px; }
.condition-actions { display:flex; gap:5px; }
.condition-editor .subtle { margin-top:0; }
.style-editor { display:grid; gap:6px; min-width:0; }
.style-editor > .field-combo { margin:0; }
.style-editor textarea { min-height:90px; }
.action-branch { display:grid; gap:6px; padding:7px; border:1px solid var(--border); border-radius:4px; background: var(--vscode-editorWidget-background); }
.action-branch + .action-branch { margin-top:7px; }
.action-branch-header { display:flex; align-items:center; gap:5px; }
.action-branch-header strong { margin-right:auto; }
.branch-action { display:grid; gap:5px; padding:6px; border:1px solid var(--border); border-radius:3px; }
.branch-action-toolbar { display:flex; gap:5px; }
.branch-action-toolbar select { flex:1; min-width:0; }
.branch-action textarea { min-height:60px; }
.field-actions { display:flex; gap:5px; margin-top:10px; }
.subtle { color: var(--muted); font-size: 12px; }
.danger { color: var(--vscode-errorForeground); }
.inline-form { display:flex; gap:5px; margin-top:7px; }
.inline-form input, .inline-form select { min-width:0; flex:1; }
.action-row { display:flex; align-items:center; gap:5px; border-bottom:1px solid var(--border); padding:5px 0; }
.action-row.selected { outline: 1px solid var(--accent); background: var(--vscode-list-activeSelectionBackground); }
.action-row button.action-select { flex:1; border:0; background:transparent; text-align:left; padding:0; }
.action-row .event { color:var(--accent); min-width:60px; }
.action-row .action { flex:1; }
.banner { padding:10px 12px; border-bottom:1px solid var(--border); color:var(--vscode-errorForeground); }
@media (max-width: 900px) {
  .workspace { grid-template-columns: minmax(0, 1fr); height: auto; min-height: 0; }
  aside, aside.inspector { border: 0; border-bottom: 1px solid var(--border); max-height: none; }
  aside.inspector { border-top: 1px solid var(--border); }
  .canvas { order: -1; }
  .toolbar { flex-wrap: wrap; }
}
</style>
</head>
<body>
<div class="toolbar">
  <h1>Page TUI 可视化编辑器</h1>
  <button data-command="source">源码</button>
  <button data-command="preview" class="primary">打开预览</button>
</div>
<div id="banner"></div>
<div id="hover-preview" class="hover-preview" role="tooltip" aria-hidden="true"></div>
<datalist id="variable-paths"></datalist>
<datalist id="page-routes"></datalist>
<datalist id="style-values">${(model.stylePresets || STYLE_PRESETS).map((name) => `<option value="${name}"></option>`).join("")}</datalist>
<div class="workspace">
  <aside>
    <section><h2>页面</h2><div id="pages" class="page-list"></div><div id="page-form"></div></section>
    <section><h2>共享数据</h2><div id="data" class="data-list"></div><div id="data-form"></div></section>
    <section><h2>当前页面变量</h2><div id="state" class="data-list"></div><div id="state-form"></div></section>
  </aside>
  <main class="canvas">
    <div class="canvas-header"><strong id="canvas-title">布局</strong><button data-command="new-layout">创建布局</button></div>
    <div id="tree" class="tree"></div>
    <div id="component-tools"></div>
    <section><h2>按键与动作</h2><div id="actions" class="action-list"></div></section>
  </main>
  <aside class="inspector"><section><h2>属性</h2><div id="inspector"></div></section></aside>
</div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
let model = ${initial};

function esc(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function pathKey(path) { return JSON.stringify(path || []); }
function encodedPath(path) { return encodeURIComponent(JSON.stringify(path || [])); }
function decodePath(value) { return JSON.parse(decodeURIComponent(value)); }
function pretty(value) {
  if (value === undefined) return "";
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function post(operation, targetOverride) {
  const first = Array.isArray(operation?.path) ? operation.path[0] : undefined;
  const target = targetOverride || (["data", "pages", "initial"].includes(first) ? "manifest" : undefined);
  vscode.postMessage({ type: "operation", operation, target });
}
function componentDefaults(type) {
  const values = {
    text: { type: "text", value: "新文字" },
    input: { type: "input", bind: "state.value", placeholder: "请输入内容" },
    column: { type: "column", children: [] },
    row: { type: "row", children: [] },
    panel: { type: "panel", title: "面板", child: { type: "text", value: "内容" } },
    list: { type: "list", items: "data.items", selected: "state.selected", label: "{{ item.title }}" },
    divider: { type: "divider" },
    spacer: { type: "spacer", height: 1 }
  };
  return values[type] || values.text;
}
function actionDefaults(type) {
  const values = {
    set: { path: "state.notice", value: "" },
    move: { path: "state.selected", by: 1, list: "data.items" },
    toggle: { path: "state.enabled" },
    remove: { list: "data.items", index: 0 },
    append: { path: "state.title", value: "" },
    backspace: { path: "state.title" },
    push: { page: "", params: {} },
    go: { page: "", params: {} },
    replace: { page: "", params: {} },
    reset: { page: "", params: {} },
    pop: {},
    quit: { code: 0 },
    call: { service: "", with: {} },
    refresh: {},
    notify: "",
    if: { condition: { notEmpty: "state.value" }, then: [], else: [] }
  };
  return values[type] || {};
}
function parseEditorValue(raw) {
  const text = String(raw === undefined || raw === null ? "" : raw).trim();
  if (!text) return "";
  try { return JSON.parse(text); } catch { return raw; }
}
function hasOwn(value, key) {
  return value !== null && value !== undefined && Object.prototype.hasOwnProperty.call(value, key);
}
function isVariableReference(value) {
  return typeof value === "string" && /^(data|state|params|page|item|key|index)(?:\\.|$)/.test(value.trim());
}
function conditionOperator(value) {
  if (typeof value === "string") return "direct";
  if (value === undefined) return "direct";
  if (value === null || typeof value !== "object" || Array.isArray(value)) return "custom";
  const types = (model.conditionTypes || []).map((item) => item.key).filter((key) => !["direct", "custom"].includes(key));
  return types.find((key) => hasOwn(value, key)) || "custom";
}
function conditionTypeOptions(selected) {
  const types = model.conditionTypes || [
    { key: "direct", label: "直接判断变量" },
    { key: "notEmpty", label: "非空" },
    { key: "empty", label: "为空" },
    { key: "truthy", label: "真值" },
    { key: "equals", label: "等于" },
    { key: "notEquals", label: "不等于" },
    { key: "all", label: "全部满足" },
    { key: "any", label: "任一满足" },
    { key: "not", label: "取反" },
    { key: "custom", label: "高级 JSON" }
  ];
  return types.map((item) => '<option value="' + esc(item.key) + '" ' + (item.key === selected ? 'selected' : '') + '>' + esc(item.label) + '</option>').join('');
}
function defaultCondition(type) {
  const reference = (model.variablePaths || []).find((path) => /^(data|state|params)\\./.test(path)) || "state.value";
  if (type === "direct") return reference;
  if (["notEmpty", "empty", "truthy"].includes(type)) return { [type]: reference };
  if (["equals", "notEquals"].includes(type)) return { [type]: [reference, ""] };
  if (["all", "any"].includes(type)) return { [type]: [] };
  if (type === "not") return { not: { notEmpty: reference } };
  return {};
}
function conditionOperandInfo(value) {
  if (isObject(value) && hasOwn(value, "bind")) return { mode: "path", text: value.bind };
  return {
    mode: isVariableReference(value) || (typeof value === "string" && (model.variablePaths || []).includes(value)) ? "path" : "value",
    text: value === undefined || value === null ? "" : pretty(value)
  };
}
function conditionOperandValues(value) {
  if (Array.isArray(value)) return [value[0], value[1]];
  if (value && typeof value === "object") return [value.left, value.right];
  return [value, ""];
}
function renderConditionOperand(label, value, name) {
  const info = conditionOperandInfo(value);
  return '<div class="condition-operand"><label class="condition-operand-label">' + esc(label) + '</label><div class="condition-operand-control"><select data-condition-operand-mode="' + esc(name) + '"><option value="path" ' + (info.mode === "path" ? 'selected' : '') + '>变量路径</option><option value="value" ' + (info.mode === "value" ? 'selected' : '') + '>固定值</option></select><input list="variable-paths" data-condition-operand="' + esc(name) + '" value="' + esc(info.text) + '" placeholder="输入变量路径或固定值"></div></div>';
}
function readConditionOperand(editor, name) {
  const input = editor.querySelector('[data-condition-operand="' + name + '"]');
  const mode = editor.querySelector('[data-condition-operand-mode="' + name + '"]');
  const text = input ? input.value.trim() : "";
  if (mode?.value === "path") return text;
  return text ? parseEditorValue(text) : "";
}
function renderConditionNode(value, root = false, rootAttributes = "") {
  const op = conditionOperator(value);
  const object = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  let body = "";
  if (op === "direct") {
    body = '<input list="variable-paths" data-condition-reference value="' + esc(typeof value === "string" ? value : "") + '" placeholder="变量路径，例如 state.notice">';
  } else if (["notEmpty", "empty", "truthy"].includes(op)) {
    body = '<input list="variable-paths" data-condition-reference value="' + esc(pretty(object[op])) + '" placeholder="变量路径，例如 state.notice">';
  } else if (["equals", "notEquals"].includes(op)) {
    const values = conditionOperandValues(object[op]);
    body = renderConditionOperand("左值", values[0], "left") + renderConditionOperand("右值", values[1], "right");
  } else if (["all", "any"].includes(op)) {
    const values = Array.isArray(object[op]) ? object[op] : [];
    body = '<div class="condition-list" data-condition-list>' + values.map((item) => '<div class="condition-item">' + renderConditionNode(item) + '<button type="button" data-condition-command="remove-condition" title="删除条件">×</button></div>').join('') + '</div><div class="condition-actions"><button type="button" data-condition-command="add-condition">添加条件</button></div>';
  } else if (op === "not") {
    body = '<div data-condition-not>' + renderConditionNode(object.not === undefined ? defaultCondition("notEmpty") : object.not) + '</div>';
  } else {
    body = '<textarea data-condition-custom placeholder="输入条件 JSON，例如 {&quot;notEmpty&quot;:&quot;state.notice&quot;}">' + esc(pretty(value)) + '</textarea><div class="subtle">高级条件仍可直接填写 YAML 对应的 JSON。</div>';
  }
  return '<div class="condition-editor" data-condition-editor' + (root ? ' data-condition-root' + rootAttributes : '') + '><div class="condition-toolbar"><select data-condition-op>' + conditionTypeOptions(op) + '</select></div>' + body + '</div>';
}
function renderConditionEditor(value, options = {}) {
  let attributes = ' data-condition-scope="' + esc(options.scope || "field") + '"';
  if (options.path) attributes += ' data-condition-path="' + esc(options.path) + '"';
  if (options.conditionKey) attributes += ' data-style-condition-key="' + esc(options.conditionKey) + '"';
  return renderConditionNode(value, true, attributes);
}
function conditionFromEditor(editor) {
  const operator = editor.querySelector(".condition-toolbar [data-condition-op]")?.value || "direct";
  if (operator === "custom") {
    const raw = editor.querySelector("[data-condition-custom]")?.value.trim() || "";
    return raw ? parseEditorValue(raw) : undefined;
  }
  if (operator === "direct") {
    const raw = editor.querySelector("[data-condition-reference]")?.value.trim() || "";
    return raw || undefined;
  }
  if (["notEmpty", "empty", "truthy"].includes(operator)) {
    const raw = editor.querySelector("[data-condition-reference]")?.value.trim() || "";
    return raw ? { [operator]: raw } : undefined;
  }
  if (["equals", "notEquals"].includes(operator)) {
    const left = readConditionOperand(editor, "left");
    const right = readConditionOperand(editor, "right");
    return left === "" && right === "" ? undefined : { [operator]: [left, right] };
  }
  if (["all", "any"].includes(operator)) {
    const list = editor.querySelector("[data-condition-list]");
    const values = Array.from(list?.children || [])
      .map((item) => conditionFromEditor(item.querySelector("[data-condition-editor]")))
      .filter((item) => item !== undefined);
    return { [operator]: values };
  }
  if (operator === "not") {
    const child = editor.querySelector("[data-condition-not] > [data-condition-editor]");
    return { not: child ? conditionFromEditor(child) : defaultCondition("notEmpty") };
  }
  return undefined;
}
function styleMode(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (hasOwn(value, "when") || hasOwn(value, "condition")) return "conditional";
    return "object";
  }
  return "preset";
}
function styleModeOptions(selected) {
  return '<option value="preset" ' + (selected === "preset" ? 'selected' : '') + '>预设或自定义名称</option><option value="object" ' + (selected === "object" ? 'selected' : '') + '>自定义样式对象</option><option value="conditional" ' + (selected === "conditional" ? 'selected' : '') + '>条件样式</option>';
}
function styleValueFromEditor(editor) {
  const mode = editor.querySelector("[data-style-mode]")?.value || "preset";
  if (mode === "preset") return parseEditorValue(editor.querySelector("[data-style-value]")?.value || "");
  if (mode === "object") return parseEditorValue(editor.querySelector("[data-style-json]")?.value || "");
  const conditionKey = editor.querySelector("[data-style-condition-key]")?.value || "when";
  const conditionEditor = editor.querySelector("[data-condition-root]");
  return {
    [conditionKey]: conditionEditor ? conditionFromEditor(conditionEditor) : defaultCondition("notEmpty"),
    value: parseEditorValue(editor.querySelector('[data-style-result="value"]')?.value || ""),
    else: parseEditorValue(editor.querySelector('[data-style-result="else"]')?.value || "")
  };
}
function renderStyleEditor(def, value, path) {
  const mode = styleMode(value);
  let body;
  if (mode === "preset") {
    body = '<input list="style-values" data-style-value value="' + esc(typeof value === "string" ? value : "") + '" placeholder="选择或输入样式名">';
  } else if (mode === "object") {
    body = '<textarea data-style-json placeholder="例如 {&quot;fg&quot;:&quot;cyan&quot;,&quot;bold&quot;:true}">' + esc(pretty(value)) + '</textarea>';
  } else {
    const conditionKey = hasOwn(value, "condition") ? "condition" : "when";
    body = '<div class="field-combo"><select data-style-condition-key><option value="when" ' + (conditionKey === "when" ? 'selected' : '') + '>when 条件</option><option value="condition" ' + (conditionKey === "condition" ? 'selected' : '') + '>condition 条件</option></select><span class="subtle">满足条件时使用</span></div>'
      + renderConditionEditor(value[conditionKey], { scope: "style", path, conditionKey })
      + '<div class="field-combo"><label class="subtle">满足时</label><input list="style-values" data-style-result="value" value="' + esc(pretty(value.value)) + '" placeholder="样式名或 JSON"></div>'
      + '<div class="field-combo"><label class="subtle">否则</label><input list="style-values" data-style-result="else" value="' + esc(pretty(value.else)) + '" placeholder="可选样式"></div>';
  }
  return '<div class="field field-wide"><label>' + esc(def.label) + '</label><div class="style-editor" data-style-editor data-style-path="' + path + '"><div class="field-combo"><select data-style-mode>' + styleModeOptions(mode) + '</select></div>' + body + '</div></div>';
}
function branchActionName(action) {
  if (typeof action === "string") return action;
  if (!action || typeof action !== "object") return "";
  if (typeof action.do === "string") return action.do;
  return Object.keys(action).find((key) => (model.actionTypes || []).includes(key)) || "";
}
function branchActionMarkup(action) {
  const name = branchActionName(action);
  const options = (model.actionTypes || []).map((type) => '<option value="' + esc(type) + '" ' + (type === name ? 'selected' : '') + '>' + esc(type) + '</option>').join('');
  return '<div class="branch-action"><div class="branch-action-toolbar"><select data-action-branch-type>' + options + '</select><button type="button" data-action-branch-remove title="删除分支动作">×</button></div><textarea data-action-branch-json placeholder="动作参数 JSON，可直接编辑">' + esc(pretty(action)) + '</textarea></div>';
}
function renderActionBranch(field, value) {
  const actions = Array.isArray(value) ? value : value === undefined || value === null || value === "" ? [] : [value];
  const label = field === "then" ? "满足时执行" : "不满足时执行";
  return '<div class="field field-wide"><div class="action-branch" data-action-branch="' + esc(field) + '"><div class="action-branch-header"><strong>' + label + '</strong><select data-action-branch-new>' + (model.actionTypes || []).map((type) => '<option value="' + esc(type) + '">' + esc(type) + '</option>').join('') + '</select><button type="button" data-action-branch-add>添加动作</button></div><div data-action-branch-list>' + actions.map(branchActionMarkup).join('') + '</div></div></div>';
}
function readActionBranch(branch) {
  return Array.from(branch.querySelectorAll(".branch-action"))
    .map((row) => parseEditorValue(row.querySelector("[data-action-branch-json]")?.value || ""))
    .filter((value) => value !== "");
}
function postSelectedIfConfig(config) {
  if (!model.selectedAction) return;
  post({ type: "set", path: model.selectedAction.path, value: { if: config } });
}
function conditionRootAttributes(editor) {
  if (!editor.hasAttribute("data-condition-root")) return "";
  let attributes = ' data-condition-scope="' + esc(editor.dataset.conditionScope || "field") + '"';
  if (editor.dataset.conditionPath) attributes += ' data-condition-path="' + esc(editor.dataset.conditionPath) + '"';
  if (editor.dataset.styleConditionKey) attributes += ' data-style-condition-key="' + esc(editor.dataset.styleConditionKey) + '"';
  return attributes;
}
function replaceConditionNode(editor, value) {
  const holder = document.createElement("div");
  holder.innerHTML = renderConditionNode(value, editor.hasAttribute("data-condition-root"), conditionRootAttributes(editor));
  const replacement = holder.firstElementChild;
  editor.replaceWith(replacement);
  return replacement;
}
function commitConditionEditor(editor, explicitValue) {
  const value = arguments.length > 1 ? explicitValue : conditionFromEditor(editor);
  const scope = editor.dataset.conditionScope || "field";
  if (scope === "action") {
    const config = Object.assign({}, model.selectedAction?.config || {});
    if (value === undefined) delete config.condition;
    else config.condition = value;
    postSelectedIfConfig(config);
    return;
  }
  if (scope === "style") {
    const styleEditor = editor.closest("[data-style-editor]");
    if (!styleEditor) return;
    const style = styleValueFromEditor(styleEditor);
    const path = decodePath(styleEditor.dataset.stylePath);
    if (style === undefined) post({ type: "delete", path });
    else post({ type: "set", path, value: style });
    return;
  }
  const path = decodePath(editor.dataset.conditionPath);
  if (value === undefined) post({ type: "delete", path });
  else post({ type: "set", path, value });
}
function commitStyleEditor(editor) {
  const value = styleValueFromEditor(editor);
  const path = decodePath(editor.dataset.stylePath);
  const mode = editor.querySelector("[data-style-mode]")?.value || "preset";
  const raw = mode === "preset"
    ? editor.querySelector("[data-style-value]")?.value.trim() || ""
    : mode === "object"
      ? editor.querySelector("[data-style-json]")?.value.trim() || ""
      : "value";
  if (raw === "" && (mode === "preset" || mode === "object")) post({ type: "delete", path });
  else post({ type: "set", path, value });
}
function commitActionBranches() {
  const config = Object.assign({}, model.selectedAction?.config || {});
  document.querySelectorAll("[data-action-branch]").forEach((branch) => {
    config[branch.dataset.actionBranch] = readActionBranch(branch);
  });
  postSelectedIfConfig(config);
}
function renderPages() {
  const el = document.getElementById("pages");
  if (!model.pages || !model.pages.length) el.innerHTML = '<div class="empty">还没有页面</div>';
  else el.innerHTML = model.pages.map((page) => {
    const remove = model.mode === "manifest"
      ? '<button type="button" class="page-delete danger" data-command="delete-page" data-page-name="' + esc(page.name) + '" title="删除页面" aria-label="删除页面">×</button>'
      : '';
    return '<div class="page-row"><button class="page-button ' + (page.name === model.selectedPage ? 'active' : '') + '" data-page="' + esc(page.name) + '">' + esc(page.name) + (page.external ? ' ↗' : '') + '</button>' + remove + '</div>';
  }).join("");
  document.getElementById("page-form").innerHTML = model.ok && model.mode === "manifest"
    ? '<div class="inline-form"><input id="page-name" placeholder="页面名"><button data-command="add-page">新建</button></div>'
    : '<div class="subtle">独立页面直接编辑当前页面。</div>';
}
function renderVariableList(id, formId, entries, scope, emptyText) {
  const el = document.getElementById(id);
  if (!entries || !entries.length) el.innerHTML = '<div class="empty">' + esc(emptyText) + '</div>';
  else el.innerHTML = entries.map((item) => '<div class="variable-row"><button type="button" class="page-button variable-select ' + (pathKey(item.path) === pathKey(model.selectedPath) ? 'active' : '') + '" data-variable-path="' + encodedPath(item.path) + '"><strong>' + esc(item.key) + '</strong> <span>' + esc(item.type) + '</span><br><span class="subtle">' + esc(item.preview) + '</span></button><button type="button" class="variable-delete danger" data-command="delete-variable" data-variable-delete-path="' + encodedPath(item.path) + '" title="删除变量" aria-label="删除变量">×</button></div>').join("");
  const prefix = scope === "data" ? "共享变量" : "页面变量";
  document.getElementById(formId).innerHTML = '<div class="inline-form"><input id="' + scope + '-key" placeholder="字段名"><select id="' + scope + '-kind"><option value="object">对象</option><option value="string">文字</option><option value="array">列表</option><option value="boolean">开关</option><option value="number">数字</option></select><button data-command="add-variable" data-scope="' + scope + '">添加</button></div><div class="subtle">' + prefix + '会写入 YAML，可在绑定中使用。</div>';
}
function renderData() {
  renderVariableList("data", "data-form", model.data, "data", "data 还是空的");
  renderVariableList("state", "state-form", model.state, "state", "当前页面还没有变量");
}
function renderTreeNode(node) {
  if (!node) return '<div class="empty">还没有 layout。点击“创建布局”开始。</div>';
  const active = pathKey(node.path) === pathKey(model.selectedPath);
  const children = node.children && node.children.length ? '<div class="node-children">' + node.children.map(renderTreeNode).join("") + '</div>' : '';
  const previewPath = encodedPath(node.path);
  return '<div class="node" data-drop-path="' + previewPath + '"><button draggable="true" class="node-button ' + (active ? 'active' : '') + '" data-node="' + previewPath + '" data-node-preview="' + previewPath + '" title="悬停预览" aria-label="' + esc(node.type + ' ' + node.label) + '"><span class="type">' + esc(node.type) + '</span><span class="label">' + esc(node.label) + '</span></button>' + children + '</div>';
}
function findLayoutNode(node, path) {
  if (!node) return undefined;
  if (pathKey(node.path) === pathKey(path)) return node;
  for (const child of node.children || []) {
    const found = findLayoutNode(child, path);
    if (found) return found;
  }
  return undefined;
}
function previewText(data, keys, fallback) {
  for (const key of keys) {
    if (data[key] !== undefined && data[key] !== null && data[key] !== "") return pretty(data[key]);
  }
  return fallback;
}
function previewStyleClass(style) {
  let value = style;
  if (typeof style === "string" && style.trim().startsWith("{")) {
    try { value = JSON.parse(style); } catch { value = style; }
  }
  const name = typeof value === "string" ? value : value && (value.name || value.variant);
  return ["title", "primary", "muted", "success", "warning", "danger"].includes(name)
    ? " preview-tone-" + name
    : "";
}
function previewBlocks(data, direction) {
  const count = Math.max(1, Math.min(4, Number(data.children) || 1));
  return '<div class="preview-layout ' + direction + '">' + Array.from({ length: count }, () => '<span class="preview-block"></span>').join('') + '</div>';
}
function renderPreviewBody(data) {
  const type = data.type || "text";
  if (type === "text") {
    return '<div class="preview-text' + previewStyleClass(data.style) + '">' + esc(previewText(data, ["value", "template", "bind"], "文字")) + '</div>';
  }
  if (type === "input") {
    return '<div class="preview-input">' + esc(previewText(data, ["value", "placeholder", "bind"], "输入内容")) + '</div>';
  }
  if (type === "column" || type === "row" || type === "group") return previewBlocks(data, type === "row" ? "row" : "column");
  if (type === "panel") {
    return '<div class="preview-panel"><div class="preview-panel-title">' + esc(previewText(data, ["title"], "面板")) + '</div><div class="preview-panel-body">' + previewBlocks({ children: Math.max(1, Number(data.children) || 1) }, "column") + '</div></div>';
  }
  if (type === "list") {
    const label = previewText(data, ["label"], "列表项目");
    const selected = Number(data.selected);
    const selectedIndex = Number.isInteger(selected) && selected >= 0 && selected < 3 ? selected : 0;
    return '<div class="preview-list">' + [0, 1, 2].map((index) => '<div class="preview-list-row ' + (index === selectedIndex ? 'selected' : '') + '"><span class="preview-marker">' + (index === selectedIndex ? '>' : '·') + '</span><span>' + esc(label + ' ' + (index + 1)) + '</span></div>').join('') + '</div>';
  }
  if (type === "divider") return '<div class="preview-divider">' + esc(previewText(data, ["character"], "")) + '</div>';
  if (type === "spacer") {
    const rawHeight = data.height !== undefined ? data.height : data.lines;
    const height = Number(rawHeight);
    const pixels = Number.isFinite(height) ? Math.max(8, Math.min(54, height * 12)) : 18;
    return '<div class="preview-spacer" style="height:' + pixels + 'px"></div>';
  }
  return '<div class="preview-text">' + esc(previewText(data, ["value", "title", "bind"], type)) + '</div>';
}
function renderHoverPreview(node) {
  const data = node.preview || { type: node.type, children: (node.children || []).length };
  const meta = ["style", "bind", "items", "selected", "gap", "padding", "visible"]
    .filter((key) => data[key] !== undefined && data[key] !== null && data[key] !== "")
    .map((key) => '<span>' + esc(key + ': ' + pretty(data[key])) + '</span>')
    .join('');
  return '<div class="preview-head"><span class="preview-type">' + esc(data.type || node.type) + '</span><span class="preview-label">' + esc(node.label) + '</span></div><div class="preview-surface">' + renderPreviewBody(data) + '</div>' + (meta ? '<div class="preview-meta">' + meta + '</div>' : '');
}
let hoverShowTimer;
let hoverHideTimer;
let hoverAnchor;
let hoverWidgetHovered = false;

function clearHoverTimers() {
  if (hoverShowTimer) window.clearTimeout(hoverShowTimer);
  if (hoverHideTimer) window.clearTimeout(hoverHideTimer);
  hoverShowTimer = undefined;
  hoverHideTimer = undefined;
}
function hideHoverPreview() {
  clearHoverTimers();
  hoverAnchor = undefined;
  const preview = document.getElementById("hover-preview");
  if (!preview) return;
  preview.dataset.visible = "false";
  preview.setAttribute("aria-hidden", "true");
  preview.innerHTML = '';
}
function scheduleHideHoverPreview(anchor) {
  if (hoverHideTimer) window.clearTimeout(hoverHideTimer);
  hoverHideTimer = window.setTimeout(() => {
    hoverHideTimer = undefined;
    if (hoverWidgetHovered) return;
    if (!anchor || hoverAnchor === anchor) hideHoverPreview();
  }, 180);
}
function showHoverPreview(path, anchor) {
  const preview = document.getElementById("hover-preview");
  const node = findLayoutNode(model.layoutTree, path);
  if (!preview || !node || !anchor || !anchor.isConnected) return;
  if (hoverHideTimer) window.clearTimeout(hoverHideTimer);
  hoverHideTimer = undefined;
  preview.innerHTML = renderHoverPreview(node);
  preview.dataset.visible = "true";
  preview.setAttribute("aria-hidden", "false");
  const anchorRect = anchor.getBoundingClientRect();
  const previewRect = preview.getBoundingClientRect();
  const margin = 12;
  let left = anchorRect.left + 12;
  if (left + previewRect.width > window.innerWidth - margin) left = window.innerWidth - previewRect.width - margin;
  if (left < margin) left = margin;
  let top = anchorRect.bottom + 8;
  if (top + previewRect.height > window.innerHeight - margin) top = anchorRect.top - previewRect.height - 8;
  if (top < margin) top = margin;
  preview.style.left = left + "px";
  preview.style.top = top + "px";
}
function startHoverPreview(anchor) {
  clearHoverTimers();
  hoverAnchor = anchor;
  const path = decodePath(anchor.dataset.nodePreview);
  hoverShowTimer = window.setTimeout(() => {
    hoverShowTimer = undefined;
    if (hoverAnchor === anchor) showHoverPreview(path, anchor);
  }, 240);
}
function leaveHoverPreview(anchor) {
  if (hoverAnchor !== anchor) return;
  if (hoverShowTimer) window.clearTimeout(hoverShowTimer);
  hoverShowTimer = undefined;
  scheduleHideHoverPreview(anchor);
}
function bindHoverPreviews() {
  document.querySelectorAll("[data-node-preview]").forEach((anchor) => {
    anchor.addEventListener("mouseenter", () => startHoverPreview(anchor));
    anchor.addEventListener("mouseleave", () => leaveHoverPreview(anchor));
    anchor.addEventListener("focus", () => startHoverPreview(anchor));
    anchor.addEventListener("blur", () => leaveHoverPreview(anchor));
  });
}
function initHoverWidget() {
  const preview = document.getElementById("hover-preview");
  if (!preview || preview.dataset.bound === "true") return;
  preview.dataset.bound = "true";
  preview.addEventListener("mouseenter", () => {
    hoverWidgetHovered = true;
    if (hoverHideTimer) window.clearTimeout(hoverHideTimer);
    hoverHideTimer = undefined;
  });
  preview.addEventListener("mouseleave", () => {
    hoverWidgetHovered = false;
    scheduleHideHoverPreview(hoverAnchor);
  });
}
function renderTree() {
  document.getElementById("canvas-title").textContent = (model.selectedPage || "页面") + " · 布局";
  const tree = document.getElementById("tree");
  if (!model.ok) tree.innerHTML = '<div class="empty">无法显示布局</div>';
  else if (model.selectedPageExternal && !model.selectedPageUri) tree.innerHTML = '<div class="empty">找不到这个外部页面文件，请先在源码中修正 pages 路径。</div>';
  else tree.innerHTML = renderTreeNode(model.layoutTree);
  const newLayout = document.querySelector('[data-command="new-layout"]');
  if (newLayout) newLayout.disabled = !model.ok || (model.selectedPageExternal && !model.selectedPageUri);
}
function renderComponentTools() {
  const el = document.getElementById("component-tools");
  if (!model.ok || !model.componentInsertPath || (model.selectedPageExternal && !model.selectedPageUri)) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = '<div class="inline-form"><select id="component-type">' + (model.componentTypes || []).map((type) => '<option>' + esc(type) + '</option>').join('') + '</select><button data-command="add-component">添加组件</button></div><div class="subtle">先在左侧或上方选择容器，再把组件放进布局。</div>';
}
function renderDatalists() {
  const variables = document.getElementById("variable-paths");
  const routes = document.getElementById("page-routes");
  if (variables) variables.innerHTML = (model.variablePaths || []).map((path) => '<option value="' + esc(path) + '"></option>').join('');
  if (routes) routes.innerHTML = (model.pages || []).map((page) => '<option value="' + esc(page.name) + '"></option>').join('');
}
function fieldDefinitions(type) {
  const common = [{ key: "type", label: "组件", kind: "select", options: model.componentTypes || [] }];
  const fields = {
    text: [{ key: "value", label: "文字", kind: "value" }, { key: "template", label: "模板", kind: "string" }, { key: "bind", label: "绑定", kind: "path" }, { key: "style", label: "样式", kind: "style" }, { key: "visible", label: "显示条件", kind: "condition" }],
    input: [{ key: "value", label: "初始值", kind: "value" }, { key: "bind", label: "绑定", kind: "path" }, { key: "placeholder", label: "占位文字", kind: "string" }, { key: "style", label: "样式", kind: "style" }, { key: "visible", label: "显示条件", kind: "condition" }],
    column: [{ key: "gap", label: "间距", kind: "number" }, { key: "padding", label: "边距", kind: "value" }, { key: "flex", label: "占满空间", kind: "boolean" }, { key: "style", label: "样式", kind: "style" }, { key: "visible", label: "显示条件", kind: "condition" }],
    row: [{ key: "gap", label: "间距", kind: "number" }, { key: "padding", label: "边距", kind: "value" }, { key: "flex", label: "占满空间", kind: "boolean" }, { key: "style", label: "样式", kind: "style" }, { key: "visible", label: "显示条件", kind: "condition" }],
    panel: [{ key: "title", label: "标题", kind: "value" }, { key: "flex", label: "占满空间", kind: "boolean" }, { key: "border", label: "边框", kind: "string" }, { key: "borderStyle", label: "边框样式", kind: "style" }, { key: "titleStyle", label: "标题样式", kind: "style" }, { key: "style", label: "样式", kind: "style" }, { key: "visible", label: "显示条件", kind: "condition" }],
    list: [{ key: "items", label: "数据列表", kind: "path" }, { key: "selected", label: "选中项", kind: "path" }, { key: "label", label: "标题模板", kind: "value" }, { key: "description", label: "描述模板", kind: "value" }, { key: "style", label: "列表样式", kind: "style" }, { key: "itemStyle", label: "普通样式", kind: "style" }, { key: "selectedStyle", label: "选中样式", kind: "style" }, { key: "disabledStyle", label: "禁用样式", kind: "style" }, { key: "emptyStyle", label: "空状态样式", kind: "style" }, { key: "visible", label: "显示条件", kind: "condition" }],
    divider: [{ key: "character", label: "分隔字符", kind: "string" }, { key: "style", label: "样式", kind: "style" }, { key: "visible", label: "显示条件", kind: "condition" }],
    spacer: [{ key: "height", label: "高度", kind: "number" }, { key: "lines", label: "行数", kind: "number" }, { key: "visible", label: "显示条件", kind: "condition" }]
  };
  return common.concat(fields[type] || fields.text);
}
function renderField(def, node) {
  const present = Object.prototype.hasOwnProperty.call(node || {}, def.key);
  const value = present ? node[def.key] : "";
  const path = encodedPath((model.selectedPath || []).concat(def.key));
  if (def.kind === "select") return '<div class="field"><label>' + esc(def.label) + '</label><select data-field="' + esc(def.key) + '" data-kind="select" data-path="' + path + '">' + (def.options || []).map((option) => '<option ' + (option === (node.type || 'text') ? 'selected' : '') + '>' + esc(option) + '</option>').join('') + '</select></div>';
  if (def.kind === "boolean") return '<div class="field"><label>' + esc(def.label) + '</label><select data-field="' + esc(def.key) + '" data-kind="boolean" data-path="' + path + '"><option value="" ' + (!present ? 'selected' : '') + '>未设置</option><option value="true" ' + (value === true ? 'selected' : '') + '>是</option><option value="false" ' + (value === false && present ? 'selected' : '') + '>否</option></select></div>';
  if (def.kind === "style") return renderStyleEditor(def, value, path);
  if (def.kind === "condition") return '<div class="field field-wide"><label>' + esc(def.label) + '</label>' + renderConditionEditor(present ? value : undefined, { scope: "field", path }) + '</div>';
  const list = def.kind === "path" ? ' list="variable-paths"' : '';
  const control = def.kind === "json" || def.kind === "value"
    ? '<textarea placeholder="可选" data-field="' + esc(def.key) + '" data-kind="' + esc(def.kind) + '" data-present="' + (present ? 'true' : 'false') + '" data-path="' + path + '">' + esc(pretty(value)) + '</textarea>'
    : '<input' + list + ' value="' + esc(pretty(value)) + '" placeholder="可选" data-field="' + esc(def.key) + '" data-kind="' + esc(def.kind) + '" data-present="' + (present ? 'true' : 'false') + '" data-path="' + path + '">';
  return '<div class="field"><label>' + esc(def.label) + '</label>' + control + '</div>';
}
function renderVariableInspector() {
  const node = model.selectedNode;
  const scope = model.selectedKind === "state" ? "页面变量" : "共享变量";
  return '<div class="subtle">' + scope + '：' + esc((model.selectedPath || []).join('.')) + '</div><div class="field"><label>值</label><textarea data-variable-value>' + esc(pretty(node)) + '</textarea></div><div class="subtle">文字直接输入；对象和列表可以使用 JSON，例如 {"title":"任务"}。</div><div class="field-actions"><button data-command="save-variable">保存变量</button><button data-command="delete-variable" class="danger">删除变量</button></div>';
}
function actionFieldKind(name, field) {
  if (name === "if" && field === "condition") return "condition";
  if ((model.actionJsonFields || []).includes(field)) return "json";
  if ((model.actionNumberFields || []).includes(field)) return "number";
  if ((model.actionValueFields || []).includes(field)) return "value";
  if ((model.actionPathFields || []).includes(field)) return "path";
  if ((model.actionRouteFields || []).includes(field)) return "route";
  return "string";
}
function renderActionField(name, field, config) {
  if (name === "if" && field === "condition") {
    return '<div class="field field-wide"><label>条件类型与参数</label>' + renderConditionEditor(config.condition, { scope: "action" }) + '</div>';
  }
  if (name === "if" && (field === "then" || field === "else")) return renderActionBranch(field, config[field]);
  const kind = actionFieldKind(name, field);
  const value = config && Object.prototype.hasOwnProperty.call(config, field) ? config[field] : "";
  if (kind === "json" || kind === "value") return '<div class="field"><label>' + esc(field) + '</label><textarea data-action-field="' + esc(field) + '" data-kind="' + esc(kind) + '">' + esc(pretty(value)) + '</textarea></div>';
  const list = kind === "path" ? ' list="variable-paths"' : kind === "route" ? ' list="page-routes"' : '';
  return '<div class="field"><label>' + esc(field) + '</label><input' + list + ' value="' + esc(pretty(value)) + '" placeholder="可选" data-action-field="' + esc(field) + '" data-kind="' + esc(kind) + '"></div>';
}
function renderActionInspector() {
  const selected = model.selectedAction;
  if (!selected || !selected.name) return '<div class="empty">选择一个动作查看参数。</div>';
  const fields = (model.actionFields || {})[selected.name] || [];
  return '<div class="subtle">动作路径：' + esc((selected.path || []).join('.')) + '</div><div class="field"><label>动作</label><select data-action-type>' + (model.actionTypes || []).map((name) => '<option ' + (name === selected.name ? 'selected' : '') + '>' + esc(name) + '</option>').join('') + '</select></div>' + fields.map((field) => renderActionField(selected.name, field, selected.config || {})).join('') + '<div class="field-actions"><button data-command="delete-action" data-path="' + encodedPath(selected.path) + '" class="danger">删除动作</button></div>';
}
function renderInspector() {
  const el = document.getElementById("inspector");
  const node = model.selectedNode;
  if (!model.ok) { el.innerHTML = '<div class="empty">请先修复 YAML。</div>'; return; }
  if (model.selectedKind === "action") { el.innerHTML = renderActionInspector(); return; }
  if (model.selectedKind === "data" || model.selectedKind === "state") { el.innerHTML = renderVariableInspector(); return; }
  if (!node || typeof node !== "object" || Array.isArray(node)) { el.innerHTML = '<div class="empty">选择一个布局节点查看属性。</div>'; return; }
  const type = node.type || "text";
  el.innerHTML = '<div class="subtle">路径：' + esc((model.selectedPath || []).join('.')) + '</div>' + fieldDefinitions(type).map((field) => renderField(field, node)).join('') + '<div class="field-actions"><button data-command="move-up">上移</button><button data-command="move-down">下移</button><button data-command="remove-node" class="danger">删除节点</button></div>';
}
function renderActions() {
  const el = document.getElementById("actions");
  const events = (model.actions && model.actions.events) || [];
  const rows = [];
  events.forEach((event) => event.actions.forEach((action) => rows.push('<div class="action-row ' + (pathKey(action.path) === pathKey(model.selectedPath) ? 'selected' : '') + '"><button class="action-select" data-action-path="' + encodedPath(action.path) + '"><span class="event">' + esc(event.source + '.' + event.event) + '</span><span class="action">' + esc(action.label) + '</span></button><button data-command="delete-action" data-path="' + encodedPath(action.path) + '">×</button></div>')));
  const keyEvents = (model.eventTypes || []).map((event) => '<option>' + esc(event) + '</option>').join('');
  rows.push('<div class="inline-form"><select id="action-source"><option value="keys">按键</option><option value="on">生命周期</option></select><select id="action-event">' + keyEvents + '</select><select id="action-type">' + (model.actionTypes || []).map((action) => '<option>' + esc(action) + '</option>').join('') + '</select><button data-command="add-action">添加</button></div>');
  el.innerHTML = (events.length ? rows : ['<div class="empty">还没有按键或生命周期动作</div>', rows[0]]).join('');
}
function refreshActionEvents() {
  const source = document.getElementById("action-source");
  const event = document.getElementById("action-event");
  if (!source || !event) return;
  const names = source.value === "on" ? (model.lifecycleEventTypes || []) : (model.eventTypes || []);
  event.innerHTML = names.map((name) => '<option>' + esc(name) + '</option>').join('');
}
function renderBanner() {
  document.getElementById("banner").innerHTML = model.ok ? '' : '<div class="banner">无法打开可视化编辑器：' + esc(model.error) + '。请先修复 YAML，或打开源码编辑器。</div>';
}
function render() { hideHoverPreview(); renderBanner(); renderPages(); renderData(); renderTree(); bindHoverPreviews(); renderComponentTools(); renderInspector(); renderActions(); renderDatalists(); refreshActionEvents(); }

window.addEventListener("scroll", hideHoverPreview, true);
window.addEventListener("resize", hideHoverPreview);

document.addEventListener("click", (event) => {
  const page = event.target.closest("[data-page]");
  if (page) { vscode.postMessage({ type: "selectPage", page: page.dataset.page }); return; }
  const node = event.target.closest("[data-node]");
  if (node) { vscode.postMessage({ type: "selectNode", path: decodePath(node.dataset.node) }); return; }
  const variable = event.target.closest("[data-variable-path]");
  if (variable) { vscode.postMessage({ type: "selectNode", path: decodePath(variable.dataset.variablePath) }); return; }
  const action = event.target.closest("[data-action-path]");
  if (action) { vscode.postMessage({ type: "selectNode", path: decodePath(action.dataset.actionPath) }); return; }
  const conditionCommand = event.target.closest("[data-condition-command]");
  if (conditionCommand) {
    const root = conditionCommand.closest("[data-condition-root]");
    const editor = conditionCommand.closest("[data-condition-editor]");
    if (!root || !editor) return;
    if (conditionCommand.dataset.conditionCommand === "add-condition") {
      const list = editor.querySelector("[data-condition-list]");
      if (list) list.insertAdjacentHTML("beforeend", '<div class="condition-item">' + renderConditionNode(defaultCondition("direct")) + '<button type="button" data-condition-command="remove-condition" title="删除条件">×</button></div>');
    } else if (conditionCommand.dataset.conditionCommand === "remove-condition") {
      conditionCommand.closest(".condition-item")?.remove();
    }
    commitConditionEditor(root);
    return;
  }
  const branchAdd = event.target.closest("[data-action-branch-add]");
  if (branchAdd) {
    const branch = branchAdd.closest("[data-action-branch]");
    const list = branch?.querySelector("[data-action-branch-list]");
    const type = branch?.querySelector("[data-action-branch-new]")?.value || "set";
    if (list) list.insertAdjacentHTML("beforeend", branchActionMarkup({ [type]: actionDefaults(type) }));
    commitActionBranches();
    return;
  }
  const branchRemove = event.target.closest("[data-action-branch-remove]");
  if (branchRemove) {
    branchRemove.closest(".branch-action")?.remove();
    commitActionBranches();
    return;
  }
  const button = event.target.closest("[data-command]");
  if (!button) return;
  const command = button.dataset.command;
  if (command === "source" || command === "preview") { vscode.postMessage({ type: command }); return; }
  if (command === "delete-page") {
    const name = button.dataset.pageName;
    if (model.mode !== "manifest" || !name) return;
    vscode.postMessage({ type: "deletePage", page: name });
    return;
  }
  if (command === "new-layout") { if (!model.selectedPageExternal || model.selectedPageUri) post({ type: "set", path: model.layoutPath, value: { type: "column", children: [] } }); return; }
  if (command === "remove-node") { if (model.selectedKind === "layout") post({ type: "delete", path: model.selectedPath }); return; }
  if (command === "move-up" || command === "move-down") { if (model.selectedKind === "layout") post({ type: "move", path: model.selectedPath, direction: command === "move-up" ? "up" : "down" }); return; }
  if (command === "add-component") { const type = document.getElementById("component-type").value; if (model.componentInsertPath) post({ type: "append", path: model.componentInsertPath, value: componentDefaults(type) }); return; }
  if (command === "add-page") { const name = document.getElementById("page-name").value.trim(); if (!name) return; post({ type: "set", path: ["pages", name], value: { title: name, state: {}, layout: { type: "column", children: [] }, keys: {} } }); return; }
  if (command === "add-variable") { const scope = button.dataset.scope; const key = document.getElementById(scope + "-key").value.trim(); const kind = document.getElementById(scope + "-kind").value; if (!key) return; const values = { object: {}, string: "", array: [], boolean: false, number: 0 }; const base = scope === "data" ? ["data"] : (model.selectedPagePath || []).concat(["state"]); post({ type: "set", path: base.concat(key), value: values[kind] }); return; }
  if (command === "save-variable") { const field = document.querySelector("[data-variable-value]"); if (field) post({ type: "set", path: model.selectedPath, value: parseEditorValue(field.value) }); return; }
  if (command === "delete-variable") {
    const path = button.dataset.variableDeletePath ? decodePath(button.dataset.variableDeletePath) : model.selectedPath;
    const statePath = (model.selectedPagePath || []).concat("state");
    const isState = Array.isArray(path)
      && path.length > statePath.length
      && statePath.every((part, index) => path[index] === part);
    if (path?.[0] === "data" || isState || model.selectedKind === "data" || model.selectedKind === "state") {
      post({ type: "delete", path });
    }
    return;
  }
  if (command === "add-action") { const source = document.getElementById("action-source").value; const eventName = document.getElementById("action-event").value; const action = document.getElementById("action-type").value; post({ type: "append", path: (model.selectedPagePath || []).concat([source, eventName]), value: { [action]: actionDefaults(action) } }); return; }
  if (command === "delete-action") { post({ type: "delete", path: decodePath(button.dataset.path) }); }
});
let draggedPath;
document.addEventListener("dragstart", (event) => {
  const node = event.target.closest("[data-node]");
  if (!node) return;
  draggedPath = decodePath(node.dataset.node);
  node.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", node.dataset.node);
});
document.addEventListener("dragend", (event) => {
  const node = event.target.closest("[data-node]");
  if (node) node.classList.remove("dragging");
  document.querySelectorAll(".drop-target").forEach((item) => item.classList.remove("drop-target"));
  draggedPath = undefined;
});
document.addEventListener("dragover", (event) => {
  const target = event.target.closest("[data-drop-path]");
  if (!target || !draggedPath) return;
  event.preventDefault();
  document.querySelectorAll(".drop-target").forEach((item) => item.classList.remove("drop-target"));
  target.classList.add("drop-target");
});
document.addEventListener("drop", (event) => {
  const target = event.target.closest("[data-drop-path]");
  if (!target || !draggedPath) return;
  event.preventDefault();
  const targetPath = decodePath(target.dataset.dropPath);
  const targetNode = findLayoutNode(model.layoutTree, targetPath);
  const intoContainer = targetNode
    && ["panel", "column", "row", "group"].includes(targetNode.type)
    && pathKey(draggedPath) !== pathKey(targetPath);
  post({ type: intoContainer ? "moveInto" : "move", path: draggedPath, targetPath });
  target.classList.remove("drop-target");
});
document.addEventListener("change", (event) => {
  if (event.target.id === "action-source") { refreshActionEvents(); return; }
  const conditionEditor = event.target.closest("[data-condition-editor]");
  if (conditionEditor) {
    const root = event.target.closest("[data-condition-root]");
    if (!root) return;
    if (event.target.matches("[data-condition-op]")) {
      const replacement = replaceConditionNode(conditionEditor, defaultCondition(event.target.value));
      commitConditionEditor(root === conditionEditor ? replacement : root);
    } else {
      commitConditionEditor(root);
    }
    return;
  }
  const styleModeControl = event.target.closest("[data-style-mode]");
  if (styleModeControl) {
    const editor = styleModeControl.closest("[data-style-editor]");
    if (!editor) return;
    const defaults = {
      preset: "muted",
      object: {},
      conditional: { when: defaultCondition("notEmpty"), value: "muted", else: "" }
    };
    const path = decodePath(editor.dataset.stylePath);
    post({ type: "set", path, value: defaults[styleModeControl.value] || "" });
    return;
  }
  const styleControl = event.target.closest("[data-style-value], [data-style-json], [data-style-result], [data-style-condition-key]");
  if (styleControl) {
    const editor = styleControl.closest("[data-style-editor]");
    if (editor) commitStyleEditor(editor);
    return;
  }
  const branchType = event.target.closest("[data-action-branch-type]");
  if (branchType) {
    const row = branchType.closest(".branch-action");
    if (row) row.querySelector("[data-action-branch-json]").value = pretty({ [branchType.value]: actionDefaults(branchType.value) });
    commitActionBranches();
    return;
  }
  const branchJson = event.target.closest("[data-action-branch-json]");
  if (branchJson) { commitActionBranches(); return; }
  const actionType = event.target.closest("[data-action-type]");
  if (actionType && model.selectedAction) { post({ type: "set", path: model.selectedAction.path, value: { [actionType.value]: actionDefaults(actionType.value) } }); return; }
  const actionField = event.target.closest("[data-action-field]");
  if (actionField && model.selectedAction) {
    const config = Object.assign({}, model.selectedAction.config || {});
    const raw = actionField.value;
    if (raw.trim() === "") delete config[actionField.dataset.actionField];
    else if (actionField.dataset.kind === "json" || actionField.dataset.kind === "value") {
      try {
        config[actionField.dataset.actionField] = actionField.dataset.kind === "value" ? parseEditorValue(raw) : JSON.parse(raw);
      } catch { return; }
    } else if (actionField.dataset.kind === "number") {
      const number = Number(raw);
      if (!Number.isFinite(number)) return;
      config[actionField.dataset.actionField] = number;
    }
    else config[actionField.dataset.actionField] = raw;
    const actionValue = model.selectedAction.name === "notify" ? config.value : config;
    post({ type: "set", path: model.selectedAction.path, value: { [model.selectedAction.name]: actionValue } });
    return;
  }
  const field = event.target.closest("[data-field]");
  if (!field) return;
  const raw = field.value;
  if (field.dataset.kind !== "select" && raw === "" && field.dataset.present === "false") return;
  let value = raw;
  if (field.dataset.kind === "boolean") value = raw === "" ? undefined : raw === "true";
  if (field.dataset.kind === "number") value = raw === "" ? undefined : Number(raw);
  if (field.dataset.kind === "json") {
    value = raw.trim() === "" ? undefined : parseEditorValue(raw);
  }
  if (field.dataset.kind === "value") value = parseEditorValue(raw);
  if (value === undefined) post({ type: "delete", path: decodePath(field.dataset.path) });
  else post({ type: "set", path: decodePath(field.dataset.path), value });
});
window.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "model") { model = event.data.model; render(); }
  if (event.data.type === "error") document.getElementById("banner").innerHTML = '<div class="banner">保存失败：' + esc(event.data.message) + '</div>';
});
initHoverWidget();
render();
vscode.postMessage({ type: "ready" });
</script>
</body>
</html>`;
}

module.exports = {
  ACTIONS,
  COMPONENTS,
  EVENTS,
  applyVisualOperation,
  buildVisualModel,
  createVisualEditorHtml
};
