const YAML = require("yaml");

const COMPONENTS = new Set(["text", "input", "column", "row", "panel", "list", "divider", "spacer"]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeClass(value) {
  return String(value ?? "").replace(/[^A-Za-z0-9_-]/g, "-");
}

function parseLiteral(value) {
  const input = String(value).trim();
  if ((input.startsWith('"') && input.endsWith('"')) || (input.startsWith("'") && input.endsWith("'"))) {
    return input.slice(1, -1);
  }
  if (input === "true") return true;
  if (input === "false") return false;
  if (input === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(input)) return Number(input);
  return undefined;
}

function splitArguments(value) {
  const result = [];
  let start = 0;
  let quote = null;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

function splitPath(value) {
  return String(value)
    .trim()
    .replace(/^\$/, "")
    .split(".")
    .flatMap((part) => {
      const matches = part.match(/[^\[\]]+|\[(\d+)\]/g);
      return matches ? matches.map((match) => match.replace(/^\[|\]$/g, "")) : [];
    })
    .filter(Boolean);
}

function isPathReference(value) {
  if (typeof value !== "string") return false;
  return /^(data|state|params|page|item|key|index|app)(\.|$)/.test(value.trim().replace(/^\$/, ""));
}

function readPath(path, context) {
  if (path == null || path === "") return undefined;
  if (typeof path !== "string") return path;
  const parts = splitPath(path);
  const rootName = parts.shift();
  const roots = {
    data: context.data,
    state: context.state,
    params: context.params,
    page: context.params,
    item: context.item,
    key: context.key,
    index: context.index,
    app: context.app
  };
  let value = roots[rootName];
  if (value === undefined) return undefined;
  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }
  return value;
}

function readReference(value, context) {
  if (value && typeof value === "object") return resolveValue(value, context);
  if (typeof value === "string" && isPathReference(value)) return readPath(value, context);
  if (typeof value === "string" && value.startsWith("$") && isPathReference(value.slice(1))) {
    return readPath(value.slice(1), context);
  }
  return value;
}

function evaluateExpression(expression, context) {
  const input = String(expression).trim();
  const literal = parseLiteral(input);
  if (literal !== undefined || input === "null") return literal;

  const call = input.match(/^([A-Za-z][\w]*)\((.*)\)$/);
  if (call) {
    const args = splitArguments(call[2]).map((argument) => evaluateExpression(argument, context));
    switch (call[1]) {
      case "if":
        return evaluateCondition(args[0], context) ? args[1] : args[2];
      case "count":
      case "length":
        return Array.isArray(args[0]) || typeof args[0] === "string"
          ? args[0].length
          : args[0] && typeof args[0] === "object"
            ? Object.keys(args[0]).length
            : 0;
      case "upper":
        return String(args[0] ?? "").toUpperCase();
      case "lower":
        return String(args[0] ?? "").toLowerCase();
      case "default":
        return args[0] === undefined || args[0] === null || args[0] === "" ? args[1] : args[0];
      default:
        return "";
    }
  }

  return readPath(input, context);
}

function renderTemplate(template, context) {
  return String(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression) => {
    const value = evaluateExpression(expression, context);
    return value == null ? "" : String(value);
  });
}

function resolveValue(value, context) {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, context));
  if (value && typeof value === "object") {
    if (Object.hasOwn(value, "bind")) return readPath(value.bind, context);
    if (Object.hasOwn(value, "template")) return renderTemplate(value.template, context);
    if (Object.hasOwn(value, "itemAt")) {
      const list = readReference(value.itemAt.list, context) || [];
      const index = Number(readReference(value.itemAt.index, context) || 0);
      const item = list[index];
      return value.itemAt.key ? item?.[value.itemAt.key] : item;
    }
    if (Object.hasOwn(value, "trim")) return String(resolveValue(value.trim, context) ?? "").trim();
    if (Object.hasOwn(value, "count")) {
      const list = readReference(value.count, context);
      return Array.isArray(list) || typeof list === "string" ? list.length : 0;
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, context)]));
  }
  if (typeof value === "string" && value.includes("{{")) return renderTemplate(value, context);
  if (typeof value === "string" && value.startsWith("$") && isPathReference(value.slice(1))) {
    return readPath(value.slice(1), context);
  }
  return value;
}

function evaluateCondition(condition, context) {
  if (typeof condition === "string") {
    const literal = parseLiteral(condition);
    if (literal !== undefined) return Boolean(literal);
    return Boolean(readReference(condition, context));
  }
  if (!condition || typeof condition !== "object") return Boolean(condition);
  if (Object.hasOwn(condition, "notEmpty")) {
    const value = readReference(condition.notEmpty, context);
    return value !== undefined && value !== null && String(value).length > 0;
  }
  if (Object.hasOwn(condition, "empty")) return !evaluateCondition({ notEmpty: condition.empty }, context);
  if (Object.hasOwn(condition, "equals")) {
    const values = Array.isArray(condition.equals)
      ? condition.equals
      : [condition.equals.left, condition.equals.right];
    return resolveValue(values[0], context) === resolveValue(values[1], context);
  }
  if (Object.hasOwn(condition, "notEquals")) return !evaluateCondition({ equals: condition.notEquals }, context);
  if (Object.hasOwn(condition, "all")) return condition.all.every((item) => evaluateCondition(item, context));
  if (Object.hasOwn(condition, "any")) return condition.any.some((item) => evaluateCondition(item, context));
  if (Object.hasOwn(condition, "not")) return !evaluateCondition(condition.not, context);
  if (Object.hasOwn(condition, "truthy")) return Boolean(readReference(condition.truthy, context));
  return Boolean(resolveValue(condition, context));
}

function renderTextSpec(value, context) {
  if (value == null) return "";
  if (typeof value === "object") return String(resolveValue(value, context) ?? "");
  if (typeof value === "string" && value.includes("{{")) return renderTemplate(value, context);
  if (typeof value === "string" && isPathReference(value)) return String(readPath(value, context) ?? "");
  return String(value);
}

function resolveStyle(style, context) {
  if (!style || typeof style !== "object") return style;
  if (style.when !== undefined) return evaluateCondition(style.when, context) ? style.value : style.else;
  if (style.condition !== undefined) return evaluateCondition(style.condition, context) ? style.value : style.else;
  return resolveValue(style, context);
}

function cssLength(value, multiplier = 0.25) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.max(0, number) * multiplier}rem` : "0rem";
}

function cssSpacing(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map((item) => cssLength(item)).join(" ");
  return cssLength(value);
}

function componentClass(type, node, context, extra = "") {
  const style = resolveStyle(node.style, context);
  const classes = ["component", `component-${safeClass(type)}`];
  if (style) classes.push(`theme-${safeClass(style)}`);
  if (node.flex) classes.push("is-flex");
  if (extra) classes.push(extra);
  return classes.join(" ");
}

function componentStyle(node) {
  const styles = [];
  const padding = cssSpacing(node.padding);
  if (padding) styles.push(`padding:${padding}`);
  if (node.gap !== undefined) styles.push(`gap:${cssLength(node.gap)}`);
  return styles.join(";");
}

function styleAttribute(value) {
  return value ? ` style="${escapeHtml(value)}"` : "";
}

function renderNode(node, context) {
  if (node == null || node === false) return "";
  if (Array.isArray(node)) {
    return `<div class="component component-column">${node.map((child) => renderNode(child, context)).join("")}</div>`;
  }
  if (typeof node !== "object") return `<div class="component component-text">${escapeHtml(node)}</div>`;
  if (node.visible !== undefined && !evaluateCondition(node.visible, context)) return "";

  const type = node.type || "text";
  if (!COMPONENTS.has(type)) {
    return `<div class="preview-error">不支持的布局组件：${escapeHtml(type)}</div>`;
  }

  switch (type) {
    case "text": {
      const value = node.bind !== undefined
        ? String(readPath(node.bind, context) ?? "")
        : node.template !== undefined
          ? renderTemplate(node.template, context)
          : renderTextSpec(node.value, context);
      return `<div class="${componentClass(type, node, context)}"${styleAttribute(componentStyle(node))}>${escapeHtml(value)}</div>`;
    }
    case "input": {
      const value = node.bind !== undefined
        ? String(readPath(node.bind, context) ?? "")
        : renderTextSpec(node.value, context);
      const display = value || node.placeholder || "";
      const className = value ? "input-value" : "input-placeholder";
      return `<div class="${componentClass(type, node, context)}"${styleAttribute(componentStyle(node))}><span class="${className}">${escapeHtml(display)}</span><span class="input-cursor">▌</span></div>`;
    }
    case "divider": {
      const character = String(node.character || "─").repeat(80).slice(0, 80);
      return `<div class="${componentClass(type, node, context)}"${styleAttribute(componentStyle(node))}>${escapeHtml(character)}</div>`;
    }
    case "spacer":
      return `<div class="${componentClass(type, node, context)}" style="height:${cssLength(node.height || node.lines || 1, 0.5)}"></div>`;
    case "column":
    case "row": {
      const children = Array.isArray(node.children) ? node.children : [];
      return `<div class="${componentClass(type, node, context)}"${styleAttribute(componentStyle(node))}>${children.map((child) => renderNode(child, context)).join("")}</div>`;
    }
    case "panel": {
      const child = node.child !== undefined
        ? node.child
        : { type: "column", children: Array.isArray(node.children) ? node.children : [] };
      const title = node.title === undefined ? "" : renderTextSpec(node.title, context);
      return `<section class="${componentClass(type, node, context)}"${styleAttribute(componentStyle(node))}>${title ? `<div class="panel-title">${escapeHtml(title)}</div>` : ""}<div class="panel-body">${renderNode(child, context)}</div></section>`;
    }
    case "list": {
      const values = readReference(node.items !== undefined ? node.items : node.bind, context);
      const items = Array.isArray(values) ? values : [];
      if (!items.length) {
        return `<div class="${componentClass(type, node, context)}"${styleAttribute(componentStyle(node))}><div class="list-empty">${escapeHtml(node.emptyText || "暂无内容")}</div></div>`;
      }
      const selected = Math.max(0, Math.min(items.length - 1, Number(readReference(node.selected, context) ?? 0)));
      const body = items.map((item, index) => {
        const itemContext = { ...context, item, index };
        const label = node.label === undefined
          ? String(item?.label ?? item?.title ?? item ?? "")
          : renderTextSpec(node.label, itemContext);
        const description = node.description === undefined ? "" : renderTextSpec(node.description, itemContext);
        const itemStyle = resolveStyle(item.style || node.itemStyle, itemContext);
        const selectedClass = index === selected ? ` is-selected theme-${safeClass(node.selectedStyle || "selected")}` : "";
        const itemClass = `list-item${selectedClass}${itemStyle ? ` theme-${safeClass(itemStyle)}` : ""}`;
        return `<div class="${itemClass}"><span class="list-marker">${index === selected ? "❯" : " "}</span><span class="list-content"><span>${escapeHtml(label)}</span>${description ? `<small>${escapeHtml(description)}</small>` : ""}</span></div>`;
      }).join("");
      return `<div class="${componentClass(type, node, context)}"${styleAttribute(componentStyle(node))}>${body}</div>`;
    }
    default:
      return "";
  }
}

function normalizeDocument(document) {
  if (document.pages && typeof document.pages === "object" && !Array.isArray(document.pages)) {
    return { data: document.data || {}, pages: document.pages, initial: document.initial };
  }
  if (document.layout !== undefined) {
    const name = document.name || "preview";
    return {
      data: document.data || {},
      pages: { [name]: document },
      initial: name
    };
  }
  return { data: document.data || {}, pages: {}, initial: undefined };
}

function errorBody(message) {
  return `<div class="preview-error-card"><strong>预览暂时无法更新</strong><pre>${escapeHtml(message)}</pre><p>修正 YAML 后，预览会自动恢复。</p></div>`;
}

function renderPreview(source, requestedPage) {
  let document;
  try {
    document = YAML.parse(source) || {};
  } catch (error) {
    const message = `YAML 解析失败：${error.message}`;
    return { pageNames: [], pageName: "", body: errorBody(message), error: message };
  }

  const normalized = normalizeDocument(document);
  const pageNames = Object.keys(normalized.pages);
  if (!pageNames.length) {
    const message = "没有找到 pages 或 layout。请打开 app.yaml，或在独立页面中提供 layout。";
    return { pageNames: [], pageName: "", body: errorBody(message), error: message };
  }

  const pageName = requestedPage && pageNames.includes(requestedPage)
    ? requestedPage
    : pageNames.includes(normalized.initial)
      ? normalized.initial
      : pageNames[0];
  const page = normalized.pages[pageName];
  if (!page || typeof page !== "object") {
    const message = `页面 ${pageName} 是外部文件引用；当前预览需要页面内容直接写在这个 YAML 文件中。`;
    return { pageNames, pageName, body: errorBody(message), error: message };
  }

  const context = {
    data: normalized.data,
    state: page.state || document.state || {},
    params: page.params || document.params || {},
    app: document,
    item: undefined,
    key: undefined,
    index: undefined
  };
  const layout = page.layout;
  const title = page.title === undefined ? pageName : renderTextSpec(page.title, context);
  const body = layout === undefined
    ? errorBody(`页面 ${pageName} 没有 layout。`)
    : `<div class="page-title">${escapeHtml(title)}</div>${renderNode(layout, context)}`;
  return { pageNames, pageName, body, error: layout === undefined ? `页面 ${pageName} 没有 layout。` : null };
}

function createPreviewHtml(model, nonce = "page-tui-preview") {
  const options = model.pageNames.length
    ? model.pageNames.map((name) => `<option value="${escapeHtml(name)}"${name === model.pageName ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")
    : '<option value="">没有可预览的页面</option>';
  const initialStatus = model.error ? "YAML 或页面结构有问题" : "实时同步";
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; color: #d7e0e5; background: #11181d; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.toolbar { display: flex; align-items: center; gap: 10px; margin: 0 auto 14px; max-width: 980px; color: #9daeb8; font-size: 12px; }
.toolbar strong { color: #e9f1f4; font-size: 14px; }
.toolbar select { min-width: 150px; padding: 5px 8px; border: 1px solid #40515a; border-radius: 5px; color: #e9f1f4; background: #1d2930; }
.toolbar .status { margin-left: auto; color: #8aa6a0; }
.preview-frame { width: min(100%, 980px); min-height: 520px; margin: 0 auto; padding: 22px; overflow: auto; border: 1px solid #36464e; border-radius: 9px; background: #0b1115; box-shadow: 0 12px 36px rgba(0, 0, 0, .25); font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace; line-height: 1.45; }
.page-title { margin-bottom: 16px; color: #6ed6e8; font-weight: 700; }
.component { min-width: 0; }
.component-column { display: flex; flex-direction: column; }
.component-row { display: flex; align-items: flex-start; }
.component-row > .component { min-width: 0; }
.component-row > .is-flex { flex: 1 1 0; }
.component-column > .is-flex { flex: 1 1 auto; }
.component-text { white-space: pre-wrap; }
.component-input { min-height: 1.45em; }
.input-placeholder { color: #71838d; }
.input-cursor { color: #f0d47b; animation: blink 1.1s steps(2, start) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.component-divider { overflow: hidden; color: #54656d; white-space: nowrap; }
.component-spacer { min-height: 2px; }
.component-panel { margin: 4px 0; border: 1px solid #53656e; border-radius: 5px; overflow: hidden; }
.panel-title { padding: 4px 10px; color: #78dce9; border-bottom: 1px solid #33434b; background: #142027; }
.panel-body { padding: 8px 10px; }
.component-panel.is-flex { min-height: 100px; }
.component-list { display: flex; flex-direction: column; }
.list-item { display: flex; gap: 8px; min-height: 1.55em; padding: 2px 6px; border-radius: 3px; }
.list-item.is-selected { color: #081216; background: #63d2df; font-weight: 700; }
.list-marker { width: 1em; color: #84dce6; }
.list-item.is-selected .list-marker { color: #081216; }
.list-content { display: flex; flex-direction: column; min-width: 0; }
.list-content small { color: #91a2aa; font-size: .86em; font-weight: 400; }
.list-item.is-selected small { color: #24464c; }
.list-empty { color: #83949d; font-style: italic; }
.theme-title { color: #6ed6e8; font-weight: 700; }
.theme-primary { color: #60cde0; }
.theme-selected { color: #081216; background: #63d2df; }
.theme-muted { color: #83949d; }
.theme-border { color: #8498a1; }
.theme-success { color: #78d69b; }
.theme-warning { color: #f0d47b; }
.theme-danger { color: #ff7f87; }
.theme-input { color: #f3f7f8; text-decoration: underline; text-decoration-color: #6ed6e8; }
.preview-error-card { max-width: 760px; padding: 16px; border: 1px solid #9b4d57; border-radius: 6px; color: #ffb2b7; background: #2b171c; }
.preview-error-card strong { display: block; margin-bottom: 10px; color: #ff7f87; }
.preview-error-card pre { margin: 0; overflow: auto; white-space: pre-wrap; font-family: inherit; }
.preview-error-card p { margin: 12px 0 0; color: #c58e94; }
</style>
</head>
<body>
<div class="toolbar"><strong>Page TUI 实时预览</strong><label for="page">页面</label><select id="page" ${model.pageNames.length ? "" : "disabled"}>${options}</select><span id="status" class="status">${initialStatus}</span></div>
<main id="preview" class="preview-frame">${model.body}</main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const pageSelect = document.getElementById("page");
const preview = document.getElementById("preview");
const status = document.getElementById("status");
pageSelect.addEventListener("change", () => vscode.postMessage({ type: "selectPage", page: pageSelect.value }));
window.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.type !== "update") return;
  preview.innerHTML = message.body;
  pageSelect.replaceChildren();
  for (const name of message.pageNames) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    option.selected = name === message.pageName;
    pageSelect.append(option);
  }
  pageSelect.disabled = message.pageNames.length === 0;
  status.textContent = message.error ? "YAML 或页面结构有问题" : "实时同步";
});
vscode.postMessage({ type: "ready" });
</script>
</body>
</html>`;
}

module.exports = {
  createPreviewHtml,
  escapeHtml,
  renderPreview
};
