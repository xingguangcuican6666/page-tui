import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow
} from "@xyflow/react";
import {
  AlertCircle,
  ArrowUpDown,
  ArrowRight,
  Bell,
  Box,
  Check,
  Code,
  CornerUpLeft,
  Delete as DeleteIcon,
  Filter,
  Flag,
  Gauge,
  GitBranch,
  GitMerge,
  ListX,
  ListPlus,
  PanelLeftOpen,
  Plus,
  Power,
  RefreshCw,
  Repeat2,
  RotateCcw,
  Save,
  Terminal,
  ToggleLeft,
  Trash2,
  Variable,
  X
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import "./workflow-editor.css";
import { createWorkflowFragment, workflowToActions } from "../workflow-model";
import {
  ACTION_LABELS,
  NODE_CATALOG,
  createWorkflowAction,
  isShellCall
} from "../workflow-actions";
import { StructuredActionEditor } from "./action-inspector";

const bridge = window.pageTuiVscode || {
  postMessage() {},
  getState() { return {}; },
  setState() {}
};

const EDGE_LABELS = { true: "满足", false: "不满足", line: "逐行", exit: "退出" };
const DRAG_TYPE = "application/x-page-tui-node";
const TEMPLATE_ICONS = {
  call: Terminal,
  command: Code,
  service: Box,
  set: Variable,
  extract: Filter,
  append: ListPlus,
  move: ArrowUpDown,
  toggle: ToggleLeft,
  remove: ListX,
  backspace: DeleteIcon,
  progress: Gauge,
  if: GitBranch,
  notify: Bell,
  refresh: RefreshCw,
  push: ArrowRight,
  replace: Repeat2,
  reset: RotateCcw,
  pop: CornerUpLeft,
  quit: Power
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function actionSummary(type, action) {
  const config = action?.[type];
  if (type === "call") return String(
    typeof config === "string" ? config : config?.command || config?.sh || config?.service || "外部命令"
  );
  if (type === "set") return String(config?.path || "设置变量");
  if (type === "move") return String(config?.path || "移动选择");
  if (type === "toggle") return String(typeof config === "string" ? config : config?.path || config?.field || "切换变量");
  if (type === "remove") return String(config?.list || config?.within || "删除列表项");
  if (type === "backspace") return String(typeof config === "string" ? config : config?.path || "删除字符");
  if (["push", "replace", "reset"].includes(type)) return String(typeof config === "string" ? config : config?.page || "页面");
  if (type === "notify") return String(config || "通知");
  if (type === "refresh") return "刷新界面";
  if (type === "if") return "条件分支";
  return type;
}

function hasCallCallbackConfig(action) {
  return isShellCall(action);
}

function TargetHandle() {
  return <Handle type="target" position={Position.Top} className="wf-handle" />;
}

function EventNode({ data, selected }) {
  return <div className={`wf-node wf-node-event${selected ? " selected" : ""}`}>
    <div className="wf-node-kicker">事件</div>
    <strong>{data.label}</strong>
    <Handle type="source" id="next" position={Position.Bottom} className="wf-handle" />
  </div>;
}

function ActionNode({ data, selected }) {
  const type = data.actionType || "unknown";
  const callCallbacks = type === "call" && hasCallCallbackConfig(data.action);
  return <div className={`wf-node wf-node-action wf-kind-${type}${selected ? " selected" : ""}`}>
    <TargetHandle />
    <div className="wf-node-kicker">{ACTION_LABELS[type] || type}</div>
    <strong>{actionSummary(type, data.action)}</strong>
    {type === "if" ? <>
      <span className="wf-port-label wf-port-true">满足</span>
      <Handle type="source" id="true" position={Position.Bottom} className="wf-handle wf-handle-true" style={{ left: "28%" }} />
      <span className="wf-port-label wf-port-false">不满足</span>
      <Handle type="source" id="false" position={Position.Bottom} className="wf-handle wf-handle-false" style={{ left: "72%" }} />
    </> : type === "call" ? <>
      <Handle type="source" id="next" position={Position.Bottom} className="wf-handle" />
      {callCallbacks ? <>
        <span className="wf-port-label wf-port-line">逐行</span>
        <Handle type="source" id="line" position={Position.Left} className="wf-handle wf-handle-line" />
        <span className="wf-port-label wf-port-exit">退出</span>
        <Handle type="source" id="exit" position={Position.Right} className="wf-handle wf-handle-exit" />
      </> : null}
    </> : <Handle type="source" id="next" position={Position.Bottom} className="wf-handle" />}
  </div>;
}

function JoinNode({ data, selected }) {
  return <div className={`wf-node wf-node-join${selected ? " selected" : ""}`} title="条件节点自动生成的合流点">
    <TargetHandle />
    <span>{data.label || "继续"}</span>
    <Handle type="source" id="next" position={Position.Bottom} className="wf-handle" />
  </div>;
}

function EndNode({ data, selected }) {
  return <div className={`wf-node wf-node-end${selected ? " selected" : ""}`} title="事件流程自动生成的终点">
    <TargetHandle />
    <strong>{data.label || "结束"}</strong>
  </div>;
}

function CallbackEndNode({ data, selected }) {
  return <div className={`wf-node wf-node-callback-end${selected ? " selected" : ""}`}>
    <TargetHandle />
    <span>{data.label}</span>
  </div>;
}

const NODE_TYPES = {
  event: EventNode,
  action: ActionNode,
  join: JoinNode,
  end: EndNode,
  callbackEnd: CallbackEndNode
};

function decorateEdges(edges) {
  return (edges || []).map((edge) => ({
    ...edge,
    type: "smoothstep",
    label: EDGE_LABELS[edge.sourceHandle] || undefined,
    markerEnd: { type: MarkerType.ArrowClosed },
    className: `wf-edge wf-edge-${edge.sourceHandle || "next"}`
  }));
}

function savedPositions(eventId) {
  return bridge.getState()?.workflowPositions?.[eventId] || {};
}

function mergePositions(eventId, nodes) {
  const positions = savedPositions(eventId);
  return (nodes || []).map((node) => positions[node.id]
    ? { ...node, position: positions[node.id] }
    : node);
}

function persistPositions(eventId, nodes) {
  const state = bridge.getState() || {};
  const positions = Object.fromEntries(nodes.map((node) => [node.id, node.position]));
  bridge.setState({
    ...state,
    workflowPositions: { ...(state.workflowPositions || {}), [eventId]: positions }
  });
}

function workflowDraftKey(entry) {
  const event = entry?.workflow?.event || {};
  return JSON.stringify([event.source, event.event, event.path || entry?.path || []]);
}

function savedDraft(entry) {
  return bridge.getState()?.workflowDrafts?.[workflowDraftKey(entry)];
}

function persistDraft(entry, nodes, edges) {
  const state = bridge.getState() || {};
  bridge.setState({
    ...state,
    workflowDrafts: {
      ...(state.workflowDrafts || {}),
      [workflowDraftKey(entry)]: { nodes: clone(nodes), edges: clone(edges) }
    }
  });
}

function clearDraft(entry) {
  const state = bridge.getState() || {};
  if (!state.workflowDrafts?.[workflowDraftKey(entry)]) return;
  const workflowDrafts = { ...state.workflowDrafts };
  delete workflowDrafts[workflowDraftKey(entry)];
  bridge.setState({ ...state, workflowDrafts });
}

function TemplateIcon({ templateId, size = 15 }) {
  const Icon = TEMPLATE_ICONS[templateId] || Plus;
  return <Icon size={size} />;
}

function NodePalette() {
  const startDrag = (event, templateId) => {
    event.dataTransfer.setData(DRAG_TYPE, templateId);
    event.dataTransfer.setData("text/plain", templateId);
    event.dataTransfer.effectAllowed = "copy";
  };

  return <div className="wf-node-palette">
    {NODE_CATALOG.map((group) => <section key={group.id}>
      <h3>{group.label}</h3>
      <div className="wf-palette-items">
        {group.items.map((item) => <button
          type="button"
          draggable="true"
          key={item.id}
          className="wf-palette-item"
          data-template-id={item.id}
          title={item.label}
          onDragStart={(event) => startDrag(event, item.id)}
        ><TemplateIcon templateId={item.id} />{item.label}</button>)}
      </div>
    </section>)}
    <section className="wf-palette-automatic">
      <h3>自动结构</h3>
      <div className="wf-palette-auto" title="条件节点自动生成的合流点"><GitMerge size={15} /><span>继续（自动）</span></div>
      <div className="wf-palette-auto" title="每个事件自动生成的终点"><Flag size={15} /><span>结束（自动）</span></div>
    </section>
  </div>;
}

function findTail(node, nodes) {
  if (node?.data?.actionType !== "if") return node?.id;
  return nodes.find((item) => item.type === "join" && item.data?.ownerId === node.id)?.id;
}

function ownedControlNodes(nodeId, nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const owned = new Set([nodeId]);
  const nextTarget = (source, handle) => edges.find((edge) => edge.source === source
    && (edge.sourceHandle || "next") === handle)?.target;

  const collectSequence = (current, stop) => {
    while (current && current !== stop && !owned.has(current)) {
      const node = byId.get(current);
      if (!node || node.type !== "action") return;
      collectAction(node);
      const tail = findTail(node, nodes) || node.id;
      current = nextTarget(tail, "next");
    }
  };
  const collectAction = (node) => {
    owned.add(node.id);
    if (node.data?.actionType === "if") {
      const join = nodes.find((item) => item.type === "join" && item.data?.ownerId === node.id);
      if (!join) return;
      collectSequence(nextTarget(node.id, "true"), join.id);
      collectSequence(nextTarget(node.id, "false"), join.id);
      owned.add(join.id);
    }
    if (node.data?.actionType === "call") {
      for (const branch of ["line", "exit"]) {
        const end = nodes.find((item) => item.type === "callbackEnd"
          && item.data?.ownerId === node.id && item.data?.branch === branch);
        collectSequence(nextTarget(node.id, branch), end?.id);
        if (end) owned.add(end.id);
      }
    }
  };

  const root = byId.get(nodeId);
  if (root?.type === "action") collectAction(root);
  return owned;
}

function FlowCanvas({ entry, variablePaths, pageRoutes }) {
  const instance = useReactFlow();
  const initialWorkflow = savedDraft(entry) || entry.workflow;
  const [nodes, setNodes] = useState(() => mergePositions(entry.id, clone(initialWorkflow.nodes)));
  const [edges, setEdges] = useState(() => decorateEdges(clone(initialWorkflow.edges)));
  const [selectedId, setSelectedId] = useState("event");
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [newType, setNewType] = useState("call");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [status, setStatus] = useState(() => savedDraft(entry)
    ? { kind: "draft", text: "草稿尚未连接" }
    : { kind: "ready", text: "已同步" });
  const [contextMenu, setContextMenu] = useState(null);

  const selected = nodes.find((node) => node.id === selectedId);
  const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);

  useEffect(() => {
    const draft = savedDraft(entry);
    const source = draft || entry.workflow;
    const nextNodes = mergePositions(entry.id, clone(source.nodes));
    setNodes(nextNodes);
    setEdges(decorateEdges(clone(source.edges)));
    setSelectedId("event");
    setSelectedEdgeId(null);
    setStatus(draft
      ? { kind: "draft", text: "草稿尚未连接" }
      : { kind: "ready", text: "已同步" });
    requestAnimationFrame(() => instance.fitView({ padding: 0.2, duration: 180 }));
  }, [entry.id, entry.workflow, instance]);

  useEffect(() => {
    const resize = () => requestAnimationFrame(() => instance.fitView({ padding: 0.2, duration: 120 }));
    window.addEventListener("page-tui-workflow-resize", resize);
    return () => window.removeEventListener("page-tui-workflow-resize", resize);
  }, [instance]);

  useEffect(() => {
    const showError = (event) => {
      persistDraft(entry, nodes, edges);
      setStatus({
        kind: "error",
        text: event.detail?.message || "YAML 写入失败"
      });
    };
    window.addEventListener("page-tui-workflow-error", showError);
    return () => window.removeEventListener("page-tui-workflow-error", showError);
  }, [edges, entry, nodes]);

  useEffect(() => {
    const close = (event) => {
      if (event.type !== "keydown" || event.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("blur", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", close);
    };
  }, []);

  const commit = useCallback((nextNodes, nextEdges) => {
    const workflow = {
      ...clone(entry.workflow),
      nodes: clone(nextNodes),
      edges: clone(nextEdges)
    };
    try {
      workflowToActions(workflow);
      clearDraft(entry);
      bridge.postMessage({ type: "workflowUpdate", workflow });
      setStatus({ kind: "pending", text: "正在写入" });
      return true;
    } catch (error) {
      persistDraft(entry, nextNodes, nextEdges);
      setStatus({ kind: "draft", text: `草稿：${error.message || String(error)}` });
      return false;
    }
  }, [entry]);

  const onNodesChange = useCallback((changes) => {
    setNodes((current) => {
      const next = applyNodeChanges(changes, current);
      if (changes.some((change) => change.type === "position" && change.dragging === false)) {
        persistPositions(entry.id, next);
      }
      return next;
    });
  }, [entry.id]);

  const onEdgesChange = useCallback((changes) => {
    setEdges((current) => {
      const next = applyEdgeChanges(changes, current);
      const removed = new Set(changes.filter((change) => change.type === "remove").map((change) => change.id));
      if (removed.size) {
        if (removed.has(selectedEdgeId)) setSelectedEdgeId(null);
        commit(nodes, next);
      }
      return next;
    });
  }, [commit, nodes, selectedEdgeId]);

  const onConnect = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    setEdges((current) => {
      const handle = connection.sourceHandle || "next";
      const withoutPrevious = current.filter((edge) => !(edge.source === connection.source
        && (edge.sourceHandle || "next") === handle));
      const next = decorateEdges(addEdge({
        ...connection,
        id: `user-edge-${Date.now()}`,
        sourceHandle: handle,
        data: { kind: handle }
      }, withoutPrevious));
      setSelectedEdgeId(null);
      commit(nodes, next);
      return next;
    });
  }, [commit, nodes]);

  const createNode = useCallback((templateId, position) => {
    try {
      const id = `user-${Date.now()}`;
      const anchor = selected?.position || nodes.find((node) => node.id === "event")?.position || { x: 480, y: 80 };
      const fragment = createWorkflowFragment(createWorkflowAction(templateId), {
        id,
        position: position || { x: anchor.x + 240, y: anchor.y + 100 }
      });
      const nextNodes = nodes.concat(fragment.nodes).map((node) => ({
        ...node,
        selected: node.id === fragment.rootId
      }));
      const nextEdges = decorateEdges(edges.concat(fragment.edges));
      setNodes(nextNodes);
      setEdges(nextEdges);
      setSelectedId(fragment.rootId);
      setSelectedEdgeId(null);
      persistPositions(entry.id, nextNodes);
      persistDraft(entry, nextNodes, nextEdges);
      setStatus({ kind: "draft", text: "草稿：节点未连接" });
      setContextMenu(null);
      setPaletteOpen(false);
    } catch (error) {
      setStatus({ kind: "error", text: error.message || String(error) });
    }
  }, [edges, entry, nodes, selected]);

  const addNode = useCallback(() => createNode(newType), [createNode, newType]);

  const openContextMenu = useCallback((event) => {
    event.preventDefault();
    const position = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const width = 230;
    const height = 420;
    setContextMenu({
      x: Math.max(6, Math.min(event.clientX, window.innerWidth - width - 6)),
      y: Math.max(6, Math.min(event.clientY, window.innerHeight - height - 6)),
      position
    });
  }, [instance]);

  const dropNode = useCallback((event) => {
    event.preventDefault();
    const templateId = event.dataTransfer.getData(DRAG_TYPE)
      || event.dataTransfer.getData("text/plain");
    if (!NODE_CATALOG.some((group) => group.items.some((item) => item.id === templateId))) return;
    const position = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    createNode(templateId, position);
  }, [createNode, instance]);

  const deleteSelected = useCallback(() => {
    if (!selected || selected.type !== "action") return;
    const owned = ownedControlNodes(selected.id, nodes, edges);
    const nextNodes = nodes.filter((node) => !owned.has(node.id));
    const nextEdges = decorateEdges(edges.filter((edge) => !owned.has(edge.source) && !owned.has(edge.target)));
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedId("event");
    setSelectedEdgeId(null);
    commit(nextNodes, nextEdges);
  }, [commit, edges, nodes, selected]);

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdge) return;
    const nextEdges = edges.filter((edge) => edge.id !== selectedEdge.id);
    setEdges(nextEdges);
    setSelectedEdgeId(null);
    setSelectedId(selectedEdge.source);
    commit(nodes, nextEdges);
  }, [commit, edges, nodes, selectedEdge]);

  useEffect(() => {
    const removeEdge = (event) => {
      if (!selectedEdge || !["Delete", "Backspace"].includes(event.key)) return;
      const target = event.target;
      if (target instanceof HTMLElement
        && (target.matches("input, textarea, select") || target.isContentEditable)) return;
      event.preventDefault();
      deleteSelectedEdge();
    };
    window.addEventListener("keydown", removeEdge);
    return () => window.removeEventListener("keydown", removeEdge);
  }, [deleteSelectedEdge, selectedEdge]);

  const saveAction = useCallback((action) => {
    if (!selected || selected.type !== "action") return;
    const type = selected.data.actionType;
    const callbackUsed = edges.some((edge) => edge.source === selected.id
      && ["line", "exit"].includes(edge.sourceHandle));
    if (type === "call" && callbackUsed && !isShellCall(action)) {
      setStatus({ kind: "error", text: "存在逐行或退出回调时，call 必须执行 shell 命令。" });
      return;
    }
    const nextNodes = nodes.map((node) => node.id === selected.id
      ? { ...node, data: { ...node.data, action, label: actionSummary(type, action) } }
      : node);
    setNodes(nextNodes);
    commit(nextNodes, edges);
  }, [commit, edges, nodes, selected]);

  const selectedCallbackUsed = Boolean(selected?.type === "action"
    && edges.some((edge) => edge.source === selected.id
      && ["line", "exit"].includes(edge.sourceHandle)));

  return <div className="wf-editor-shell">
    <div className="wf-canvas-toolbar">
      <select value={newType} onChange={(event) => setNewType(event.target.value)} aria-label="节点模板">
        {NODE_CATALOG.map((group) => <optgroup key={group.id} label={group.label}>
          {group.items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </optgroup>)}
      </select>
      <button type="button" onClick={addNode} title="创建未连接节点"><Plus size={15} />添加节点</button>
      <button
        type="button"
        className="wf-mobile-palette-button"
        aria-label="节点库"
        title="打开节点库"
        onClick={() => setPaletteOpen((open) => !open)}
      ><PanelLeftOpen size={15} /></button>
      <span className={`wf-status ${status.kind}`} title={status.text}>
        {status.kind === "error" ? <AlertCircle size={14} /> : status.kind === "pending" ? <Save size={14} /> : <Check size={14} />}{status.text}
      </span>
    </div>
    {paletteOpen ? <div className="wf-mobile-palette-drawer" role="dialog" aria-label="节点库">
      <div className="wf-mobile-palette-heading"><strong>节点库</strong><button type="button" className="icon-button" aria-label="关闭节点库" title="关闭节点库" onClick={() => setPaletteOpen(false)}><X size={15} /></button></div>
      <NodePalette />
    </div> : null}
    <datalist id="wf-variable-paths">{variablePaths.map((path) => <option key={path} value={path} />)}</datalist>
    <datalist id="wf-route-paths">{pageRoutes.map((route) => <option key={route} value={route} />)}</datalist>
    <div className="wf-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={dropNode}
        onNodeClick={(_, node) => {
          setSelectedId(node.id);
          setSelectedEdgeId(null);
        }}
        onEdgeClick={(_, edge) => {
          setSelectedEdgeId(edge.id);
          setSelectedId("");
          setContextMenu(null);
        }}
        onNodeContextMenu={(event) => openContextMenu(event)}
        onPaneContextMenu={(event) => openContextMenu(event)}
        onPaneClick={() => {
          setContextMenu(null);
          setSelectedEdgeId(null);
          setPaletteOpen(false);
        }}
        deleteKeyCode={null}
        fitView
        minZoom={0.2}
        maxZoom={1.8}
        defaultEdgeOptions={{ type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } }}
      >
        <Background gap={20} size={1} />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
      {contextMenu ? <div
        className="wf-context-menu"
        role="menu"
        style={{ left: contextMenu.x, top: contextMenu.y }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {NODE_CATALOG.map((group) => <section key={group.id}>
          <h3>{group.label}</h3>
          {group.items.map((item) => <button
            type="button"
            role="menuitem"
            key={item.id}
            onClick={() => createNode(item.id, contextMenu.position)}
          ><TemplateIcon templateId={item.id} />{item.label}</button>)}
        </section>)}
      </div> : null}
    </div>
    <aside className="wf-inspector">
      {selectedEdge ? <>
        <div className="wf-inspector-heading"><div><span>连线</span><strong>{EDGE_LABELS[selectedEdge.sourceHandle] || "后续"}</strong></div><button type="button" className="icon-button danger" onClick={deleteSelectedEdge} title="删除连线" aria-label="删除连线"><Trash2 size={16} /></button></div>
        <div className="wf-inspector-summary"><span>连接节点</span><strong>{selectedEdge.source} → {selectedEdge.target}</strong></div>
      </> : selected?.type === "action" ? <>
        <div className="wf-inspector-heading"><div><span>动作</span><strong>{selected.data.actionType}</strong></div><button type="button" className="icon-button danger" onClick={deleteSelected} title="删除节点" aria-label="删除节点"><Trash2 size={16} /></button></div>
        <StructuredActionEditor
          node={selected}
          callbackUsed={selectedCallbackUsed}
          pageRoutes={pageRoutes}
          onSave={saveAction}
        />
      </> : <div className="wf-inspector-summary"><span>{selected?.type === "event" ? "事件入口" : selected?.type === "join" ? "条件合流" : "流程节点"}</span><strong>{selected?.data?.label || "未选择"}</strong></div>}
    </aside>
  </div>;
}

function WorkflowApp() {
  const [model, setModel] = useState(() => window.__PAGE_TUI_WORKFLOW_MODEL__ || {});
  const [activeId, setActiveId] = useState(() => model.workflows?.[0]?.id || "");

  useEffect(() => {
    const update = (event) => {
      const next = event.detail || {};
      setModel(next);
      setActiveId((current) => next.workflows?.some((item) => item.id === current)
        ? current
        : next.workflows?.[0]?.id || "");
    };
    window.addEventListener("page-tui-workflow-model", update);
    return () => window.removeEventListener("page-tui-workflow-model", update);
  }, []);

  const workflows = model.workflows || [];
  const active = workflows.find((item) => item.id === activeId) || workflows[0];
  return <div className="wf-shell">
    <aside className="wf-event-list">
      <div className="wf-event-title"><span>页面</span><strong>{model.selectedPage || ""}</strong></div>
      <div className="wf-event-items">{workflows.map((item) => <button type="button" key={item.id} className={item.id === active?.id ? "active" : ""} onClick={() => setActiveId(item.id)}>{item.id}</button>)}</div>
      <NodePalette />
    </aside>
    <main className="wf-main">
      {active ? <ReactFlowProvider><FlowCanvas
        key={`${model.selectedPage}:${active.id}`}
        entry={active}
        variablePaths={model.variablePaths || []}
        pageRoutes={(model.pages || []).map((page) => page.name)}
      /></ReactFlowProvider> : <div className="wf-empty">当前页面没有事务动作</div>}
    </main>
  </div>;
}

const root = document.getElementById("workflow-root");
if (root) createRoot(root).render(<WorkflowApp />);
