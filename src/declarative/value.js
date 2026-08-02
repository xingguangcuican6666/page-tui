function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function splitPath(path) {
  return String(path)
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
  const path = value.trim().replace(/^\$/, "");
  return /^(data|state|params|page|item|key|index|app)(\.|$)/.test(path);
}

function rootForPath(path, context) {
  const parts = splitPath(path);
  const root = parts.shift();

  switch (root) {
    case "data":
      return { value: context.data, parts };
    case "state":
      return { value: context.state, parts };
    case "params":
    case "page":
      return { value: context.params, parts };
    case "item":
      return { value: context.item, parts };
    case "key":
      return { value: context.key, parts };
    case "index":
      return { value: context.index, parts };
    case "app":
      return { value: context.app, parts };
    default:
      return { value: undefined, parts: [] };
  }
}

function readPath(path, context) {
  if (path == null || path === "") return undefined;
  if (typeof path !== "string") return path;

  const { value: root, parts } = rootForPath(path, context);
  if (root === undefined) return undefined;

  return parts.reduce((value, part) => {
    if (value == null) return undefined;
    return value[part];
  }, root);
}

function writePath(path, value, context) {
  const parts = splitPath(path);
  const rootName = parts.shift();
  let root;

  switch (rootName) {
    case "data":
      root = context.data;
      break;
    case "state":
      root = context.state;
      break;
    case "params":
    case "page":
      root = context.params;
      break;
    default:
      throw new Error(`只能修改 data、state 或 params 变量，收到：${path}`);
  }

  if (!root || !parts.length) {
    throw new Error(`变量路径无效：${path}`);
  }

  let target = root;
  for (const part of parts.slice(0, -1)) {
    if (target[part] == null || typeof target[part] !== "object") target[part] = {};
    target = target[part];
  }
  target[parts.at(-1)] = value;
  return value;
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
  return result.filter((item) => item.length > 0);
}

function parseLiteral(value) {
  const input = value.trim();
  if ((input.startsWith('"') && input.endsWith('"')) || (input.startsWith("'") && input.endsWith("'"))) {
    return input.slice(1, -1).replace(/\\([\\'"nrt])/g, (_, character) => ({
      n: "\n",
      r: "\r",
      t: "\t"
    }[character] || character));
  }
  if (input === "true") return true;
  if (input === "false") return false;
  if (input === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(input)) return Number(input);
  return undefined;
}

function evaluateExpression(expression, context) {
  const input = String(expression).trim();
  const literal = parseLiteral(input);
  if (literal !== undefined || input === "null") return literal;

  const call = input.match(/^([a-zA-Z][\w]*)\((.*)\)$/);
  if (call) {
    const name = call[1];
    const args = splitArguments(call[2]).map((argument) => evaluateExpression(argument, context));
    switch (name) {
      case "if":
        return evaluateCondition(args[0], context) ? args[1] : args[2];
      case "count":
      case "length": {
        const value = args[0];
        return Array.isArray(value) || typeof value === "string" ? value.length : value && typeof value === "object" ? Object.keys(value).length : 0;
      }
      case "upper":
        return String(args[0] ?? "").toUpperCase();
      case "lower":
        return String(args[0] ?? "").toLowerCase();
      case "default":
        return args[0] === undefined || args[0] === null || args[0] === "" ? args[1] : args[0];
      default:
        throw new Error(`不认识的模板函数：${name}`);
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

function readReference(reference, context) {
  if (reference && typeof reference === "object") return resolveValue(reference, context);
  if (typeof reference === "string" && isPathReference(reference)) return readPath(reference, context);
  if (typeof reference === "string" && reference.startsWith("$") && isPathReference(reference.slice(1))) {
    return readPath(reference.slice(1), context);
  }
  return reference;
}

function evaluateCondition(condition, context) {
  if (typeof condition === "string") return Boolean(readReference(condition, context));
  if (!condition || typeof condition !== "object") return Boolean(condition);

  if (Object.hasOwn(condition, "notEmpty")) {
    const value = readReference(condition.notEmpty, context);
    return value !== undefined && value !== null && String(value).length > 0;
  }
  if (Object.hasOwn(condition, "empty")) return !evaluateCondition({ notEmpty: condition.empty }, context);
  if (Object.hasOwn(condition, "equals")) {
    const values = Array.isArray(condition.equals) ? condition.equals : [condition.equals.left, condition.equals.right];
    return resolveValue(values[0], context) === resolveValue(values[1], context);
  }
  if (Object.hasOwn(condition, "notEquals")) return !evaluateCondition({ equals: condition.notEquals }, context);
  if (Object.hasOwn(condition, "all")) return condition.all.every((item) => evaluateCondition(item, context));
  if (Object.hasOwn(condition, "any")) return condition.any.some((item) => evaluateCondition(item, context));
  if (Object.hasOwn(condition, "not")) return !evaluateCondition(condition.not, context);
  if (Object.hasOwn(condition, "truthy")) return Boolean(readReference(condition.truthy, context));

  return Boolean(resolveValue(condition, context));
}

function backspace(value) {
  return Array.from(String(value ?? "")).slice(0, -1).join("");
}

module.exports = {
  backspace,
  cloneValue,
  evaluateCondition,
  evaluateExpression,
  isPathReference,
  readPath,
  readReference,
  renderTemplate,
  resolveValue,
  splitPath,
  writePath
};
