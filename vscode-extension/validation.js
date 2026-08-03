const YAML = require("yaml");

const COMPONENTS = new Set([
  "text",
  "input",
  "column",
  "row",
  "panel",
  "list",
  "divider",
  "spacer"
]);

const ACTIONS = new Set([
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
]);

const NAVIGATION_ACTIONS = new Set(["push", "go", "replace", "reset"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function offsetOf(error) {
  if (Array.isArray(error?.pos)) return Number(error.pos[0]) || 0;
  return 0;
}

function findOffset(source, text, from = 0) {
  if (!text) return from;
  const index = source.indexOf(text, Math.max(0, from));
  return index >= 0 ? index : from;
}

function addIssue(issues, severity, message, start = 0, end = start + 1) {
  issues.push({
    severity,
    message,
    start: Math.max(0, start),
    end: Math.max(start + 1, end)
  });
}

function describePath(path) {
  return path || "当前文件";
}

function validateLayout(node, source, issues, path = "layout") {
  if (node === null || node === false || typeof node === "string" || typeof node === "number") {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((child, index) => validateLayout(child, source, issues, path + "[" + index + "]"));
    return;
  }

  if (!isObject(node)) {
    addIssue(issues, "error", describePath(path) + " 必须是布局对象。");
    return;
  }

  const type = node.type || "text";
  const typeOffset = findOffset(source, "type: " + type);
  if (!COMPONENTS.has(type)) {
    addIssue(
      issues,
      "error",
      "不认识的布局组件 “" + type + "”。可用组件：" + Array.from(COMPONENTS).join("、") + "。",
      typeOffset,
      typeOffset + String(type).length
    );
  }

  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) {
      addIssue(issues, "error", describePath(path) + ".children 必须是数组。", typeOffset);
    } else {
      node.children.forEach((child, index) => {
        validateLayout(child, source, issues, path + ".children[" + index + "]");
      });
    }
  }

  if (node.child !== undefined) {
    validateLayout(node.child, source, issues, path + ".child");
  }

  if ((type === "column" || type === "row") && node.children === undefined) {
    addIssue(issues, "warning", type + " 没有 children，因此不会显示内容。", typeOffset);
  }

  if (type === "list" && node.items === undefined && node.bind === undefined) {
    addIssue(issues, "warning", "list 没有 items 或 bind，将显示空列表。", typeOffset);
  }
}

function actionName(action) {
  if (typeof action === "string") return action;
  if (!isObject(action)) return null;
  if (typeof action.do === "string") return action.do;
  return Array.from(ACTIONS).find((name) => Object.prototype.hasOwnProperty.call(action, name)) || null;
}

function validateActions(actions, source, issues, routes, path = "keys") {
  if (actions === undefined || actions === null) return;
  const list = Array.isArray(actions) ? actions : [actions];

  list.forEach((action, index) => {
    const name = actionName(action);
    const actionPath = path + "[" + index + "]";
    const actionOffset = findOffset(source, name || "-");

    if (!name) {
      addIssue(issues, "error", describePath(actionPath) + " 不是有效动作。请使用 set、move、push、pop 等动作。", actionOffset);
      return;
    }

    if (!ACTIONS.has(name)) {
      addIssue(issues, "error", "不认识的动作 “" + name + "”。", actionOffset, actionOffset + name.length);
      return;
    }

    const config = isObject(action) && Object.prototype.hasOwnProperty.call(action, name)
      ? action[name]
      : action;

    if (NAVIGATION_ACTIONS.has(name) && isObject(config)) {
      const target = config.page || config.route;
      if (typeof target === "string" && routes && !routes.has(target)) {
        addIssue(
          issues,
          "error",
          "页面 “" + target + "” 没有在 pages 中注册。",
          findOffset(source, target)
        );
      }
    }

    if (name === "if" && isObject(config)) {
      if (config.then !== undefined) {
        validateActions(config.then, source, issues, routes, actionPath + ".then");
      }
      if (config.else !== undefined) {
        validateActions(config.else, source, issues, routes, actionPath + ".else");
      }
    }

    if (isObject(action) && action.then !== undefined) {
      validateActions(action.then, source, issues, routes, actionPath + ".then");
    }
  });
}

function validatePage(page, source, issues, routes, name = "当前页面") {
  if (!isObject(page)) {
    addIssue(issues, "error", "页面 “" + name + "” 必须是对象或独立页面文件路径。");
    return;
  }

  if (page.state !== undefined && !isObject(page.state)) {
    addIssue(issues, "error", "页面 “" + name + "” 的 state 必须是对象。", findOffset(source, "state:"));
  }

  if (page.layout !== undefined) {
    validateLayout(page.layout, source, issues, "pages." + name + ".layout");
  }

  if (page.keys !== undefined) {
    if (!isObject(page.keys)) {
      addIssue(issues, "error", "页面 “" + name + "” 的 keys 必须是对象。", findOffset(source, "keys:"));
    } else {
      Object.entries(page.keys).forEach(([key, actions]) => {
        validateActions(actions, source, issues, routes, "pages." + name + ".keys." + key);
      });
    }
  }

  if (page.on !== undefined) {
    if (!isObject(page.on)) {
      addIssue(issues, "error", "页面 “" + name + "” 的 on 必须是对象。", findOffset(source, "on:"));
    } else {
      validateActions(page.on.enter, source, issues, routes, "pages." + name + ".on.enter");
      validateActions(page.on.resume, source, issues, routes, "pages." + name + ".on.resume");
    }
  }
}

function validateManifest(root, source, issues) {
  if (!isObject(root.pages)) {
    addIssue(issues, "error", "manifest 的 pages 必须是对象。", findOffset(source, "pages:"));
    return;
  }

  const routes = new Set(Object.keys(root.pages));
  if (root.initial !== undefined && typeof root.initial === "string" && !routes.has(root.initial)) {
    addIssue(
      issues,
      "error",
      "initial 页面 “" + root.initial + "” 没有在 pages 中注册。",
      findOffset(source, root.initial)
    );
  }

  Object.entries(root.pages).forEach(([name, page]) => {
    if (typeof page === "string") return;
    validatePage(page, source, issues, routes, name);
  });
}

function validatePageTui(source) {
  const text = String(source || "");
  const issues = [];
  if (!text.trim()) return issues;

  let document;
  try {
    document = YAML.parseDocument(text, { prettyErrors: false });
  } catch (error) {
    addIssue(issues, "error", error.message || String(error), 0, 1);
    return issues;
  }

  for (const error of document.errors || []) {
    const start = offsetOf(error);
    addIssue(issues, "error", error.message || String(error), start, start + 1);
  }
  if (issues.some((issue) => issue.severity === "error")) return issues;

  let root;
  try {
    root = document.toJS({ mapAsMap: false });
  } catch (error) {
    addIssue(issues, "error", error.message || String(error), 0, 1);
    return issues;
  }

  if (!isObject(root)) {
    addIssue(issues, "error", "Page TUI 文件的根节点必须是对象。", 0, Math.min(1, text.length));
    return issues;
  }

  if (root.pages !== undefined) {
    validateManifest(root, text, issues);
  } else if (root.layout !== undefined || root.state !== undefined || root.keys !== undefined || root.on !== undefined) {
    validatePage(root, text, issues, null, "独立页面");
  }

  return issues;
}

module.exports = {
  ACTIONS,
  COMPONENTS,
  validatePageTui
};
