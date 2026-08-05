const ACTION_NAMES = new Set([
  "set", "move", "toggle", "remove", "append", "backspace", "push", "go",
  "replace", "reset", "pop", "quit", "call", "refresh", "notify", "if"
]);

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function actionType(action) {
  if (typeof action === "string") return action;
  if (!action || typeof action !== "object" || Array.isArray(action)) return "unknown";
  if (typeof action.do === "string") return action.do;
  return Object.keys(action).find((key) => ACTION_NAMES.has(key)) || "unknown";
}

function asActions(actions) {
  if (Array.isArray(actions)) return actions;
  return actions == null ? [] : [actions];
}

function actionLabel(action) {
  const type = actionType(action);
  if (type === "call" && action?.call && typeof action.call === "object") {
    return String(action.call.command || action.call.sh || action.call.service || "call");
  }
  if (["push", "go", "replace", "reset"].includes(type)) {
    const value = action?.[type];
    return `${type} ${typeof value === "string" ? value : value?.page || ""}`.trim();
  }
  return type;
}

function splitIfAction(action) {
  const stored = clone(action);
  const direct = stored && typeof stored === "object" && stored.do === "if";
  const config = direct ? stored : stored?.if;
  const valid = config && typeof config === "object" && !Array.isArray(config);
  const thenPresent = valid && Object.prototype.hasOwnProperty.call(config, "then");
  const elsePresent = valid && Object.prototype.hasOwnProperty.call(config, "else");
  const thenActions = valid ? asActions(config.then) : [];
  const elseActions = valid ? asActions(config.else) : [];
  if (valid) {
    delete config.then;
    delete config.else;
  }
  return {
    stored,
    thenActions,
    elseActions,
    branchPresence: { then: thenPresent, else: elsePresent }
  };
}

function splitCallAction(action) {
  const stored = clone(action);
  const direct = stored && typeof stored === "object" && stored.do === "call";
  const config = direct ? stored : stored?.call;
  const valid = config && typeof config === "object" && !Array.isArray(config);
  const linePresent = valid && Object.prototype.hasOwnProperty.call(config, "onLine");
  const exitPresent = valid && Object.prototype.hasOwnProperty.call(config, "onExit");
  const lineActions = valid ? asActions(config.onLine) : [];
  const exitActions = valid ? asActions(config.onExit) : [];
  if (valid) {
    delete config.onLine;
    delete config.onExit;
  }
  return {
    stored,
    lineActions,
    exitActions,
    callbackPresence: { line: linePresent, exit: exitPresent }
  };
}

function nodePosition(lane, depth) {
  return { x: 480 + lane * 320, y: 80 + depth * 160 };
}

function actionsToWorkflow(actions, event = {}) {
  const nodes = [{
    id: "event",
    type: "event",
    position: nodePosition(0, 0),
    data: {
      label: `${event.source || "keys"}.${event.event || "event"}`,
      source: event.source || "keys",
      event: event.event || "event",
      path: Array.isArray(event.path) ? event.path.slice() : [],
      isList: event.isList !== false
    }
  }];
  const edges = [];
  let edgeIndex = 0;

  const connect = (source, target, sourceHandle = "next") => {
    edges.push({
      id: `edge-${edgeIndex++}`,
      source,
      target,
      sourceHandle,
      data: { kind: sourceHandle }
    });
  };

  const addAction = (action, id, lane, depth) => {
    const type = actionType(action);
    let stored = clone(action);
    let branchPresence;
    let callbackPresence;
    let thenActions = [];
    let elseActions = [];
    let lineActions = [];
    let exitActions = [];

    if (type === "if") {
      const split = splitIfAction(action);
      stored = split.stored;
      branchPresence = split.branchPresence;
      thenActions = split.thenActions;
      elseActions = split.elseActions;
    } else if (type === "call") {
      const split = splitCallAction(action);
      stored = split.stored;
      callbackPresence = split.callbackPresence;
      lineActions = split.lineActions;
      exitActions = split.exitActions;
    }

    nodes.push({
      id,
      type: "action",
      position: nodePosition(lane, depth),
      data: {
        label: actionLabel(action),
        actionType: type,
        action: stored,
        branchPresence,
        callbackPresence
      }
    });

    if (type === "call") {
      let resultDepth = depth;
      for (const callback of [
        { present: callbackPresence?.line, actions: lineActions, handle: "line", lane: lane - 1 },
        { present: callbackPresence?.exit, actions: exitActions, handle: "exit", lane: lane + 1 }
      ]) {
        if (!callback.present) continue;
        const endId = `end-${id}-${callback.handle}`;
        const result = addSequence(
          callback.actions,
          `${id}-${callback.handle}`,
          { id, handle: callback.handle },
          endId,
          callback.lane,
          depth
        );
        const endDepth = result.depth + 1;
        nodes.push({
          id: endId,
          type: "callbackEnd",
          position: nodePosition(callback.lane, endDepth),
          data: { label: callback.handle === "line" ? "本行结束" : "退出回调结束", ownerId: id, branch: callback.handle }
        });
        resultDepth = Math.max(resultDepth, endDepth);
      }
      return { tail: { id, handle: "next" }, depth: resultDepth };
    }

    if (type !== "if") return { tail: { id, handle: "next" }, depth };

    const joinId = `join-${id}`;
    const thenResult = addSequence(
      thenActions,
      `${id}-then`,
      { id, handle: "true" },
      joinId,
      lane - 1,
      depth
    );
    const elseResult = addSequence(
      elseActions,
      `${id}-else`,
      { id, handle: "false" },
      joinId,
      lane + 1,
      depth
    );
    const joinDepth = Math.max(thenResult.depth, elseResult.depth) + 1;
    nodes.push({
      id: joinId,
      type: "join",
      position: nodePosition(lane, joinDepth),
      data: { label: "继续", ownerId: id }
    });
    return { tail: { id: joinId, handle: "next" }, depth: joinDepth };
  };

  function addSequence(list, prefix, entry, terminalId, lane, startDepth) {
    let tail = entry;
    let depth = startDepth;
    asActions(list).forEach((action, index) => {
      depth += 1;
      const id = `${prefix}-${index}`;
      connect(tail.id, id, tail.handle);
      const result = addAction(action, id, lane, depth);
      tail = result.tail;
      depth = result.depth;
    });
    connect(tail.id, terminalId, tail.handle);
    return { depth };
  }

  const endId = "end";
  const result = addSequence(asActions(actions), "action", { id: "event", handle: "next" }, endId, 0, 0);
  nodes.push({
    id: endId,
    type: "end",
    position: nodePosition(0, result.depth + 1),
    data: { label: "结束" }
  });

  return {
    version: 1,
    event: {
      source: event.source || "keys",
      event: event.event || "event",
      path: Array.isArray(event.path) ? event.path.slice() : [],
      isList: event.isList !== false
    },
    nodes,
    edges
  };
}

function workflowToActions(workflow) {
  const nodes = new Map((workflow?.nodes || []).map((node) => [node.id, node]));
  const edges = workflow?.edges || [];
  const visited = new Set();

  const targetFrom = (source, handle = "next") => {
    const matches = edges.filter((item) => item.source === source
      && (item.sourceHandle || "next") === handle);
    if (matches.length > 1) throw new Error(`节点 ${source} 的 ${handle} 出口只能连接一个节点。`);
    return matches[0]?.target;
  };

  const joinFor = (ownerId) => (workflow?.nodes || [])
    .find((node) => node.type === "join" && node.data?.ownerId === ownerId)?.id;

  const callbackEndFor = (ownerId, branch) => (workflow?.nodes || [])
    .find((node) => node.type === "callbackEnd"
      && node.data?.ownerId === ownerId
      && node.data?.branch === branch)?.id;

  const restoreIfAction = (node, joinId) => {
    const action = clone(node.data?.action);
    const direct = action && typeof action === "object" && action.do === "if";
    const config = direct ? action : action?.if;
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error(`条件节点 ${node.id} 的动作配置无效。`);
    }
    const thenActions = readSequence(node.id, "true", joinId);
    const elseActions = readSequence(node.id, "false", joinId);
    if (node.data?.branchPresence?.then || thenActions.length) config.then = thenActions;
    if (node.data?.branchPresence?.else || elseActions.length) config.else = elseActions;
    return action;
  };

  const restoreCallAction = (node) => {
    const action = clone(node.data?.action);
    const direct = action && typeof action === "object" && action.do === "call";
    const config = direct ? action : action?.call;
    if (!config || typeof config !== "object" || Array.isArray(config)) return action;

    for (const callback of [
      { field: "onLine", handle: "line" },
      { field: "onExit", handle: "exit" }
    ]) {
      const target = targetFrom(node.id, callback.handle);
      const endId = callbackEndFor(node.id, callback.handle);
      const actions = target ? readSequence(node.id, callback.handle, endId) : [];
      if (node.data?.callbackPresence?.[callback.handle] || target) config[callback.field] = actions;
    }
    return action;
  };

  function readSequence(source, handle, stopId) {
    const result = [];
    let current = targetFrom(source, handle);

    while (current && current !== stopId) {
      if (visited.has(current)) throw new Error(`节点 ${current} 被重复使用或形成循环。`);
      const node = nodes.get(current);
      if (!node || node.type !== "action") throw new Error(`节点 ${current} 无法写回动作列表。`);
      visited.add(current);

      if (node.data?.actionType === "if") {
        const joinId = joinFor(node.id);
        if (!joinId) throw new Error(`条件节点 ${node.id} 缺少合流节点。`);
        result.push(restoreIfAction(node, joinId));
        current = targetFrom(joinId, "next");
      } else if (node.data?.actionType === "call") {
        result.push(restoreCallAction(node));
        current = targetFrom(node.id, "next");
      } else {
        result.push(clone(node.data?.action));
        current = targetFrom(node.id, "next");
      }
    }

    if (stopId && current !== stopId) throw new Error(`流程没有连接到 ${stopId}。`);
    return result;
  }

  const actions = readSequence("event", "next", "end");
  const unconnected = (workflow?.nodes || [])
    .filter((node) => node.type === "action" && !visited.has(node.id))
    .map((node) => node.id);
  if (unconnected.length) {
    throw new Error(`流程中存在未连接动作：${unconnected.join("、")}`);
  }
  return actions;
}

function createWorkflowFragment(action, options = {}) {
  if (action === undefined) throw new Error("缺少要创建的动作。");
  const id = options.id || `action-${Date.now()}`;
  const fragment = actionsToWorkflow([action], { source: "fragment", event: "create" });
  const rootEdge = fragment.edges.find((edge) => edge.source === "event");
  const tailEdge = fragment.edges.find((edge) => edge.target === "end");
  if (!rootEdge || !tailEdge) throw new Error("无法创建动作节点。");

  const fragmentNodes = fragment.nodes.filter((node) => node.id !== "event" && node.id !== "end");
  const idMap = new Map(fragmentNodes.map((node) => [
    node.id,
    node.id === rootEdge.target ? id : `${id}-${node.id}`
  ]));
  const rootNode = fragmentNodes.find((node) => node.id === rootEdge.target);
  const targetPosition = options.position || rootNode?.position || { x: 0, y: 0 };
  const rootPosition = rootNode?.position || { x: 0, y: 0 };
  const offset = {
    x: targetPosition.x - rootPosition.x,
    y: targetPosition.y - rootPosition.y
  };
  const nodes = fragmentNodes.map((node) => {
    const nextNode = clone(node);
    nextNode.id = idMap.get(node.id);
    nextNode.position = {
      x: node.position.x + offset.x,
      y: node.position.y + offset.y
    };
    if (nextNode.data?.ownerId && idMap.has(nextNode.data.ownerId)) {
      nextNode.data.ownerId = idMap.get(nextNode.data.ownerId);
    }
    return nextNode;
  });
  const edges = fragment.edges
    .filter((edge) => edge.source !== "event" && edge.target !== "end")
    .map((edge) => ({
      ...clone(edge),
      id: `${id}-${edge.id}`,
      source: idMap.get(edge.source),
      target: idMap.get(edge.target)
    }));

  return {
    nodes,
    edges,
    rootId: idMap.get(rootEdge.target),
    tailId: idMap.get(tailEdge.source)
  };
}

function insertWorkflowAction(workflow, options = {}) {
  const result = clone(workflow);
  const nodes = result?.nodes || [];
  const edges = result?.edges || [];
  const sourceNode = nodes.find((node) => node.id === options.after);
  if (!sourceNode) throw new Error("找不到要插入动作的位置。");
  if (options.action === undefined) throw new Error("缺少要插入的动作。");

  let sourceId = sourceNode.id;
  const handle = options.handle || "next";
  if (["line", "exit"].includes(handle)) {
    const action = sourceNode.data?.action;
    const config = action && typeof action === "object" && !Array.isArray(action)
      ? action.do === "call" ? action : action.call
      : undefined;
    if (sourceNode.data?.actionType !== "call"
      || !config
      || typeof config !== "object"
      || Array.isArray(config)
      || (!Object.prototype.hasOwnProperty.call(config, "sh")
        && !Object.prototype.hasOwnProperty.call(config, "command"))) {
      throw new Error("逐行和退出回调只能添加到执行 sh 或 command 的 shell call。");
    }
  }
  if (handle === "next" && sourceNode.data?.actionType === "if") {
    sourceId = nodes.find((node) => node.type === "join" && node.data?.ownerId === sourceNode.id)?.id;
    if (!sourceId) throw new Error("条件节点缺少合流节点。");
  }

  const id = options.id || `action-${Date.now()}`;
  if (nodes.some((node) => node.id === id)) throw new Error(`节点 ID 已存在：${id}`);
  const sourcePosition = nodes.find((node) => node.id === sourceId)?.position || sourceNode.position || { x: 0, y: 0 };
  const laneOffset = handle === "line" || handle === "true"
    ? -320
    : handle === "exit" || handle === "false"
      ? 320
      : 0;
  const fragment = createWorkflowFragment(options.action, {
    id,
    position: { x: sourcePosition.x + laneOffset, y: sourcePosition.y + 160 }
  });
  nodes.push(...fragment.nodes);

  const outgoingIndex = edges.findIndex((edge) => edge.source === sourceId
    && (edge.sourceHandle || "next") === handle);
  const outgoing = outgoingIndex >= 0 ? edges.splice(outgoingIndex, 1)[0] : undefined;
  edges.push(...fragment.edges);
  edges.push({
    id: `${id}-incoming`,
    source: sourceId,
    sourceHandle: handle,
    target: fragment.rootId,
    data: { kind: handle }
  });
  if (outgoing) {
    edges.push({
      id: `${id}-outgoing`,
      source: fragment.tailId,
      sourceHandle: "next",
      target: outgoing.target,
      targetHandle: outgoing.targetHandle,
      data: { kind: "next" }
    });
  }

  return result;
}

module.exports = {
  actionsToWorkflow,
  createWorkflowFragment,
  insertWorkflowAction,
  workflowToActions
};
