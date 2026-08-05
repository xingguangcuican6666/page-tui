const YAML = require("yaml");

const COMPONENTS = new Set(["text", "input", "column", "row", "panel", "list", "divider", "spacer", "popup", "progress"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

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
  return /^(data|state|params|page|item|key|index|app|env)(\.|$)/.test(value.trim().replace(/^\$/, ""));
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
    app: context.app,
    env: context.runtime?.env
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

function lookupTranslationPath(value, key) {
  if (!isObject(value) && !Array.isArray(value)) return undefined;
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  let current = value;
  for (const part of splitPath(key)) {
    if (current == null || !Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

function localeCandidates(locale, fallback) {
  const result = [];
  const add = (value) => {
    if (typeof value !== "string" || !value.trim() || result.includes(value)) return;
    result.push(value);
    const base = value.split(value.includes("-") ? "-" : "_")[0];
    if (base && !result.includes(base)) result.push(base);
  };
  add(locale);
  add(fallback);
  return result;
}

function resolveLocaleSpec(spec, context) {
  if (isObject(spec)) {
    if (Object.hasOwn(spec, "bind")) return readPath(spec.bind, context);
    if (Object.hasOwn(spec, "value")) return spec.value;
  }
  if (typeof spec === "string" && isPathReference(spec)) return readPath(spec, context);
  if (typeof spec === "string" && spec.startsWith("$") && isPathReference(spec.slice(1))) {
    return readPath(spec.slice(1), context);
  }
  return spec;
}

function createPreviewI18n(definition = {}, externalLocales = {}) {
  const config = isObject(definition) ? definition : {};
  const sources = config.locales || config.files || config.sources;
  const locales = {};
  for (const [locale, source] of Object.entries(isObject(sources) ? sources : {})) {
    if (isObject(source)) locales[locale] = source;
    else if (isObject(externalLocales[locale])) locales[locale] = externalLocales[locale];
  }
  const fallback = config.fallback || config.default || Object.keys(locales)[0];
  const localeSpec = config.locale ?? config.language;
  return {
    translate(key, context = {}) {
      const selected = resolveLocaleSpec(localeSpec, context);
      const locale = selected == null || selected === "" ? fallback : String(selected);
      for (const candidate of localeCandidates(locale, fallback)) {
        const message = lookupTranslationPath(locales[candidate], String(key));
        if (message !== undefined) return message;
      }
      return String(key ?? "");
    }
  };
}

function isTranslationSpec(value) {
  return isObject(value) && (Object.hasOwn(value, "t") || Object.hasOwn(value, "i18n"));
}

function translateSpec(spec, context) {
  const key = resolveValue(spec.t ?? spec.i18n, context);
  if (key == null || key === "") return "";
  const values = spec.with === undefined && spec.params === undefined
    ? undefined
    : resolveValue(spec.with ?? spec.params, context);
  const nextContext = isObject(values)
    ? { ...context, params: { ...(context.params || {}), ...values } }
    : context;
  const translated = context.runtime?.i18n?.translate
    ? context.runtime.i18n.translate(key, context)
    : key;
  if (typeof translated === "string") return renderTemplate(translated, nextContext);
  return resolveValue(translated, nextContext);
}

function evaluateExpression(expression, context) {
  const input = String(expression).trim();
  const literal = parseLiteral(input);
  if (literal !== undefined || input === "null") return literal;

  const call = input.match(/^([A-Za-z][\w]*)\((.*)\)$/);
  if (call) {
    const args = splitArguments(call[2]).map((argument) => evaluateExpression(argument, context));
    switch (call[1]) {
      case "t":
        return translateSpec({ t: args[0] }, context);
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
    if (isTranslationSpec(value)) return translateSpec(value, context);
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
  if (typeof value === "string" && isPathReference(value)) return readPath(value, context);
  if (typeof value === "string" && value.startsWith("$") && isPathReference(value.slice(1))) {
    return readPath(value.slice(1), context);
  }
  return value;
}

function resolveNavigation(config, context) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { page: resolveValue(config, context), params: {} };
  }
  return {
    page: resolveValue(config.page ?? config.route, context),
    params: resolveValue(config.params || {}, context)
  };
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
      const inputPath = typeof node.bind === "string" ? ` data-preview-input="${escapeHtml(node.bind)}"` : "";
      const className = value ? "input-value" : "input-placeholder";
      const placeholder = node.placeholder === undefined ? "" : renderTextSpec(node.placeholder, context);
      const inputType = node.mask ? "password" : "text";
      return `<input type="${inputType}" class="${componentClass(type, node, context)} ${className}"${styleAttribute(componentStyle(node))}${inputPath} value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" spellcheck="false">`;
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
    case "popup": {
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const child = node.child !== undefined
        ? node.child
        : hasChildren
          ? { type: "column", children: node.children }
          : { type: "text", value: node.message ?? node.value ?? "" };
      const title = node.title === undefined ? "" : renderTextSpec(node.title, context);
      const width = Number(node.width);
      const popupStyle = Number.isFinite(width) && width > 0 ? ` style="max-width:${Math.max(16, width)}ch"` : "";
      return `<div class="${componentClass(type, node, context)}"><section class="popup-card"${popupStyle}>${title ? `<div class="panel-title">${escapeHtml(title)}</div>` : ""}<div class="panel-body">${renderNode(child, context)}</div></section></div>`;
    }
    case "progress": {
      const rawValue = node.bind !== undefined
        ? readReference(node.bind, context)
        : readReference(node.value ?? 0, context);
      const rawMax = readReference(node.max ?? 100, context);
      const max = Number.isFinite(Number(rawMax)) && Number(rawMax) > 0 ? Number(rawMax) : 100;
      const value = Math.max(0, Math.min(max, Number(rawValue) || 0));
      const percent = Math.round(value / max * 100);
      const label = node.label === undefined ? "" : renderTextSpec(node.label, context);
      const showValue = node.showValue === undefined || readReference(node.showValue, context) !== false;
      return `<div class="${componentClass(type, node, context)}"${styleAttribute(componentStyle(node))}>${label ? `<span class="progress-label">${escapeHtml(label)}</span>` : ""}<span class="progress-track"><span class="progress-fill" style="width:${percent}%"></span></span>${showValue ? `<span class="progress-value">${percent}%</span>` : ""}</div>`;
    }
    case "list": {
      const values = readReference(node.items !== undefined ? node.items : node.bind, context);
      const items = Array.isArray(values) ? values : [];
      if (!items.length) {
        const emptyText = node.emptyText === undefined ? "暂无内容" : renderTextSpec(node.emptyText, context);
        return `<div class="${componentClass(type, node, context)}"${styleAttribute(componentStyle(node))}><div class="list-empty">${escapeHtml(emptyText)}</div></div>`;
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
        const listPath = typeof node.selected === "string" ? node.selected : "";
        return `<div data-preview-list-item="${index}" data-preview-list-path="${escapeHtml(listPath)}" class="${itemClass}"><span class="list-marker">${index === selected ? "❯" : " "}</span><span class="list-content"><span>${escapeHtml(label)}</span>${description ? `<small>${escapeHtml(description)}</small>` : ""}</span></div>`;
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

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function writePath(path, value, context) {
  const parts = splitPath(path);
  const rootName = parts.shift();
  const roots = {
    data: context.data,
    state: context.state,
    params: context.params,
    page: context.params,
    env: context.runtime?.env
  };
  const root = roots[rootName];
  if (!root || !parts.length) return false;
  let target = root;
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== "object") target[part] = {};
    target = target[part];
  }
  target[parts.at(-1)] = value;
  return true;
}

function actionEntry(action) {
  if (typeof action === "string") return { name: action, config: {} };
  if (!action || typeof action !== "object") return undefined;
  if (action.do) return { name: action.do, config: action };
  const names = ["set", "move", "toggle", "remove", "append", "backspace", "push", "go", "replace", "reset", "pop", "quit", "call", "refresh", "notify", "if"];
  const name = names.find((candidate) => Object.hasOwn(action, candidate));
  return name ? { name, config: action[name] } : undefined;
}

function actionList(actions) {
  if (!actions) return [];
  return Array.isArray(actions) ? actions : [actions];
}

function errorBody(message) {
  return `<div class="preview-error-card"><strong>预览暂时无法更新</strong><pre>${escapeHtml(message)}</pre><p>修正 YAML 后，预览会自动恢复。</p></div>`;
}

function renderDocument(document, requestedPage, overrides = {}, options = {}) {
  const normalized = normalizeDocument(document);
  const pageNames = Object.keys(normalized.pages);
  if (!pageNames.length) {
    const message = "没有找到 pages 或 layout。请打开 app.yaml，或在独立页面中提供 layout。";
    return {
      pageNames: [],
      pageName: "",
      body: errorBody(message),
      error: message,
      variables: { data: normalized.data, state: {}, params: {} }
    };
  }

  const pageName = requestedPage && pageNames.includes(requestedPage)
    ? requestedPage
    : pageNames.includes(normalized.initial)
      ? normalized.initial
      : pageNames[0];
  const page = normalized.pages[pageName];
  if (!page || typeof page !== "object") {
    const message = `页面 ${pageName} 是外部文件引用；当前预览需要页面内容直接写在这个 YAML 文件中。`;
    return {
      pageNames,
      pageName,
      body: errorBody(message),
      error: message,
      variables: { data: normalized.data, state: {}, params: {} }
    };
  }

  const context = {
    data: overrides.data || normalized.data,
    state: Object.hasOwn(overrides, "state") ? overrides.state : page.state || document.state || {},
    params: Object.hasOwn(overrides, "params") ? overrides.params : page.params || document.params || {},
    app: document,
    runtime: overrides.runtime || {
      i18n: options.i18n || createPreviewI18n(document.i18n, options.locales),
      env: options.env || {}
    },
    item: undefined,
    key: undefined,
    index: undefined
  };
  const layout = page.layout;
  const title = page.title === undefined ? pageName : renderTextSpec(page.title, context);
  const body = layout === undefined
    ? errorBody(`页面 ${pageName} 没有 layout。`)
    : `<div class="page-title">${escapeHtml(title)}</div>${renderNode(layout, context)}`;
  return {
    pageNames,
    pageName,
    body,
    error: layout === undefined ? `页面 ${pageName} 没有 layout。` : null,
    variables: { data: context.data, state: context.state, params: context.params }
  };
}

function renderPreview(source, requestedPage, options = {}) {
  let document;
  try {
    document = YAML.parse(source) || {};
  } catch (error) {
    const message = `YAML 解析失败：${error.message}`;
    return { pageNames: [], pageName: "", body: errorBody(message), error: message, variables: {} };
  }
  return renderDocument(document, requestedPage, {}, options);
}

function createPreviewSession(source, requestedPage, options = {}) {
  let document;
  let parseError;
  try {
    document = YAML.parse(source) || {};
  } catch (error) {
    parseError = error;
  }

  if (parseError) {
    return {
      dispatch: () => renderPreview(source, requestedPage, options),
      model: () => renderPreview(source, requestedPage, options),
      reset: () => undefined
    };
  }

  const normalized = normalizeDocument(document);
  const i18n = options.i18n || createPreviewI18n(document.i18n, options.locales);
  const pageNames = Object.keys(normalized.pages);
  let pageName = requestedPage && pageNames.includes(requestedPage)
    ? requestedPage
    : pageNames.includes(normalized.initial)
      ? normalized.initial
      : pageNames[0];
  const initialPageName = pageName;
  const initialData = cloneValue(normalized.data);
  const initialEnvironment = cloneValue(options.env || {});
  let environment = cloneValue(initialEnvironment);
  let state;
  let params;
  const stack = [];

  function pageDefinition(name) {
    const page = normalized.pages[name];
    return page && typeof page === "object" ? page : undefined;
  }

  function loadPage(name, nextParams) {
    const page = pageDefinition(name);
    if (!page) return false;
    pageName = name;
    state = cloneValue(page.state || document.state || {});
    params = cloneValue(nextParams ?? page.params ?? document.params ?? {});
    return true;
  }

  if (pageName) loadPage(pageName);

  function reset() {
    normalized.data = cloneValue(initialData);
    environment = cloneValue(initialEnvironment);
    stack.length = 0;
    pageName = initialPageName;
    if (pageName) loadPage(pageName);
  }

  function contextFor(key, index) {
    return {
      data: normalized.data,
      state,
      params,
      app: document,
      runtime: { i18n, env: environment },
      key,
      index
    };
  }

  function openPage(name, nextParams, mode) {
    if (!pageDefinition(name)) return;
    if (mode === "push") stack.push({ pageName, state, params });
    if (mode === "reset") stack.length = 0;
    loadPage(name, nextParams);
  }

  function runActions(actions, context) {
    for (const action of actionList(actions)) {
      const entry = actionEntry(action);
      if (!entry) continue;
      const { name, config } = entry;
      switch (name) {
        case "set":
          if (config && typeof config === "object" && Object.hasOwn(config, "path")) {
            writePath(config.path, resolveValue(config.value, context), context);
          } else {
            for (const [path, value] of Object.entries(config || {})) {
              writePath(path, resolveValue(value, context), context);
            }
          }
          break;
        case "move": {
          const path = config?.path;
          const current = Number(readPath(path, context) || 0);
          const by = Number(resolveValue(config?.by ?? 1, context));
          const list = readReference(config?.list || config?.within, context);
          const max = Array.isArray(list) ? Math.max(0, list.length - 1) : Number.MAX_SAFE_INTEGER;
          writePath(path, Math.min(max, Math.max(0, current + by)), context);
          break;
        }
        case "toggle":
          if (typeof config === "string") writePath(config, !readPath(config, context), context);
          else if (config?.path) writePath(config.path, !readPath(config.path, context), context);
          else {
            const list = readReference(config?.list || config?.within, context);
            const index = Number(readReference(config?.index, context) ?? 0);
            if (Array.isArray(list) && list[index] && config?.field) list[index][config.field] = !list[index][config.field];
          }
          break;
        case "remove": {
          const list = readReference(config?.list || config?.within, context);
          const index = Number(readReference(config?.index, context) ?? 0);
          if (Array.isArray(list) && index >= 0 && index < list.length) list.splice(index, 1);
          break;
        }
        case "append":
          if (config?.path) {
            const current = readPath(config.path, context) || "";
            writePath(config.path, `${current}${resolveValue(config.value, context) ?? ""}`, context);
          } else {
            const list = readReference(config?.list, context);
            if (Array.isArray(list)) list.push(resolveValue(config.value, context));
          }
          break;
        case "backspace": {
          const path = typeof config === "string" ? config : config?.path;
          const value = String(readPath(path, context) ?? "");
          writePath(path, Array.from(value).slice(0, -1).join(""), context);
          break;
        }
        case "push":
        case "go": {
          const { page, params } = resolveNavigation(config, context);
          openPage(page, params, "push");
          break;
        }
        case "replace": {
          const { page, params } = resolveNavigation(config, context);
          openPage(page, params, "replace");
          break;
        }
        case "reset": {
          const { page, params } = resolveNavigation(config, context);
          openPage(page, params, "reset");
          break;
        }
        case "pop":
          if (stack.length) {
            const previous = stack.pop();
            pageName = previous.pageName;
            state = previous.state;
            params = previous.params;
          }
          break;
        case "notify":
          writePath("state.notice", resolveValue(config, context), context);
          break;
        case "if":
          runActions(evaluateCondition(config?.condition, context) ? config?.then : config?.else, context);
          break;
        case "call":
        case "refresh":
        case "quit":
          break;
        default:
          break;
      }
    }
  }

  function model() {
    if (!pageName) return renderDocument(document, requestedPage, {}, { i18n });
    return renderDocument(document, pageName, {
      data: normalized.data,
      state,
      params,
      runtime: { i18n, env: environment }
    }, { i18n });
  }

  function dispatch(event = {}) {
    if (event.type === "selectPage") {
      stack.length = 0;
      loadPage(event.page);
      return model();
    }
    if (event.type === "selectList") {
      if (event.path) writePath(event.path, Number(event.index) || 0, contextFor());
      return model();
    }
    if (event.type === "input") {
      if (event.path) writePath(event.path, String(event.value ?? ""), contextFor());
      return model();
    }
    if (event.type === "key") {
      const page = pageDefinition(pageName);
      const keys = page?.keys && typeof page.keys === "object" ? page.keys : {};
      const key = String(event.key || "");
      const actions = Object.hasOwn(keys, key) ? keys[key] : key.length === 1 ? keys.character : undefined;
      const keyObject = { value: event.value ?? (key.length === 1 ? key : "") };
      runActions(actions, contextFor(keyObject));
      return model();
    }
    return model();
  }

  return { dispatch, model, reset };
}

function createPreviewHtml(model, nonce = "page-tui-preview") {
  const options = model.pageNames.length
    ? model.pageNames.map((name) => `<option value="${escapeHtml(name)}"${name === model.pageName ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")
    : '<option value="">没有可预览的页面</option>';
  const initialStatus = model.error ? "YAML 或页面结构有问题" : "实时同步";
  const variables = (JSON.stringify(model.variables || {}) || "{}")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
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
.toolbar button { padding: 5px 9px; border: 1px solid #40515a; border-radius: 5px; color: #e9f1f4; background: #1d2930; cursor: pointer; }
.toolbar button:hover { border-color: #6ed6e8; background: #24353d; }
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
.component-input { display: block; width: 100%; min-height: 1.45em; padding: 0; border: 0; outline: 1px solid transparent; color: #f3f7f8; background: transparent; font: inherit; }
.component-input:focus { outline: 1px solid #55757d; border-radius: 2px; }
.input-placeholder { color: #71838d; }
.component-divider { overflow: hidden; color: #54656d; white-space: nowrap; }
.component-spacer { min-height: 2px; }
.component-panel { margin: 4px 0; border: 1px solid #53656e; border-radius: 5px; overflow: hidden; }
.panel-title { padding: 4px 10px; color: #78dce9; border-bottom: 1px solid #33434b; background: #142027; }
.panel-body { padding: 8px 10px; }
.component-panel.is-flex { min-height: 100px; }
.component-popup { display: flex; justify-content: center; align-items: center; min-height: 13rem; padding: 1rem; }
.popup-card { width: min(100%, 34rem); border: 1px solid #6a7b83; border-radius: 6px; overflow: hidden; background: #101a20; box-shadow: 0 18px 48px rgba(0, 0, 0, .35); }
.component-progress { display: flex; align-items: center; gap: 8px; min-height: 1.55em; }
.progress-label { flex: 0 0 auto; }
.progress-track { flex: 1 1 auto; min-width: 5rem; height: .72em; overflow: hidden; border: 1px solid #53656e; background: #172229; }
.progress-fill { display: block; height: 100%; background: #63d2df; }
.progress-value { flex: 0 0 4ch; text-align: right; color: #9fb1b9; }
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
.variables { width: min(100%, 980px); margin: 14px auto 0; border: 1px solid #36464e; border-radius: 6px; background: #101a20; }
.variables summary { padding: 8px 12px; color: #9edce4; cursor: pointer; }
.variables-tree { max-height: 300px; margin: 0; padding: 4px 12px 12px; overflow: auto; color: #b7c8ce; font: 12px/1.45 "Cascadia Code", "SFMono-Regular", Consolas, monospace; }
.variable-group { margin: 0; }
.variable-group > summary { display: flex; align-items: baseline; gap: 8px; min-height: 22px; padding: 2px 0; list-style: none; cursor: pointer; }
.variable-group > summary::-webkit-details-marker { display: none; }
.variable-group > summary::before { content: "▸"; width: 10px; color: #71858e; }
.variable-group[open] > summary::before { content: "▾"; }
.variable-children { margin-left: 5px; padding-left: 13px; border-left: 1px solid #2c3b42; }
.variable-entry { display: flex; align-items: baseline; gap: 8px; min-height: 22px; padding: 2px 0; }
.variable-key { color: #9edce4; }
.variable-colon { color: #61757d; }
.variable-type, .variable-count { color: #71858e; }
.variable-value { min-width: 0; overflow-wrap: anywhere; }
.variable-value-string { color: #ce9178; }
.variable-value-number { color: #b5cea8; }
.variable-value-boolean, .variable-value-null { color: #569cd6; }
.variable-value-undefined, .variable-empty { color: #71858e; font-style: italic; }
.preview-error-card { max-width: 760px; padding: 16px; border: 1px solid #9b4d57; border-radius: 6px; color: #ffb2b7; background: #2b171c; }
.preview-error-card strong { display: block; margin-bottom: 10px; color: #ff7f87; }
.preview-error-card pre { margin: 0; overflow: auto; white-space: pre-wrap; font-family: inherit; }
.preview-error-card p { margin: 12px 0 0; color: #c58e94; }
</style>
</head>
<body>
<div class="toolbar"><strong>Page TUI 实时预览</strong><label for="page">页面</label><select id="page" ${model.pageNames.length ? "" : "disabled"}>${options}</select><button id="reset" type="button">重置预览</button><span id="status" class="status">${initialStatus}</span></div>
<main id="preview" class="preview-frame">${model.body}</main>
<details class="variables" open><summary>实时变量（data / state / params）</summary><div id="variables" class="variables-tree"></div></details>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const initialVariables = ${variables};
const pageSelect = document.getElementById("page");
const resetButton = document.getElementById("reset");
const preview = document.getElementById("preview");
const status = document.getElementById("status");
const variablesView = document.getElementById("variables");
let focusState;
function escapeVariableHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function variableType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
function variableScalar(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "undefined";
  return String(value);
}
function renderVariableNode(key, value, depth = 0, ancestors = [], arrayParent = false) {
  const label = arrayParent ? "[" + key + "]" : key;
  const type = variableType(value);
  if (value === null || typeof value !== "object") {
    return '<div class="variable-entry"><span class="variable-key">' + escapeVariableHtml(label) + '</span><span class="variable-colon">:</span><span class="variable-value variable-value-' + type + '">' + escapeVariableHtml(variableScalar(value)) + '</span></div>';
  }
  if (ancestors.includes(value)) {
    return '<div class="variable-entry"><span class="variable-key">' + escapeVariableHtml(label) + '</span><span class="variable-colon">:</span><span class="variable-value variable-value-undefined">[循环引用]</span></div>';
  }
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);
  const children = entries.length
    ? entries.map(([childKey, childValue]) => renderVariableNode(childKey, childValue, depth + 1, ancestors.concat(value), Array.isArray(value))).join("")
    : '<div class="variable-empty">空</div>';
  return '<details class="variable-group"' + (depth < 1 ? ' open' : '') + '><summary><span class="variable-key">' + escapeVariableHtml(label) + '</span><span class="variable-type">' + type + '</span><span class="variable-count">' + entries.length + '</span></summary><div class="variable-children">' + children + '</div></details>';
}
function renderVariableTree(value) {
  if (!value || typeof value !== "object") return '<div class="variable-empty">暂无变量</div>';
  const entries = Object.entries(value);
  return entries.length
    ? entries.map(([key, child]) => renderVariableNode(key, child)).join("")
    : '<div class="variable-empty">暂无变量</div>';
}
variablesView.innerHTML = renderVariableTree(initialVariables);
pageSelect.addEventListener("change", () => vscode.postMessage({ type: "selectPage", page: pageSelect.value }));
resetButton.addEventListener("click", () => vscode.postMessage({ type: "reset" }));
preview.addEventListener("click", (event) => {
  const item = event.target.closest("[data-preview-list-item]");
  if (!item) return;
  vscode.postMessage({ type: "interaction", event: {
    type: "selectList",
    path: item.dataset.previewListPath,
    index: Number(item.dataset.previewListItem)
  }});
});
preview.addEventListener("input", (event) => {
  const input = event.target.closest("[data-preview-input]");
  if (!input) return;
  focusState = {
    path: input.dataset.previewInput,
    start: input.selectionStart,
    end: input.selectionEnd
  };
  vscode.postMessage({ type: "interaction", event: {
    type: "input",
    path: input.dataset.previewInput,
    value: input.value
  }});
});
document.addEventListener("keydown", (event) => {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
  const input = event.target.closest?.("[data-preview-input]");
  if (input && (event.key.length === 1 || ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key))) return;
  const specialKeys = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Enter: "enter",
    Escape: "escape",
    " ": "space",
    Backspace: "backspace"
  };
  const key = specialKeys[event.key] || (event.key.length === 1 ? event.key : undefined);
  if (!key) return;
  event.preventDefault();
  vscode.postMessage({ type: "interaction", event: {
    type: "key",
    key,
    value: event.key.length === 1 ? event.key : undefined
  }});
});
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
  variablesView.innerHTML = renderVariableTree(message.variables || {});
  if (focusState) {
    const nextInput = Array.from(preview.querySelectorAll("[data-preview-input]"))
      .find((input) => input.dataset.previewInput === focusState.path);
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(focusState.start, focusState.end);
    }
    focusState = undefined;
  }
});
vscode.postMessage({ type: "ready" });
</script>
</body>
</html>`;
}

module.exports = {
  createPreviewHtml,
  createPreviewI18n,
  createPreviewSession,
  escapeHtml,
  renderPreview
};
