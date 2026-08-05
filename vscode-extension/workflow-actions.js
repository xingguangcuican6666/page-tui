const NODE_CATALOG = [
  {
    id: "commands",
    label: "命令",
    items: [
      { id: "call", actionType: "call", label: "Shell 命令" },
      { id: "command", actionType: "call", label: "直接运行程序" },
      { id: "service", actionType: "call", label: "调用 Service" }
    ]
  },
  {
    id: "data",
    label: "数据",
    items: [
      { id: "set", actionType: "set", label: "创建/设置变量" },
      { id: "extract", actionType: "set", label: "提取返回值" },
      { id: "append", actionType: "append", label: "追加到列表" },
      { id: "move", actionType: "move", label: "移动选择" },
      { id: "toggle", actionType: "toggle", label: "切换布尔值" },
      { id: "remove", actionType: "remove", label: "删除列表项" },
      { id: "backspace", actionType: "backspace", label: "删除末尾字符" },
      { id: "progress", actionType: "set", label: "更新进度" }
    ]
  },
  {
    id: "flow",
    label: "流程",
    items: [
      { id: "if", actionType: "if", label: "条件筛选" },
      { id: "notify", actionType: "notify", label: "显示通知" },
      { id: "refresh", actionType: "refresh", label: "刷新界面" },
      { id: "push", actionType: "push", label: "打开页面" },
      { id: "replace", actionType: "replace", label: "替换页面" },
      { id: "reset", actionType: "reset", label: "重置页面栈" },
      { id: "pop", actionType: "pop", label: "返回上一页" },
      { id: "quit", actionType: "quit", label: "退出程序" }
    ]
  }
];

const ACTION_LABELS = {
  call: "执行命令",
  if: "条件筛选",
  set: "设置变量",
  append: "追加数据",
  move: "移动选择",
  toggle: "切换变量",
  remove: "删除列表项",
  backspace: "删除字符",
  notify: "通知",
  refresh: "刷新界面",
  push: "打开页面",
  replace: "替换页面",
  reset: "重置页面栈",
  pop: "返回",
  quit: "退出"
};

const SHELL_FIELDS = [
  "sh", "command", "args", "cwd", "env", "stdio", "blocking", "wait",
  "result", "stdout", "stderr", "lines", "stderrLines", "json", "code",
  "check", "interpreter", "maxBuffer", "onLine", "onExit"
];

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function createWorkflowAction(templateId) {
  const templates = {
    call: { call: { sh: "echo hello", wait: true, result: "state.command" } },
    command: { call: { command: "node", args: ["script.js"], wait: true, result: "state.command" } },
    service: { call: { service: "tasks.run", with: {} } },
    set: { set: { path: "state.value", value: "" } },
    extract: { set: { path: "state.value", value: { bind: "state.command.stdout" } } },
    append: { append: { list: "state.logs", value: { bind: "key.value" } } },
    move: { move: { path: "state.selected", by: 1, list: "data.items" } },
    toggle: { toggle: { path: "state.enabled" } },
    remove: { remove: { list: "data.items", index: "state.selected" } },
    backspace: { backspace: { path: "state.text" } },
    progress: { set: { path: "state.progress", value: 0 } },
    if: { if: { condition: { equals: [{ bind: "state.command.code" }, 0] } } },
    notify: { notify: "" },
    refresh: { refresh: {} },
    push: { push: { page: "", params: {} } },
    replace: { replace: { page: "", params: {} } },
    reset: { reset: { page: "", params: {} } },
    pop: { pop: {} },
    quit: { quit: { code: 0 } }
  };
  return clone(templates[templateId] || templates.set);
}

function actionConfig(action, type) {
  if (!action || typeof action !== "object" || Array.isArray(action)) return action;
  if (action.do === type) return action;
  const value = action[type];
  if (type === "call" && typeof value === "string") {
    return {
      service: value,
      with: action.with && typeof action.with === "object" ? clone(action.with) : {}
    };
  }
  return value;
}

function actionWithConfig(action, type, config) {
  if (action && typeof action === "object" && !Array.isArray(action) && action.do === type) {
    return { ...clone(config), do: type };
  }
  const next = action && typeof action === "object" && !Array.isArray(action) ? clone(action) : {};
  next[type] = clone(config);
  if (type === "call" && typeof action?.call === "string") delete next.with;
  return next;
}

function callMode(action) {
  const config = actionConfig(action, "call");
  if (config && typeof config === "object" && !Array.isArray(config)) {
    if (Object.hasOwn(config, "sh")) return "shell";
    if (Object.hasOwn(config, "command")) return "command";
  }
  return "service";
}

function changeCallMode(action, mode) {
  const current = actionConfig(action, "call");
  const config = current && typeof current === "object" && !Array.isArray(current)
    ? clone(current)
    : {};

  if (mode === "service") {
    const service = config.service || config.name || "tasks.run";
    const parameters = config.with && typeof config.with === "object" && !Array.isArray(config.with)
      ? config.with
      : {};
    return actionWithConfig(action, "call", { service, with: parameters });
  }

  delete config.service;
  delete config.name;
  delete config.with;
  if (mode === "command") {
    delete config.sh;
    config.command = config.command || "node";
    if (!Array.isArray(config.args)) config.args = [];
  } else {
    delete config.command;
    delete config.args;
    config.sh = config.sh || "echo hello";
  }
  if (!Object.hasOwn(config, "wait") && !Object.hasOwn(config, "blocking")) config.wait = true;
  return actionWithConfig(action, "call", config);
}

function isShellCall(action) {
  const mode = callMode(action);
  return mode === "shell" || mode === "command";
}

function shellFields() {
  return SHELL_FIELDS.slice();
}

module.exports = {
  ACTION_LABELS,
  NODE_CATALOG,
  actionConfig,
  actionWithConfig,
  callMode,
  changeCallMode,
  createWorkflowAction,
  isShellCall,
  shellFields
};
