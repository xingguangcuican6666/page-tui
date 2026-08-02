# 10：内部架构

本章解释 Page TUI 的内部数据流，帮助你在遇到问题或扩展框架时建立全局理解。

## 1. 总体结构

~~~text
用户 YAML
   │
   ▼
Declarative App Loader
   │ 读取 YAML / JSON
   ▼
Declarative Page
   │ 编译 layout、解释 keys
   ▼
PageManager
   │ 管理页面栈和生命周期
   ▼
App
   │ 处理输入、刷新和错误
   ├───────────────┐
   ▼               ▼
Terminal        Renderer
   │               │
   └────── 终端 ───┘
~~~

## 2. 文件职责

### src/declarative/app.js

负责：

- 读取 manifest 文件。
- 判断 JSON 或 YAML。
- 解析相对路径。
- 加载内联页面。
- 加载独立页面文件。
- 合并 manifest.data 和 options.data。
- 创建 route factory。
- 创建声明式 App 对应的底层 App。

### src/declarative/page.js

负责：

- 将 layout 节点编译为 ui 节点。
- 将 keys 中的配置转换为动作。
- 根据当前 key 找到动作。
- 执行 set、move、toggle、push 等动作。
- 处理声明式页面的 on.enter 和 on.resume。

### src/declarative/value.js

负责：

- 复制初始 state。
- 解析变量路径。
- 读写 data、state、params。
- 解析 bind、template、itemAt、trim。
- 执行模板函数。
- 执行条件判断。
- 处理 Unicode backspace。

### src/core/page-manager.js

负责：

- 保存页面栈。
- resolve route。
- push、pop、replace、reset。
- 调用页面生命周期。
- 通知 App 重新渲染。

### src/core/app.js

负责：

- 创建 Terminal 和 Renderer。
- 串行处理按键。
- 触发页面 onKey。
- 处理默认 q、Esc、Ctrl+C。
- 调度 invalidate。
- 处理页面 render 错误。
- 退出时清理终端。

## 3. 启动数据流

启动器：

~~~js
createDeclarativeApp({
  manifest: "./ui/app.yaml",
  data: {
    tasks: []
  }
});
~~~

执行过程：

~~~text
1. 读取 app.yaml
2. 解析 manifest
3. 读取 manifest.data
4. 合并 options.data
5. 找到 manifest.pages
6. 为每个页面注册一个 route factory
7. 创建底层 App
8. 使用 initial 选择第一个页面
9. App.start()
10. PageManager.reset(initialPage)
11. DeclarativePage.onEnter()
12. 第一次 render()
~~~

## 4. 一次按键的数据流

用户按下 ↓：

~~~text
Terminal data
  ↓
KeyParser
  ↓
{ name: "down", ctrl: false, ... }
  ↓
App.handleKey()
  ↓
App._dispatchKey()
  ↓
currentPage.onKey(key)
  ↓
DeclarativePage.keyAction()
  ↓
executeActions()
  ↓
executeMove()
  ↓
writePath("state.selected", ...)
  ↓
App.invalidate()
  ↓
queueMicrotask()
  ↓
App.render()
  ↓
DeclarativePage.render()
  ↓
compileLayout()
  ↓
Renderer.render()
  ↓
Terminal output
~~~

## 5. 为什么 state 修改后会刷新

App 通过 handleKey 串行处理按键。页面动作完成后，App 调用 invalidate。

invalidate 不会每次立即重复绘制，而是使用 microtask 合并同一轮中的刷新：

~~~text
多个动作
  ↓
一次 invalidate
  ↓
一次 render
~~~

这避免一个按键中的多个 set 导致屏幕中间状态被反复绘制。

页面栈变化也会触发 invalidate。

## 6. 页面栈的生命周期

PageManager.push 的核心顺序：

~~~text
previous.onBlur()
next._attach(app)
next.onEnter(params)
stack.push(next)
next.onFocus()
app.invalidate()
~~~

PageManager.pop 的核心顺序：

~~~text
leaving.onBlur()
leaving.onLeave(result)
stack.pop()
resumed.onResume(result)
resumed.onFocus()
app.invalidate()
~~~

页面开发者不需要手动调用这些生命周期。

## 7. 变量上下文

DeclarativePage.context() 大致产生：

~~~js
{
  app,
  page,
  runtime,
  data,
  state,
  params,
  key
}
~~~

不同位置会增加临时值。

list item：

~~~js
{
  ...context,
  item,
  index
}
~~~

因此 list 的 label 能读取 item.title，而普通页面不能。

## 8. compileLayout 的过程

YAML：

~~~yaml
type: panel
title: "任务"
child:
  type: list
  items: data.tasks
  selected: state.selected
~~~

编译成概念上的 UI 节点：

~~~js
ui.panel(
  ui.list(
    [
      { label: "...", value: task }
    ],
    { selected: 0 }
  ),
  { title: "任务" }
)
~~~

Renderer 不知道 YAML 的存在。Renderer 只接收 ui 节点。

## 9. 为什么 YAML 不直接控制 Renderer

这样分层有三个好处：

1. 页面语法和终端绘制解耦。
2. 可以测试 compileLayout，而不启动真实终端。
3. 以后可以替换 Renderer，而不改变 YAML 页面。

当前 renderer 使用字符串数组和 ANSI 样式，未来也可以改成 cell buffer，而不改变页面作者使用的 data、state、layout、keys。

## 10. Terminal 与 Renderer 的边界

Terminal 负责：

- raw mode。
- stdin data。
- key parser。
- terminal size。
- alternate screen。
- cursor 隐藏和恢复。

Renderer 负责：

- 将 view 渲染到固定宽高。
- 套用主题。
- 处理中文和宽字符。
- 清除旧行。
- 输出 ANSI。

业务页面不应该直接写 process.stdout。

## 11. 错误处理路径

页面 render 抛错：

~~~text
DeclarativePage.render()
  ↓
App.render()
  ↓
App.handleError()
  ↓
options.onError，或 App error event，或错误面板
~~~

service 抛错也会沿着 App 的 key queue 进入 handleError。

启动器可以提供 onError：

~~~js
createDeclarativeApp({
  manifest: "./ui/app.yaml",
  onError: (error) => {
    console.error(error);
  }
});
~~~

生产应用建议记录错误，但不要在终端中显示敏感信息。

## 12. 路径写入为什么限制根变量

writePath 只允许写：

- data
- state
- params

不允许 YAML 写 app、key 或 terminal，是为了避免页面配置修改框架内部对象。

例如：

~~~yaml
- set:
    path: state.notice
    value: "可以"
~~~

不应该写：

~~~yaml
- set:
    path: app.terminal
    value: null
~~~

## 13. 深度模块设计

Page TUI 的声明式层试图把复杂性藏在几个模块中：

~~~text
页面作者只看：
data / state / params / layout / keys

框架内部处理：
解析 / 生命周期 / 输入 / 渲染 / 错误 / 页面栈
~~~

这就是为什么 YAML 文件可以保持短小，而不要求每个页面重复写终端细节。

## 14. 扩展一个新 action

假设需要 add action。

步骤：

1. 在 ACTION_NAMES 中增加 add。
2. 在 executeAction switch 中增加 case add。
3. 定义参数结构。
4. 使用 resolveValue 读取动态参数。
5. 使用 writePath 修改允许的变量。
6. 增加自动化测试。
7. 在 docs/05-actions.md 补充文档。
8. 在 examples 中增加一个真实用法。

不要只增加代码而不补文档，否则 YAML 作者无法发现新能力。

## 15. 扩展一个新组件

假设需要 table。

建议先在声明式层实现：

~~~text
YAML table
  ↓
compileTable
  ↓
现有 column、row、text、panel
~~~

只有当 table 需要高性能、滚动或精确单元格布局时，才应该修改底层 ui renderer。

## 16. 架构测试重点

扩展框架时至少测试：

- YAML 能否加载。
- path 读写是否正确。
- template 变量是否正确。
- visible false 是否隐藏节点。
- action 是否按顺序执行。
- action 抛错是否进入 App error。
- push/pop 是否保持页面栈。
- data 和 state 是否隔离。
- renderer 是否输出固定宽高。
- 中文宽度是否不会破坏边框。

## 17. 当前架构的未来方向

可能的扩展：

- schema 验证和更好的 YAML 错误行号。
- 完整 input focus 系统。
- table、tabs、modal。
- loading 和 error 的标准状态。
- 页面级 store。
- 更丰富的 key modifier。
- 可插拔 action registry。
- 可插拔 component registry。
- Snapshot 渲染测试。
