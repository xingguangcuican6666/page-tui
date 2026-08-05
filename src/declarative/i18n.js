const path = require("node:path");

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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

function readContextPath(value, context) {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return value;
  const parts = splitPath(value);
  const rootName = parts.shift();
  const roots = {
    data: context?.data,
    state: context?.state,
    params: context?.params,
    page: context?.params,
    app: context?.app,
    runtime: context?.runtime
  };
  let current = roots[rootName];
  if (current === undefined) return undefined;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function resolveLocaleSpec(spec, context) {
  if (typeof spec === "function") return spec(context);
  if (isObject(spec)) {
    if (Object.hasOwn(spec, "bind")) return readContextPath(spec.bind, context);
    if (Object.hasOwn(spec, "value")) return spec.value;
  }
  if (typeof spec === "string") {
    const trimmed = spec.trim();
    if (/^(data|state|params|page|app|runtime)(\.|$)/.test(trimmed)) {
      return readContextPath(trimmed, context);
    }
    if (trimmed.startsWith("$") && /^(data|state|params|page|app|runtime)(\.|$)/.test(trimmed.slice(1))) {
      return readContextPath(trimmed.slice(1), context);
    }
  }
  return spec;
}

function lookupPath(value, key) {
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
    const separator = value.indexOf("-") >= 0 ? "-" : "_";
    const base = value.split(separator)[0];
    if (base && !result.includes(base)) result.push(base);
  };
  add(locale);
  add(fallback);
  return result;
}

function createI18n(options = {}) {
  const locales = isObject(options.locales) ? options.locales : {};
  const fallback = options.fallback || options.default || Object.keys(locales)[0];
  const localeSpec = options.locale ?? options.language;

  return {
    locales,
    fallback,
    getLocale(context = {}) {
      const selected = resolveLocaleSpec(localeSpec, context);
      return selected == null || selected === "" ? fallback : String(selected);
    },
    lookup(key, context = {}) {
      if (key == null || key === "") return undefined;
      const requested = String(key);
      const selected = this.getLocale(context);
      for (const locale of localeCandidates(selected, fallback)) {
        const message = lookupPath(locales[locale], requested);
        if (message !== undefined) return message;
      }
      return undefined;
    },
    translate(key, context = {}) {
      const value = this.lookup(key, context);
      return value === undefined ? String(key ?? "") : value;
    }
  };
}

function localeSources(definition) {
  if (!isObject(definition)) return {};
  const sources = definition.locales || definition.files || definition.sources;
  return isObject(sources) ? sources : {};
}

function loadI18n(definition, baseDir, readDocument) {
  if (!isObject(definition)) return createI18n();
  const locales = {};
  for (const [locale, source] of Object.entries(localeSources(definition))) {
    if (typeof source === "string") {
      if (typeof readDocument !== "function") throw new TypeError("加载外部语言文件需要 readDocument 函数。");
      const filePath = path.resolve(baseDir || process.cwd(), source);
      const document = readDocument(filePath);
      if (!isObject(document)) throw new Error(`语言文件必须是对象：${filePath}`);
      locales[locale] = document;
    } else {
      if (!isObject(source)) throw new Error(`语言 ${locale} 必须指向对象或外部文件。`);
      locales[locale] = source;
    }
  }
  return createI18n({ ...definition, locales });
}

module.exports = {
  createI18n,
  loadI18n,
  localeSources,
  readContextPath
};
