const { Page } = require("../core/page");
const ui = require("../ui");
const {
  backspace,
  cloneValue,
  evaluateCondition,
  isPathReference,
  readPath,
  readReference,
  renderTemplate,
  resolveValue,
  writePath
} = require("./value");

const ACTION_NAMES = [
  "set",
  "move",
  "toggle",
  "remove",
  "append",
  "backspace",
  "push",
  "go",
  "replace",
  "reset",
  "pop",
  "quit",
  "call",
  "refresh",
  "notify",
  "if"
];

const VIEW_OPTION_NAMES = [
  "style",
  "padding",
  "gap",
  "flex",
  "title",
  "border",
  "borderStyle",
  "titleStyle",
  "marker",
  "normalMarker",
  "selectedStyle",
  "itemStyle",
  "disabledStyle",
  "emptyText",
  "emptyStyle",
  "character"
];

function pickOptions(node, context) {
  const options = {};
  for (const name of VIEW_OPTION_NAMES) {
    if (node[name] === undefined) continue;
    options[name] = name === "title" ? renderTextSpec(node[name], context) : node[name];
  }
  if (options.style && typeof options.style === "object") options.style = resolveStyle(options.style, context);
  return options;
}

function resolveStyle(style, context) {
  if (!style || typeof style !== "object") return style;
  if (style.when !== undefined) return evaluateCondition(style.when, context) ? style.value : style.else;
  if (style.condition !== undefined) return evaluateCondition(style.condition, context) ? style.value : style.else;
  return resolveValue(style, context);
}

function renderTextSpec(spec, context) {
  if (spec == null) return "";
  if (typeof spec === "object") return String(resolveValue(spec, context) ?? "");
  if (typeof spec === "string" && spec.includes("{{")) return renderTemplate(spec, context);
  if (typeof spec === "string" && isPathReference(spec)) return String(readPath(spec, context) ?? "");
  return String(spec);
}

function compileLayout(node, context) {
  if (node == null || node === false) return null;
  if (Array.isArray(node)) return ui.column(node.map((child) => compileLayout(child, context)).filter(Boolean));
  if (typeof node !== "object") return ui.text(String(node));
  if (node.visible !== undefined && !evaluateCondition(node.visible, context)) return null;

  const type = node.type || "text";
  switch (type) {
    case "text": {
      const value = node.bind !== undefined
        ? String(readPath(node.bind, context) ?? "")
        : node.template !== undefined
          ? renderTemplate(node.template, context)
          : renderTextSpec(node.value, context);
      return ui.text(value, pickOptions(node, context));
    }
    case "input": {
      const value = node.bind !== undefined
        ? String(readPath(node.bind, context) ?? "")
        : renderTextSpec(node.value, context);
      const cursor = node.cursor !== false ? "▌" : "";
      const display = value || (node.placeholder && !value ? node.placeholder : "");
      return ui.text(`${display}${cursor}`, pickOptions(node, context));
    }
    case "divider":
      return ui.divider(pickOptions(node, context));
    case "spacer":
      return ui.spacer(node.height || node.lines || 1, pickOptions(node, context));
    case "column":
      return ui.column((node.children || []).map((child) => compileLayout(child, context)).filter(Boolean), pickOptions(node, context));
    case "row":
      return ui.row((node.children || []).map((child) => compileLayout(child, context)).filter(Boolean), pickOptions(node, context));
    case "panel": {
      const child = node.child !== undefined
        ? compileLayout(node.child, context)
        : compileLayout({ type: "column", children: node.children || [] }, context);
      return ui.panel(child || ui.text(""), pickOptions(node, context));
    }
    case "list":
      return compileList(node, context);
    default:
      throw new Error(`不认识的布局组件：${type}`);
  }
}

function compileList(node, context) {
  const source = node.items !== undefined ? node.items : node.bind;
  const sourceItems = readReference(source, context);
  const items = Array.isArray(sourceItems) ? sourceItems : [];
  const listItems = items.map((item, index) => {
    const itemContext = { ...context, item, index };
    const label = node.label === undefined
      ? String(item?.label ?? item?.title ?? item ?? "")
      : renderTextSpec(node.label, itemContext);
    const description = node.description === undefined
      ? undefined
      : renderTextSpec(node.description, itemContext);
    const style = node.style === undefined ? undefined : resolveStyle(node.style, itemContext);
    return { label, description, style, value: item, index };
  });

  const options = pickOptions(node, context);
  options.selected = Number(readReference(node.selected, context) ?? 0);
  return ui.list(listItems, options);
}

function findAction(action) {
  if (typeof action === "string") return { name: action, config: null };
  if (!action || typeof action !== "object") return null;
  if (action.do) return { name: action.do, config: action };
  const name = ACTION_NAMES.find((candidate) => Object.hasOwn(action, candidate));
  if (name === "call" && Object.hasOwn(action, "with")) {
    return { name, config: { service: action.call, with: action.with } };
  }
  return name ? { name, config: action[name] } : null;
}

function asActions(actions) {
  if (!actions) return [];
  return Array.isArray(actions) ? actions : [actions];
}

function selectedTarget(config, context) {
  const list = readReference(config.list || config.within, context);
  const index = Number(readReference(config.index, context) ?? 0);
  if (!Array.isArray(list)) throw new Error("动作需要一个数组变量作为 list/within。");
  return { list, index, item: list[index] };
}

async function executeActions(actions, context) {
  for (const action of asActions(actions)) {
    await executeAction(action, context);
  }
}

async function executeAction(action, context) {
  const found = findAction(action);
  if (!found) throw new Error("动作格式无效。请使用 set、move、toggle、push、pop 等内置动作。");

  const { name, config } = found;
  switch (name) {
    case "set":
      executeSet(config, context);
      break;
    case "move":
      executeMove(config, context);
      break;
    case "toggle":
      executeToggle(config, context);
      break;
    case "remove":
      executeRemove(config, context);
      break;
    case "append":
      executeAppend(config, context);
      break;
    case "backspace": {
      const path = typeof config === "string" ? config : config.path;
      writePath(path, backspace(readPath(path, context)), context);
      break;
    }
    case "push":
    case "go": {
      const page = config.page || config.route;
      const params = resolveValue(config.params || {}, context);
      await context.page.push(page, params);
      break;
    }
    case "replace": {
      const page = config.page || config.route;
      const params = resolveValue(config.params || {}, context);
      await context.page.replace(page, params);
      break;
    }
    case "reset": {
      const page = config.page || config.route;
      const params = resolveValue(config.params || {}, context);
      await context.page.reset(page, params);
      break;
    }
    case "pop":
      await context.page.back(resolveValue(config?.result, context));
      break;
    case "quit":
      context.page.quit(Number(config?.code || config || 0));
      break;
    case "call":
      await executeService(config, context);
      break;
    case "refresh":
      if (typeof context.runtime.refresh === "function") await context.runtime.refresh(context);
      break;
    case "notify":
      writePath("state.notice", resolveValue(config, context), context);
      break;
    case "if":
      if (evaluateCondition(config.condition, context)) {
        await executeActions(config.then, context);
      } else {
        await executeActions(config.else, context);
      }
      break;
    default:
      throw new Error(`不认识的动作：${name}`);
  }

  if (action.then) await executeActions(action.then, context);
}

function executeSet(config, context) {
  if (config && typeof config === "object" && Object.hasOwn(config, "path")) {
    writePath(config.path, resolveValue(config.value, context), context);
    return;
  }
  for (const [path, value] of Object.entries(config || {})) {
    writePath(path, resolveValue(value, context), context);
  }
}

function executeMove(config, context) {
  const path = config.path;
  const current = Number(readPath(path, context) || 0);
  const by = Number(resolveValue(config.by ?? 1, context));
  const list = readReference(config.list || config.within, context);
  const max = Array.isArray(list) ? Math.max(0, list.length - 1) : Number.MAX_SAFE_INTEGER;
  writePath(path, Math.min(max, Math.max(0, current + by)), context);
}

function executeToggle(config, context) {
  if (typeof config === "string") {
    writePath(config, !readPath(config, context), context);
    return;
  }
  if (config.path) {
    writePath(config.path, !readPath(config.path, context), context);
    return;
  }
  const target = selectedTarget(config, context);
  if (!target.item || !config.field) return;
  target.item[config.field] = !target.item[config.field];
}

function executeRemove(config, context) {
  const target = selectedTarget(config, context);
  if (!target.item) return;
  target.list.splice(target.index, 1);
}

function executeAppend(config, context) {
  if (config.path) {
    const current = readPath(config.path, context) || "";
    const value = resolveValue(config.value, context);
    writePath(config.path, `${current}${value ?? ""}`, context);
    return;
  }
  const list = readReference(config.list, context);
  if (!Array.isArray(list)) throw new Error("append 动作的 list 必须是数组变量。");
  list.push(resolveValue(config.value, context));
}

async function executeService(config, context) {
  const name = typeof config === "string" ? config : config.service || config.name;
  const service = context.runtime.services[name];
  if (typeof service !== "function") throw new Error(`没有注册名为 ${name} 的 service。`);
  const values = typeof config === "string" ? {} : resolveValue(config.with || config.args || {}, context);
  context.lastResult = await service(values, context);
}

function keyAction(definition, key) {
  const keys = definition.keys || {};
  const normalized = key.name === " " ? "space" : key.name;
  if (keys[normalized] !== undefined) return keys[normalized];
  if (key.name?.length === 1 && keys.character !== undefined) return keys.character;
  return undefined;
}

class DeclarativePage extends Page {
  constructor(name, definition, runtime) {
    const title = typeof definition.title === "string" ? definition.title : name;
    super({ name, title });
    this.definition = definition;
    this.runtime = runtime;
    this.state = cloneValue(definition.state || {});
  }

  context(key) {
    return {
      app: this.app,
      page: this,
      runtime: this.runtime,
      data: this.runtime.data,
      state: this.state,
      params: this.params || {},
      key
    };
  }

  render() {
    const context = this.context();
    if (this.definition.title !== undefined) this.title = renderTextSpec(this.definition.title, context);
    return compileLayout(this.definition.layout || { type: "text", value: this.title }, context);
  }

  async onEnter(params) {
    this.params = params || {};
    await executeActions(this.definition.on?.enter, this.context());
  }

  async onResume(result) {
    await executeActions(this.definition.on?.resume, { ...this.context(), result });
  }

  async onKey(key) {
    const action = keyAction(this.definition, key);
    if (action === undefined) return false;
    await executeActions(action, this.context(key));
    return true;
  }
}

module.exports = {
  DeclarativePage,
  compileLayout,
  executeAction,
  executeActions
};
