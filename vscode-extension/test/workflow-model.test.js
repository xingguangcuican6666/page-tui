const test = require("node:test");
const assert = require("node:assert/strict");
const {
  actionsToWorkflow,
  createWorkflowFragment,
  insertWorkflowAction,
  workflowToActions
} = require("../workflow-model");

test("顺序动作在流程图中往返后保持不变", () => {
  const actions = [
    { set: { path: "state.progress", value: 0 } },
    { call: { command: "./install.sh", wait: false, result: "state.process" } },
    { push: { page: "result", params: { source: "installer" } } }
  ];

  const workflow = actionsToWorkflow(actions, {
    source: "keys",
    event: "enter",
    path: ["pages", "home", "keys", "enter"]
  });

  assert.equal(workflow.nodes[0].type, "event");
  assert.deepEqual(
    workflow.nodes.filter((node) => node.type === "action").map((node) => node.data.actionType),
    ["set", "call", "push"]
  );
  assert.deepEqual(workflowToActions(workflow), actions);
});

test("if 分支展开为可连线节点并能无损写回", () => {
  const actions = [
    {
      if: {
        condition: { equals: ["state.code", 0] },
        then: [{ replace: { page: "success" } }],
        else: [{ push: { page: "error" } }]
      }
    },
    { notify: "finished" }
  ];

  const workflow = actionsToWorkflow(actions, { source: "on", event: "enter" });
  const condition = workflow.nodes.find((node) => node.data?.actionType === "if");
  const branchTypes = workflow.nodes
    .filter((node) => node.type === "action")
    .map((node) => node.data.actionType);
  const handles = workflow.edges
    .filter((item) => item.source === condition.id)
    .map((item) => item.sourceHandle)
    .sort();

  assert.deepEqual(branchTypes, ["if", "replace", "push", "notify"]);
  assert.deepEqual(handles, ["false", "true"]);
  assert.equal(workflow.nodes.some((node) => node.type === "join"), true);
  assert.deepEqual(workflowToActions(workflow), actions);
});

test("call 的逐行和退出回调成为独立连接支线", () => {
  const actions = [
    {
      call: {
        command: "./install.sh",
        wait: false,
        lines: "state.logs",
        onLine: [
          { set: { path: "state.progress", value: { bind: "key.value" } } }
        ],
        onExit: [
          { replace: { page: "result", params: { code: { bind: "key.code" } } } }
        ]
      }
    },
    { notify: "started" }
  ];

  const workflow = actionsToWorkflow(actions, { source: "keys", event: "enter" });
  const command = workflow.nodes.find((node) => node.data?.actionType === "call");
  const handles = workflow.edges
    .filter((item) => item.source === command.id)
    .map((item) => item.sourceHandle)
    .sort();

  assert.deepEqual(handles, ["exit", "line", "next"]);
  assert.equal(workflow.nodes.filter((node) => node.type === "callbackEnd").length, 2);
  assert.deepEqual(
    workflow.nodes.filter((node) => node.type === "action").map((node) => node.data.actionType),
    ["call", "set", "replace", "notify"]
  );
  assert.deepEqual(workflowToActions(workflow), actions);
});

test("存在未连接动作时拒绝写回以避免数据丢失", () => {
  const workflow = actionsToWorkflow([
    { set: { path: "state.value", value: 1 } },
    { notify: "done" }
  ], { source: "keys", event: "enter" });
  const first = workflow.nodes.find((node) => node.data?.actionType === "set");
  workflow.edges = workflow.edges
    .filter((edge) => edge.source !== first.id)
    .concat({ id: "skip", source: first.id, sourceHandle: "next", target: "end" });

  assert.throws(() => workflowToActions(workflow), /未连接/);
});

test("新建动作片段保持游离但保留条件节点的内部结构", () => {
  const fragment = createWorkflowFragment({
    if: { condition: { truthy: "state.ready" } }
  }, {
    id: "draft-condition",
    position: { x: 120, y: 80 }
  });

  assert.equal(fragment.rootId, "draft-condition");
  assert.equal(fragment.nodes.some((node) => node.type === "event" || node.type === "end"), false);
  assert.deepEqual(fragment.nodes.find((node) => node.id === fragment.rootId).position, { x: 120, y: 80 });
  assert.equal(fragment.nodes.filter((node) => node.type === "join").length, 1);
  assert.deepEqual(
    fragment.edges.map((edge) => edge.sourceHandle).sort(),
    ["false", "true"]
  );
});

test("游离片段由用户连线完成后才能写回", () => {
  const workflow = actionsToWorkflow([{ notify: "done" }], { source: "keys", event: "enter" });
  const first = workflow.nodes.find((node) => node.data?.actionType === "notify");
  const fragment = createWorkflowFragment({
    set: { path: "state.ready", value: true }
  }, {
    id: "draft-set",
    position: { x: 120, y: 80 }
  });
  const draft = {
    ...workflow,
    nodes: workflow.nodes.concat(fragment.nodes),
    edges: workflow.edges.concat(fragment.edges)
  };

  assert.throws(() => workflowToActions(draft), /未连接/);

  draft.edges = draft.edges
    .filter((edge) => edge.source !== "event")
    .concat(
      { id: "connect-draft", source: "event", sourceHandle: "next", target: fragment.rootId },
      { id: "connect-existing", source: fragment.tailId, sourceHandle: "next", target: first.id }
    );
  assert.deepEqual(workflowToActions(draft), [
    { set: { path: "state.ready", value: true } },
    { notify: "done" }
  ]);
});

test("可以把动作直接插入 call 的逐行支线", () => {
  const workflow = actionsToWorkflow([
    { call: { command: "./install.sh", wait: false } },
    { notify: "started" }
  ], { source: "keys", event: "enter" });
  const command = workflow.nodes.find((node) => node.data?.actionType === "call");
  const next = insertWorkflowAction(workflow, {
    after: command.id,
    handle: "line",
    id: "progress-update",
    action: { set: { path: "state.progress", value: { bind: "key.value" } } }
  });

  assert.deepEqual(workflowToActions(next), [
    {
      call: {
        command: "./install.sh",
        wait: false,
        onLine: [{ set: { path: "state.progress", value: { bind: "key.value" } } }]
      }
    },
    { notify: "started" }
  ]);
});

test("标量 service call 拒绝添加不受支持的回调", () => {
  const workflow = actionsToWorkflow([
    { call: "tasks.install" }
  ], { source: "keys", event: "enter" });
  const command = workflow.nodes.find((node) => node.data?.actionType === "call");

  assert.throws(() => insertWorkflowAction(workflow, {
    after: command.id,
    handle: "exit",
    id: "show-result",
    action: { push: { page: "result" } }
  }), /shell/);
});

test("对象形式的 service call 也拒绝 shell 回调", () => {
  const workflow = actionsToWorkflow([
    { call: { service: "tasks.install", with: {} } }
  ], { source: "keys", event: "enter" });
  const command = workflow.nodes.find((node) => node.data?.actionType === "call");

  assert.throws(() => insertWorkflowAction(workflow, {
    after: command.id,
    handle: "line",
    id: "read-line",
    action: { notify: "line" }
  }), /shell/);
});
