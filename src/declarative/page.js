const { Page } = require("../core/page");
const { spawn, spawnSync } = require("node:child_process");
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
  "width",
  "height",
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
  "character",
  "max",
  "label",
  "showValue",
  "filled",
  "empty"
];

const TEXT_OPTION_NAMES = new Set([
  "title",
  "emptyText",
  "label",
  "filled",
  "empty",
  "character",
  "marker",
  "normalMarker"
]);

function pickOptions(node, context) {
  const options = {};
  for (const name of VIEW_OPTION_NAMES) {
    if (node[name] === undefined) continue;
    options[name] = TEXT_OPTION_NAMES.has(name) ? renderTextSpec(node[name], context) : node[name];
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

function maskInputValue(value, mask) {
  if (!mask) return value;
  const character = typeof mask === "string" && mask.length > 0 ? Array.from(mask)[0] : "•";
  return character.repeat(Array.from(value).length);
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
      const placeholder = node.placeholder === undefined ? "" : renderTextSpec(node.placeholder, context);
      const showingPlaceholder = value.length === 0 && placeholder.length > 0;
      const displayValue = maskInputValue(value, node.mask);
      const display = displayValue || (showingPlaceholder ? placeholder : "");
      const cursor = node.cursor !== false && !showingPlaceholder && context.inputPath === node.bind ? "▌" : "";
      const options = pickOptions(node, context);
      if (showingPlaceholder) {
        options.style = node.placeholderStyle === undefined
          ? "muted"
          : resolveStyle(node.placeholderStyle, context);
      } else if (node.style === undefined) {
        options.style = "input";
      }
      return ui.text(`${display}${cursor}`, options);
    }
    case "progress": {
      const value = node.bind !== undefined
        ? readReference(node.bind, context)
        : resolveValue(node.value ?? 0, context);
      const options = pickOptions(node, context);
      options.max = Number(resolveValue(node.max ?? 100, context)) || 100;
      if (node.label !== undefined) options.label = renderTextSpec(node.label, context);
      if (node.showValue !== undefined) options.showValue = resolveValue(node.showValue, context) !== false;
      if (node.filled !== undefined) options.filled = renderTextSpec(node.filled, context);
      if (node.empty !== undefined) options.empty = renderTextSpec(node.empty, context);
      return ui.progress(value, options);
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
    case "popup": {
      const hasChild = node.child !== undefined || (Array.isArray(node.children) && node.children.length > 0);
      const child = node.child !== undefined
        ? compileLayout(node.child, context)
        : hasChild
          ? compileLayout({ type: "column", children: node.children || [] }, context)
          : null;
      const message = node.message !== undefined ? renderTextSpec(node.message, context) : renderTextSpec(node.value, context);
      return ui.popup(child || ui.text(message), pickOptions(node, context));
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

function collectInputTargets(node, context, result = []) {
  if (node == null || node === false) return result;
  if (Array.isArray(node)) {
    node.forEach((child) => collectInputTargets(child, context, result));
    return result;
  }
  if (typeof node !== "object") return result;
  if (node.visible !== undefined && !evaluateCondition(node.visible, context)) return result;

  if ((node.type || "text") === "input" && typeof node.bind === "string" && node.bind.trim()) {
    result.push({
      path: node.bind,
      focus: node.focus === undefined ? false : evaluateCondition(node.focus, context),
      cursor: node.cursor !== false
    });
  }

  if (node.child !== undefined) collectInputTargets(node.child, context, result);
  if (Array.isArray(node.children)) node.children.forEach((child) => collectInputTargets(child, context, result));
  return result;
}

function activeInputTarget(layout, context) {
  const targets = collectInputTargets(layout, context);
  if (!targets.length) return null;
  return targets.find((target) => target.focus) || targets[0];
}

function shellBinary() {
  if (process.platform === "win32") return process.env.ComSpec || "cmd.exe";
  return process.env.SHELL || "/bin/sh";
}

function outputCaptureRequested(config) {
  return ["result", "stdout", "stderr", "lines", "stderrLines", "json", "onLine", "onExit"]
    .some((name) => Object.hasOwn(config || {}, name));
}

function commandEnvironment(config, context) {
  const env = config?.env ? resolveValue(config.env, context) : {};
  const baseEnvironment = context.runtime?.env || process.env;
  if (!env || typeof env !== "object" || Array.isArray(env)) return baseEnvironment;
  return { ...baseEnvironment, ...env };
}

function normalizeStdio(config, context, wait, capture) {
  const explicit = config?.stdio !== undefined ? resolveValue(config.stdio, context) : undefined;
  if (!wait) {
    if (capture && explicit !== "inherit" && explicit !== "ignore") return "pipe";
    return explicit === "inherit" ? "inherit" : "ignore";
  }
  if (explicit !== undefined && explicit !== null && explicit !== "") return explicit;
  return capture ? "pipe" : "inherit";
}

function shellWait(config, context) {
  if (Object.hasOwn(config || {}, "wait")) return resolveValue(config.wait, context) !== false;
  if (Object.hasOwn(config || {}, "blocking")) return resolveValue(config.blocking, context) !== false;
  return true;
}

function normalizeCommandArgs(config, context) {
  if (!Object.hasOwn(config || {}, "args")) return [];
  const args = resolveValue(config.args, context);
  if (args == null || args === "") return [];
  if (Array.isArray(args)) return args.map((item) => String(item));
  return [String(args)];
}

function capturesOutput(stdio) {
  if (stdio === "pipe") return true;
  return Array.isArray(stdio) && (stdio[1] === "pipe" || stdio[2] === "pipe");
}

function outputLines(value) {
  const text = String(value ?? "");
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function callResultFromSync(result) {
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  return {
    ok: result.status === 0,
    running: false,
    code: result.status ?? null,
    signal: result.signal ?? null,
    pid: result.pid ?? null,
    stdout,
    stderr,
    stdoutLines: outputLines(stdout),
    stderrLines: outputLines(stderr),
    error: result.error ? String(result.error.message || result.error) : null
  };
}

function callResultFromChild(child) {
  return {
    ok: null,
    running: true,
    code: null,
    signal: null,
    pid: child.pid ?? null,
    stdout: "",
    stderr: "",
    stdoutLines: [],
    stderrLines: [],
    error: null
  };
}

function shellKey(stream, line, result) {
  return {
    name: "line",
    value: line,
    line,
    stream,
    result
  };
}

function shellExitKey(result) {
  return {
    name: "exit",
    value: result.code,
    code: result.code,
    signal: result.signal,
    result
  };
}

function invalidateShellContext(context) {
  context.page?.invalidate?.();
}

function writeShellOutput(config, context, result, final = false) {
  if (typeof config?.stdout === "string") writePath(config.stdout, result.stdout, context);
  if (typeof config?.stderr === "string") writePath(config.stderr, result.stderr, context);
  if (typeof config?.lines === "string") writePath(config.lines, result.stdoutLines, context);
  if (typeof config?.stderrLines === "string") writePath(config.stderrLines, result.stderrLines, context);
  if (typeof config?.code === "string") writePath(config.code, result.code, context);

  if (typeof config?.json === "string") {
    if (!final) {
      writePath(config.json, null, context);
    } else {
      try {
        result.json = JSON.parse(result.stdout);
        result.jsonError = null;
      } catch (error) {
        result.json = null;
        result.jsonError = String(error.message || error);
      }
      writePath(config.json, result.json, context);
    }
  }

  if (typeof config?.result === "string") writePath(config.result, result, context);
  context.lastResult = result;
  invalidateShellContext(context);
  return result;
}

async function executeShellLineActions(config, context, result, stream, lines) {
  if (!config?.onLine) return;
  for (const line of Array.isArray(lines) ? lines : [lines]) {
    await executeActions(config.onLine, {
      ...context,
      key: shellKey(stream, line, result)
    });
  }
}

async function executeShellExitActions(config, context, result) {
  if (!config?.onExit) return;
  await executeActions(config.onExit, {
    ...context,
    key: shellExitKey(result)
  });
}

function createShellActionQueue(context) {
  const queue = { promise: Promise.resolve() };
  const enqueue = (task) => {
    queue.promise = queue.promise
      .then(task)
      .catch((error) => {
        if (context.page?.app?.handleError) {
          context.page.app.handleError(error);
          return undefined;
        }
        throw error;
      });
    return queue.promise;
  };
  return { queue, enqueue };
}

function createShellStreamCapture(config, context, result, enqueue) {
  const pending = { stdout: "", stderr: "" };

  function feed(stream, chunk, flush = false) {
    const text = flush ? "" : String(chunk ?? "");
    if (!flush && text) result[stream] += text;

    const combined = pending[stream] + text;
    const parts = combined.split(/\r?\n/);
    pending[stream] = parts.pop() ?? "";

    for (const line of parts) {
      result[`${stream}Lines`].push(line);
      writeShellOutput(config, context, result);
      enqueue(() => executeShellLineActions(config, context, result, stream, line));
    }

    if (flush && pending[stream] !== "") {
      const line = pending[stream];
      pending[stream] = "";
      result[`${stream}Lines`].push(line);
      writeShellOutput(config, context, result);
      enqueue(() => executeShellLineActions(config, context, result, stream, line));
    } else if (!flush && text) {
      writeShellOutput(config, context, result);
    }
  }

  return {
    feed,
    flush(stream) {
      feed(stream, "", true);
    }
  };
}

async function executeShell(config, context) {
  const wait = shellWait(config, context);
  const capture = outputCaptureRequested(config);
  const stdio = normalizeStdio(config, context, wait, capture);
  const cwdValue = config?.cwd ? resolveValue(config.cwd, context) : undefined;
  const cwd = cwdValue === undefined || cwdValue === null || cwdValue === "" ? process.cwd() : String(cwdValue);
  const env = commandEnvironment(config, context);
  const check = resolveValue(config?.check, context) === true;
  const shell = config?.interpreter ? String(resolveValue(config.interpreter, context) ?? "") : shellBinary();
  const maxBuffer = Number(resolveValue(config?.maxBuffer, context));
  const outputEncoding = capturesOutput(stdio) ? "utf8" : undefined;

  const resolveCommand = () => {
    if (Object.hasOwn(config || {}, "sh")) return String(resolveValue(config.sh, context) ?? "");
    if (Object.hasOwn(config || {}, "command")) return String(resolveValue(config.command, context) ?? "");
    return "";
  };

  if (wait) {
    const command = resolveCommand();
    if (!command) throw new Error("call 的 sh 或 command 不能为空。");
    const args = Object.hasOwn(config || {}, "command")
      ? normalizeCommandArgs(config, context)
      : process.platform === "win32"
        ? ["/d", "/s", "/c", command]
        : ["-c", command];
    const runner = () => (Object.hasOwn(config || {}, "command")
      ? spawnSync(command, args, {
          cwd,
          env,
          stdio,
          shell: false,
          encoding: outputEncoding,
          maxBuffer: maxBuffer > 0 ? maxBuffer : 10 * 1024 * 1024
        })
      : spawnSync(shell, args, {
          cwd,
          env,
          stdio,
          shell: false,
          encoding: outputEncoding,
          maxBuffer: maxBuffer > 0 ? maxBuffer : 10 * 1024 * 1024
        }));

    const run = async () => {
      const output = callResultFromSync(runner());
      writeShellOutput(config, context, output, true);
      await executeShellLineActions(config, context, output, "stdout", output.stdoutLines);
      await executeShellLineActions(config, context, output, "stderr", output.stderrLines);
      await executeShellExitActions(config, context, output);
      if (check && !output.ok) {
        throw new Error(output.error || `命令执行失败，退出码：${output.code}`);
      }
      return output;
    };

    if (stdio === "inherit" && context.page?.app?.suspendTerminal) {
      return context.page.app.suspendTerminal(run);
    }
    return run();
  }

  const command = resolveCommand();
  if (!command) throw new Error("call 的 sh 或 command 不能为空。");
  const args = Object.hasOwn(config || {}, "command")
    ? normalizeCommandArgs(config, context)
    : process.platform === "win32"
      ? ["/d", "/s", "/c", command]
      : ["-c", command];
  const child = Object.hasOwn(config || {}, "command")
    ? spawn(command, args, {
        cwd,
        env,
        stdio,
        shell: false,
        detached: true
      })
    : spawn(shell, args, {
        cwd,
        env,
        stdio,
        shell: false,
        detached: true
      });

  const output = callResultFromChild(child);
  const { queue, enqueue } = createShellActionQueue(context);
  const captureStreams = createShellStreamCapture(config, context, output, enqueue);
  if (child.stdout) child.stdout.on("data", (chunk) => captureStreams.feed("stdout", chunk));
  if (child.stderr) child.stderr.on("data", (chunk) => captureStreams.feed("stderr", chunk));
  child.on("error", (error) => {
    output.error = String(error.message || error);
    output.ok = false;
  });

  await new Promise((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });

  child.unref?.();
  writeShellOutput(config, context, output);
  child.once("close", (code, signal) => {
    output.running = false;
    output.code = code ?? null;
    output.signal = signal ?? null;
    output.ok = output.error ? false : output.code === 0;
    captureStreams.flush("stdout");
    captureStreams.flush("stderr");
    enqueue(async () => {
      writeShellOutput(config, context, output, true);
      await executeShellExitActions(config, context, output);
      if (check && !output.ok) {
        throw new Error(output.error || `命令执行失败，退出码：${output.code}`);
      }
    });
    queue.promise.catch((error) => {
      if (context.page?.app?.handleError) context.page.app.handleError(error);
    });
  });
  return output;
}

function resolveNavigation(config, context) {
  if (!config || typeof config !== "object") {
    return { page: resolveValue(config, context), params: {} };
  }
  return {
    page: resolveValue(config.page ?? config.route, context),
    params: resolveValue(config.params || {}, context)
  };
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
      const { page, params } = resolveNavigation(config, context);
      await context.page.push(page, params);
      break;
    }
    case "replace": {
      const { page, params } = resolveNavigation(config, context);
      await context.page.replace(page, params);
      break;
    }
    case "reset": {
      const { page, params } = resolveNavigation(config, context);
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
      if (config && typeof config === "object" && (Object.hasOwn(config, "sh") || Object.hasOwn(config, "command"))) {
        await executeShell(config, context);
      } else {
        await executeService(config, context);
      }
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
    const inputTarget = activeInputTarget(this.definition.layout, context);
    if (inputTarget) context.inputPath = inputTarget.path;
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
    if (action !== undefined) {
      await executeActions(action, this.context(key));
      return true;
    }

    const context = this.context(key);
    const inputTarget = activeInputTarget(this.definition.layout, context);
    if (!inputTarget?.path) return false;

    if (key.name === "backspace") {
      writePath(inputTarget.path, backspace(readPath(inputTarget.path, context)), context);
      return true;
    }

    if (typeof key.value === "string" && key.value.length > 0 && !key.ctrl && !key.meta && key.name !== "enter") {
      writePath(inputTarget.path, `${String(readPath(inputTarget.path, context) ?? "")}${key.value}`, context);
      return true;
    }

    return false;
  }
}

module.exports = {
  DeclarativePage,
  compileLayout,
  executeAction,
  executeActions
};
