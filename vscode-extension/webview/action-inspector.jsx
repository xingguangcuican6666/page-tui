import React, { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import {
  actionConfig,
  actionWithConfig,
  callMode,
  changeCallMode
} from "../workflow-actions";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function parseLooseValue(value) {
  const text = String(value);
  const trimmed = text.trim();
  if (trimmed === "") return "";
  if (/^(true|false|null)$/.test(trimmed) || /^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
    return JSON.parse(trimmed);
  }
  if ((trimmed.startsWith("{") && trimmed.endsWith("}"))
    || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return text;
    }
  }
  return text;
}

function fixedText(value) {
  return typeof value === "string" ? value : JSON.stringify(value ?? "");
}

function configObject(action, type) {
  const config = actionConfig(action, type);
  return isObject(config) ? clone(config) : {};
}

function withField(action, type, field, value) {
  const config = configObject(action, type);
  if (value === undefined) delete config[field];
  else config[field] = clone(value);
  return actionWithConfig(action, type, config);
}

function Segmented({ label, value, options, onChange }) {
  return <div className="wf-form-field">
    <span className="wf-field-label">{label}</span>
    <div className="wf-segmented" role="group" aria-label={label}>
      {options.map((option) => <button
        type="button"
        key={option.value}
        className={value === option.value ? "active" : ""}
        aria-pressed={value === option.value}
        disabled={option.disabled}
        title={option.title}
        onClick={() => onChange(option.value)}
      >{option.label}</button>)}
    </div>
  </div>;
}

function BufferedJsonField({ label, value, onChange, minRows = 4 }) {
  const serialized = useMemo(() => pretty(value), [value]);
  const [text, setText] = useState(serialized);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(serialized);
    setInvalid(false);
  }, [serialized]);

  const apply = () => {
    try {
      onChange(JSON.parse(text));
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  };

  return <label className="wf-form-field">
    <span className="wf-field-label">{label}</span>
    <textarea
      value={text}
      rows={minRows}
      aria-invalid={invalid}
      onChange={(event) => setText(event.target.value)}
      onBlur={apply}
      spellCheck="false"
    />
  </label>;
}

function valueMode(value) {
  if (isObject(value) && Object.hasOwn(value, "bind")) return "variable";
  if (isObject(value) && Object.hasOwn(value, "template")) return "template";
  if (isObject(value) && (Object.hasOwn(value, "t") || Object.hasOwn(value, "i18n"))) return "translation";
  if (isObject(value) || Array.isArray(value)) return "json";
  return "fixed";
}

function ValueEditor({ label, value, onChange, suggestions = [], compact = false }) {
  const mode = valueMode(value);
  const setMode = (next) => {
    if (next === "variable") onChange({ bind: "state.value" });
    else if (next === "template") onChange({ template: "{{ state.value }}" });
    else if (next === "translation") onChange({ t: "common.text" });
    else if (next === "json") onChange(isObject(value) || Array.isArray(value) ? value : {});
    else onChange(isObject(value) || Array.isArray(value) ? "" : value ?? "");
  };

  return <div className={`wf-value-editor${compact ? " compact" : ""}`}>
    <div className="wf-value-heading">
      <span className="wf-field-label">{label}</span>
      <div className="wf-value-modes" role="group" aria-label={`${label}来源`}>
        {[
          ["fixed", "固定"],
          ["variable", "变量"],
          ["template", "模板"],
          ["translation", "翻译"],
          ["json", "JSON"]
        ].map(([key, text]) => <button
          type="button"
          key={key}
          className={mode === key ? "active" : ""}
          aria-pressed={mode === key}
          onClick={() => setMode(key)}
        >{text}</button>)}
      </div>
    </div>
    {mode === "variable" ? <input
      aria-label={label}
      list="wf-variable-paths"
      value={value.bind || ""}
      onChange={(event) => onChange({ bind: event.target.value })}
    /> : mode === "template" ? <input
      aria-label={label}
      value={value.template || ""}
      onChange={(event) => onChange({ template: event.target.value })}
    /> : mode === "translation" ? <div className="wf-translation-editor">
      <label className="wf-form-field">
        <span className="wf-field-label">翻译键</span>
        <input
          aria-label={`${label}翻译键`}
          value={value.t ?? value.i18n ?? ""}
          placeholder="common.title"
          onChange={(event) => onChange({
            t: event.target.value,
            ...(value.with !== undefined
              ? { with: value.with }
              : value.params !== undefined
                ? { with: value.params }
                : {})
          })}
        />
      </label>
      <BufferedJsonField
        label="模板参数 JSON"
        value={value.with || value.params || {}}
        onChange={(parameters) => onChange({ t: value.t ?? value.i18n ?? "", with: parameters })}
        minRows={compact ? 2 : 3}
      />
    </div> : mode === "json" ? <BufferedJsonField
      label={`${label} JSON`}
      value={value}
      onChange={onChange}
      minRows={compact ? 2 : 4}
    /> : <input
      aria-label={label}
      list={suggestions.length ? "wf-route-paths" : undefined}
      value={fixedText(value)}
      onChange={(event) => onChange(parseLooseValue(event.target.value))}
    />}
  </div>;
}

const CONDITION_OPTIONS = [
  ["truthy", "为真"],
  ["notEmpty", "非空"],
  ["empty", "为空"],
  ["equals", "等于"],
  ["notEquals", "不等于"],
  ["all", "全部满足"],
  ["any", "任一满足"],
  ["not", "取反"],
  ["custom", "高级 JSON"]
];

function conditionOperator(value) {
  if (typeof value === "string") return "truthy";
  if (!isObject(value)) return "truthy";
  const key = Object.keys(value)[0];
  return CONDITION_OPTIONS.some(([name]) => name === key) ? key : "custom";
}

function defaultCondition(operator) {
  if (["truthy", "notEmpty", "empty"].includes(operator)) return { [operator]: "state.value" };
  if (["equals", "notEquals"].includes(operator)) return { [operator]: [{ bind: "state.value" }, ""] };
  if (["all", "any"].includes(operator)) return { [operator]: [{ truthy: "state.value" }] };
  if (operator === "not") return { not: { truthy: "state.value" } };
  return { truthy: "state.value" };
}

function ConditionEditor({ value, onChange, depth = 0 }) {
  const operator = conditionOperator(value);
  const object = isObject(value) ? value : { truthy: value || "state.value" };
  const changeOperator = (next) => onChange(next === "custom" ? clone(object) : defaultCondition(next));

  let body;
  if (["truthy", "notEmpty", "empty"].includes(operator)) {
    body = <ValueEditor label="值" value={object[operator]} onChange={(next) => onChange({ [operator]: next })} compact />;
  } else if (["equals", "notEquals"].includes(operator)) {
    const operands = Array.isArray(object[operator])
      ? object[operator]
      : [object[operator]?.left, object[operator]?.right];
    body = <div className="wf-condition-operands">
      <ValueEditor label="左值" value={operands[0]} onChange={(next) => onChange({ [operator]: [next, operands[1]] })} compact />
      <ValueEditor label="右值" value={operands[1]} onChange={(next) => onChange({ [operator]: [operands[0], next] })} compact />
    </div>;
  } else if (["all", "any"].includes(operator)) {
    const items = Array.isArray(object[operator]) ? object[operator] : [];
    body = <div className="wf-condition-list">
      {items.map((item, index) => <div className="wf-condition-item" key={index}>
        <ConditionEditor
          value={item}
          depth={depth + 1}
          onChange={(next) => onChange({
            [operator]: items.map((current, itemIndex) => itemIndex === index ? next : current)
          })}
        />
        <button
          type="button"
          className="icon-button"
          aria-label="删除条件"
          title="删除条件"
          onClick={() => onChange({ [operator]: items.filter((_, itemIndex) => itemIndex !== index) })}
        ><Trash2 size={14} /></button>
      </div>)}
      <button type="button" className="wf-small-command" onClick={() => onChange({
        [operator]: items.concat(defaultCondition("truthy"))
      })}><Plus size={14} />添加条件</button>
    </div>;
  } else if (operator === "not") {
    body = <ConditionEditor value={object.not} depth={depth + 1} onChange={(next) => onChange({ not: next })} />;
  } else {
    body = <BufferedJsonField label="条件 JSON" value={value} onChange={onChange} />;
  }

  return <div className={`wf-condition-editor depth-${Math.min(depth, 2)}`}>
    <label className="wf-form-field inline">
      <span className="wf-field-label">条件类型</span>
      <select aria-label="条件类型" value={operator} onChange={(event) => changeOperator(event.target.value)}>
        {CONDITION_OPTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    {body}
  </div>;
}

function PathField({ label, value, onChange, suggestions = "variables", placeholder = "state.value" }) {
  return <label className="wf-form-field">
    <span className="wf-field-label">{label}</span>
    <input
      aria-label={label}
      list={suggestions === "routes" ? "wf-route-paths" : "wf-variable-paths"}
      value={value || ""}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  </label>;
}

function ObjectMapEditor({ label, value, onChange }) {
  const object = isObject(value) ? value : {};
  const entries = Object.entries(object);
  const updateKey = (oldKey, newKey) => {
    const next = {};
    for (const [key, item] of entries) next[key === oldKey ? newKey : key] = item;
    onChange(next);
  };
  const updateValue = (key, nextValue) => onChange({ ...object, [key]: nextValue });
  const remove = (key) => onChange(Object.fromEntries(entries.filter(([name]) => name !== key)));
  const add = () => {
    let index = entries.length + 1;
    while (Object.hasOwn(object, `key${index}`)) index += 1;
    onChange({ ...object, [`key${index}`]: "" });
  };

  return <div className="wf-map-editor">
    <div className="wf-section-heading"><strong>{label}</strong><button type="button" className="icon-button" onClick={add} title={`添加${label}`} aria-label={`添加${label}`}><Plus size={14} /></button></div>
    {entries.map(([key, item]) => <div className="wf-map-row" key={key}>
      <input aria-label={`${label}名称`} value={key} onChange={(event) => updateKey(key, event.target.value)} />
      <ValueEditor label={`${key} 值`} value={item} onChange={(next) => updateValue(key, next)} compact />
      <button type="button" className="icon-button" title={`删除 ${key}`} aria-label={`删除 ${key}`} onClick={() => remove(key)}><Trash2 size={14} /></button>
    </div>)}
  </div>;
}

function ArgsEditor({ value, onChange }) {
  const args = Array.isArray(value) ? value : [];
  return <div className="wf-list-editor">
    <div className="wf-section-heading"><strong>参数</strong><button type="button" className="icon-button" onClick={() => onChange(args.concat(""))} title="添加参数" aria-label="添加参数"><Plus size={14} /></button></div>
    {args.map((item, index) => <div className="wf-list-row" key={index}>
      <ValueEditor label={`参数 ${index + 1}`} value={item} onChange={(next) => onChange(args.map((current, itemIndex) => itemIndex === index ? next : current))} compact />
      <button type="button" className="icon-button" title={`删除参数 ${index + 1}`} aria-label={`删除参数 ${index + 1}`} onClick={() => onChange(args.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button>
    </div>)}
  </div>;
}

const OUTPUT_FIELDS = [
  ["result", "完整结果", "state.command"],
  ["stdout", "标准输出", "state.stdout"],
  ["stderr", "错误输出", "state.stderr"],
  ["lines", "输出行列表", "state.logs"],
  ["stderrLines", "错误行列表", "state.errorLogs"],
  ["json", "JSON 结果", "state.result"],
  ["code", "退出码", "state.exitCode"]
];

function CallForm({ action, onChange, callbackUsed }) {
  const mode = callMode(action);
  const config = configObject(action, "call");
  const setConfig = (next) => onChange(actionWithConfig(action, "call", next));
  const setField = (field, value) => {
    const next = clone(config);
    if (value === undefined) delete next[field];
    else next[field] = value;
    setConfig(next);
  };
  const switchMode = (next) => {
    if (next === "service" && callbackUsed) return;
    onChange(changeCallMode(action, next));
  };
  const waiting = Object.hasOwn(config, "wait") ? config.wait !== false : config.blocking !== false;

  return <div className="wf-action-form">
    <Segmented
      label="执行类型"
      value={mode}
      options={[
        { value: "shell", label: "Shell" },
        { value: "command", label: "程序" },
        { value: "service", label: "Service", disabled: callbackUsed, title: callbackUsed ? "存在 shell 回调连线" : undefined }
      ]}
      onChange={switchMode}
    />
    {mode === "service" ? <>
      <PathField label="Service 名称" value={config.service || config.name || ""} onChange={(value) => setField("service", value)} placeholder="tasks.run" />
      <ObjectMapEditor label="调用参数" value={config.with} onChange={(value) => setField("with", value)} />
    </> : <>
      {mode === "shell" ? <>
        <ValueEditor label="Shell 命令" value={config.sh ?? ""} onChange={(value) => setField("sh", value)} />
        <ValueEditor label="解释器" value={config.interpreter ?? ""} onChange={(value) => setField("interpreter", value || undefined)} compact />
      </> : <>
        <ValueEditor label="程序路径" value={config.command ?? ""} onChange={(value) => setField("command", value)} />
        <ArgsEditor value={config.args} onChange={(value) => setField("args", value)} />
      </>}
      <div className="wf-toggle-grid">
        <label><input type="checkbox" checked={waiting} onChange={(event) => {
          const next = clone(config);
          delete next.blocking;
          next.wait = event.target.checked;
          setConfig(next);
        }} />等待命令完成</label>
        <label><input type="checkbox" checked={config.check === true} onChange={(event) => setField("check", event.target.checked || undefined)} />失败时抛错</label>
      </div>
      <ValueEditor label="工作目录" value={config.cwd ?? ""} onChange={(value) => setField("cwd", value || undefined)} compact />
      <label className="wf-form-field inline">
        <span className="wf-field-label">标准流</span>
        <select aria-label="标准流" value={config.stdio || "auto"} onChange={(event) => setField("stdio", event.target.value === "auto" ? undefined : event.target.value)}>
          <option value="auto">自动</option>
          <option value="pipe">捕获</option>
          <option value="inherit">继承终端</option>
          <option value="ignore">忽略</option>
        </select>
      </label>
      <label className="wf-form-field inline">
        <span className="wf-field-label">缓冲区上限</span>
        <input aria-label="缓冲区上限" type="number" min="1" value={config.maxBuffer || ""} onChange={(event) => setField("maxBuffer", event.target.value ? Number(event.target.value) : undefined)} />
      </label>
      <ObjectMapEditor label="环境变量" value={config.env} onChange={(value) => setField("env", value)} />
      <section className="wf-output-editor">
        <div className="wf-section-heading"><strong>返回值提取</strong></div>
        {OUTPUT_FIELDS.map(([field, label, fallback]) => {
          const enabled = typeof config[field] === "string";
          return <div className="wf-output-row" key={field}>
            <label><input type="checkbox" aria-label={label} checked={enabled} onChange={(event) => setField(field, event.target.checked ? fallback : undefined)} />{label}</label>
            <input
              aria-label={`${label}变量`}
              list="wf-variable-paths"
              value={enabled ? config[field] : ""}
              disabled={!enabled}
              placeholder={fallback}
              onChange={(event) => setField(field, event.target.value)}
            />
          </div>;
        })}
      </section>
    </>}
  </div>;
}

function SetForm({ action, onChange }) {
  const config = configObject(action, "set");
  return <div className="wf-action-form">
    <PathField label="变量路径" value={config.path || ""} onChange={(value) => onChange(withField(action, "set", "path", value))} />
    <ValueEditor label="变量值" value={config.value} onChange={(value) => onChange(withField(action, "set", "value", value))} />
  </div>;
}

function AppendForm({ action, onChange }) {
  const config = configObject(action, "append");
  const mode = Object.hasOwn(config, "list") ? "list" : "text";
  const switchMode = (next) => {
    const updated = clone(config);
    if (next === "list") {
      delete updated.path;
      updated.list = "state.items";
    } else {
      delete updated.list;
      updated.path = "state.text";
    }
    onChange(actionWithConfig(action, "append", updated));
  };
  return <div className="wf-action-form">
    <Segmented label="追加类型" value={mode} options={[
      { value: "list", label: "列表项" },
      { value: "text", label: "文本" }
    ]} onChange={switchMode} />
    <PathField label={mode === "list" ? "列表变量" : "文本变量"} value={config[mode === "list" ? "list" : "path"] || ""} onChange={(value) => onChange(withField(action, "append", mode === "list" ? "list" : "path", value))} />
    <ValueEditor label="追加值" value={config.value} onChange={(value) => onChange(withField(action, "append", "value", value))} />
  </div>;
}

function MoveForm({ action, onChange }) {
  const config = configObject(action, "move");
  return <div className="wf-action-form">
    <PathField label="选择变量" value={config.path || ""} onChange={(value) => onChange(withField(action, "move", "path", value))} placeholder="state.selected" />
    <ValueEditor label="移动步长" value={config.by ?? 1} onChange={(value) => onChange(withField(action, "move", "by", value))} compact />
    <PathField label="限制列表" value={config.list || config.within || ""} onChange={(value) => {
      const next = clone(config);
      delete next.within;
      next.list = value;
      onChange(actionWithConfig(action, "move", next));
    }} placeholder="data.items" />
  </div>;
}

function ToggleForm({ action, onChange }) {
  const raw = actionConfig(action, "toggle");
  const config = isObject(raw) ? raw : { path: typeof raw === "string" ? raw : "" };
  const mode = config.list || config.within ? "item" : "path";
  const switchMode = (nextMode) => {
    if (nextMode === "item") {
      onChange(actionWithConfig(action, "toggle", {
        list: "data.items",
        index: "state.selected",
        field: "done"
      }));
    } else {
      onChange(actionWithConfig(action, "toggle", { path: "state.enabled" }));
    }
  };
  return <div className="wf-action-form">
    <Segmented label="切换目标" value={mode} options={[
      { value: "path", label: "变量" },
      { value: "item", label: "列表字段" }
    ]} onChange={switchMode} />
    {mode === "path" ? <PathField label="布尔变量" value={config.path || ""} onChange={(value) => onChange(actionWithConfig(action, "toggle", { ...config, path: value }))} /> : <>
      <PathField label="列表变量" value={config.list || config.within || ""} onChange={(value) => onChange(actionWithConfig(action, "toggle", { ...config, list: value }))} placeholder="data.items" />
      <ValueEditor label="项目索引" value={config.index ?? "state.selected"} onChange={(value) => onChange(withField(action, "toggle", "index", value))} compact />
      <label className="wf-form-field">
        <span className="wf-field-label">布尔字段</span>
        <input aria-label="布尔字段" value={config.field || ""} placeholder="done" onChange={(event) => onChange(withField(action, "toggle", "field", event.target.value))} />
      </label>
    </>}
  </div>;
}

function RemoveForm({ action, onChange }) {
  const config = configObject(action, "remove");
  return <div className="wf-action-form">
    <PathField label="列表变量" value={config.list || config.within || ""} onChange={(value) => {
      const next = clone(config);
      delete next.within;
      next.list = value;
      onChange(actionWithConfig(action, "remove", next));
    }} placeholder="data.items" />
    <ValueEditor label="项目索引" value={config.index ?? "state.selected"} onChange={(value) => onChange(withField(action, "remove", "index", value))} compact />
  </div>;
}

function BackspaceForm({ action, onChange }) {
  const raw = actionConfig(action, "backspace");
  const config = isObject(raw) ? raw : { path: typeof raw === "string" ? raw : "" };
  return <PathField label="文本变量" value={config.path || ""} onChange={(value) => onChange(actionWithConfig(action, "backspace", { ...config, path: value }))} placeholder="state.text" />;
}

function IfForm({ action, onChange }) {
  const config = configObject(action, "if");
  return <div className="wf-action-form"><ConditionEditor value={config.condition} onChange={(value) => onChange(withField(action, "if", "condition", value))} /></div>;
}

function NotifyForm({ action, onChange }) {
  return <ValueEditor label="通知内容" value={actionConfig(action, "notify")} onChange={(value) => onChange(actionWithConfig(action, "notify", value))} />;
}

function NavigationForm({ action, type, onChange, pageRoutes }) {
  const raw = actionConfig(action, type);
  const config = isObject(raw) ? raw : { page: raw || "", params: {} };
  return <div className="wf-action-form">
    <ValueEditor label="目标页面" value={config.page ?? config.route ?? ""} suggestions={pageRoutes} onChange={(value) => {
      const next = clone(config);
      delete next.route;
      next.page = value;
      onChange(actionWithConfig(action, type, next));
    }} />
    <ObjectMapEditor label="页面参数" value={config.params} onChange={(value) => onChange(actionWithConfig(action, type, { ...config, params: value }))} />
  </div>;
}

function PopForm({ action, onChange }) {
  const config = configObject(action, "pop");
  return <ValueEditor label="返回值" value={config.result ?? ""} onChange={(value) => onChange(withField(action, "pop", "result", value === "" ? undefined : value))} />;
}

function QuitForm({ action, onChange }) {
  const raw = actionConfig(action, "quit");
  const config = isObject(raw) ? raw : { code: Number(raw || 0) };
  return <label className="wf-form-field inline">
    <span className="wf-field-label">退出码</span>
    <input aria-label="退出码" type="number" value={config.code ?? 0} onChange={(event) => onChange(actionWithConfig(action, "quit", { ...config, code: Number(event.target.value) }))} />
  </label>;
}

function ActionFields({ type, action, onChange, callbackUsed, pageRoutes }) {
  if (type === "call") return <CallForm action={action} onChange={onChange} callbackUsed={callbackUsed} />;
  if (type === "set") return <SetForm action={action} onChange={onChange} />;
  if (type === "append") return <AppendForm action={action} onChange={onChange} />;
  if (type === "move") return <MoveForm action={action} onChange={onChange} />;
  if (type === "toggle") return <ToggleForm action={action} onChange={onChange} />;
  if (type === "remove") return <RemoveForm action={action} onChange={onChange} />;
  if (type === "backspace") return <BackspaceForm action={action} onChange={onChange} />;
  if (type === "if") return <IfForm action={action} onChange={onChange} />;
  if (type === "notify") return <NotifyForm action={action} onChange={onChange} />;
  if (["push", "replace", "reset"].includes(type)) return <NavigationForm action={action} type={type} onChange={onChange} pageRoutes={pageRoutes} />;
  if (type === "pop") return <PopForm action={action} onChange={onChange} />;
  if (type === "quit") return <QuitForm action={action} onChange={onChange} />;
  if (type === "refresh") return <div className="wf-empty-fields">无参数</div>;
  return null;
}

export function StructuredActionEditor({ node, callbackUsed, pageRoutes = [], onSave }) {
  const type = node.data.actionType;
  const source = node.data.action;
  const [draft, setDraft] = useState(() => clone(source));
  const [jsonText, setJsonText] = useState(() => pretty(source));
  const [jsonDirty, setJsonDirty] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(clone(source));
    setJsonText(pretty(source));
    setJsonDirty(false);
    setError("");
  }, [node.id, source]);

  const updateDraft = (next) => {
    setDraft(next);
    setJsonText(pretty(next));
    setJsonDirty(false);
    setError("");
  };

  const save = () => {
    try {
      const action = jsonDirty ? JSON.parse(jsonText) : draft;
      const config = actionConfig(action, type);
      if (config === undefined && action?.do !== type) throw new Error(`动作必须包含 ${type} 配置。`);
      if (type === "if" && isObject(config) && (Object.hasOwn(config, "then") || Object.hasOwn(config, "else"))) {
        throw new Error("if 分支请使用满足/不满足连线。");
      }
      if (type === "call" && isObject(config) && (Object.hasOwn(config, "onLine") || Object.hasOwn(config, "onExit"))) {
        throw new Error("call 回调请使用逐行/退出连线。");
      }
      onSave(action);
      setDraft(clone(action));
      setJsonText(pretty(action));
      setJsonDirty(false);
      setError("");
    } catch (saveError) {
      setError(saveError.message || String(saveError));
    }
  };

  return <>
    <ActionFields
      type={type}
      action={draft}
      onChange={updateDraft}
      callbackUsed={callbackUsed}
      pageRoutes={pageRoutes}
    />
    <details className="wf-advanced-json">
      <summary>高级 JSON</summary>
      <textarea value={jsonText} onChange={(event) => {
        setJsonText(event.target.value);
        setJsonDirty(true);
        setError("");
      }} spellCheck="false" />
    </details>
    {error ? <div className="wf-form-error" role="alert">{error}</div> : null}
    <button type="button" className="primary" onClick={save}><Save size={15} />保存参数</button>
  </>;
}
