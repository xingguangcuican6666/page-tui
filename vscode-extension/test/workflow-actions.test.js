const test = require("node:test");
const assert = require("node:assert/strict");
const {
  NODE_CATALOG,
  actionConfig,
  actionWithConfig,
  callMode,
  changeCallMode,
  createWorkflowAction
} = require("../workflow-actions");
const { actionsToWorkflow, workflowToActions } = require("../workflow-model");

test("节点目录包含命令、数据、条件和导航所需模板", () => {
  const ids = NODE_CATALOG.flatMap((group) => group.items.map((item) => item.id));

  assert.deepEqual(ids, [
    "call", "command", "service",
    "set", "extract", "append", "move", "toggle", "remove", "backspace", "progress",
    "if", "notify", "refresh", "push", "replace", "reset", "pop", "quit"
  ]);
});

test("每个节点模板都可以进入流程并无损写回", () => {
  for (const group of NODE_CATALOG) {
    for (const item of group.items) {
      const action = createWorkflowAction(item.id);
      const workflow = actionsToWorkflow([action], { source: "keys", event: "enter" });
      assert.deepEqual(workflowToActions(workflow), [action], item.id);
    }
  }
});

test("call 模板覆盖 shell、直接程序和 service", () => {
  assert.equal(callMode(createWorkflowAction("call")), "shell");
  assert.equal(callMode(createWorkflowAction("command")), "command");
  assert.equal(callMode(createWorkflowAction("service")), "service");
});

test("call 模式切换保留通用值并清理不兼容字段", () => {
  const shell = {
    call: {
      sh: "printf hello",
      wait: false,
      cwd: "state.cwd",
      env: { MODE: "test" },
      stdout: "state.output",
      result: "state.process",
      onExit: [{ notify: "done" }]
    }
  };
  const command = changeCallMode(shell, "command");
  assert.equal(actionConfig(command, "call").command, "node");
  assert.equal(actionConfig(command, "call").stdout, "state.output");
  assert.equal(Object.hasOwn(actionConfig(command, "call"), "sh"), false);

  const service = changeCallMode(command, "service");
  assert.deepEqual(actionConfig(service, "call"), { service: "tasks.run", with: {} });
});

test("结构化配置更新保留动作外层字段", () => {
  const action = {
    call: { command: "node", args: ["old.js"] },
    then: [{ notify: "started" }]
  };
  const next = actionWithConfig(action, "call", { command: "node", args: ["new.js"] });

  assert.deepEqual(next, {
    call: { command: "node", args: ["new.js"] },
    then: [{ notify: "started" }]
  });
});
