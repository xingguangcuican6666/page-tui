# 13：VS Code 扩展——让写 Page 更简单

如果你不熟悉 JavaScript，最适合的工作方式是：

~~~text
VS Code 扩展负责提示和检查
YAML 文件负责页面布局和交互
Node.js 只负责启动应用和复杂业务
~~~

扩展目录在：

~~~text
vscode-extension/
~~~

扩展详细说明见：[vscode-extension/README.md](../vscode-extension/README.md)。

## 1. 扩展解决什么问题

没有扩展时，你需要记住：

- 组件名称。
- action 名称。
- data、state、params 的写法。
- 页面 route 是否拼错。
- list 是否有 items。
- push 的目标页面是否注册。

有扩展后：

- 输入 type: 可以补全组件。
- 在 pages 下的页面空行可以补全 title、state、layout、keys 和 on。
- 在 layout、组件和 action 下可以补全对应字段。
- 输入 - 可以补全 action。
- 输入 bind: 可以补全变量路径。
- 输入 page: 可以补全页面名称。
- 打开实时预览可以看到布局和变量结果。
- 鼠标悬停会显示中文解释。
- 错误会显示在 Problems 面板。
- 可以直接生成完整初学者页面。

扩展会识别 `app.yaml`、`app.yml`、`ui/pages/**/*.yaml`、`ui/pages/**/*.yml` 和 `*.page.yaml`。这些文件即使右下角显示普通的 `YAML`，也会启用 Page TUI 的补全和悬停；其他普通 YAML 文件不会被 Page TUI 诊断。如果编辑的是不在这些路径中的独立页面，可以运行“Page TUI: 将当前文件设为 Page TUI YAML”。

按 Ctrl+Space 打开的普通补全菜单中，带有 `Page TUI ·` 的项目来自本扩展。编辑器里灰色、斜体、尚未写入文件的文字属于 VS Code 的内联建议，通常来自 Copilot 或其他 AI 扩展，不是 Page TUI 补全。

## 2. 安装方式

当前扩展随仓库源码提供。开发时：

~~~bash
cd vscode-extension
npm install
~~~

用 VS Code 打开 vscode-extension 目录，按 F5 启动 Extension Development Host。

如果要安装到自己的 VS Code：

~~~bash
npx @vscode/vsce package
~~~

然后在 VS Code 中执行 Extensions: Install from VSIX...。

## 3. 第一个页面

打开命令面板，运行：

~~~text
Page TUI: 创建初学者页面
~~~

保存为：

~~~text
ui/app.yaml
~~~

打开后可以直接修改：

~~~yaml
layout:
  type: column
  children:
    - type: text
      value: "我的第一个页面"
      style: title
~~~

children 的顺序就是屏幕从上到下的顺序。

## 4. 写布局时的提示

输入：

~~~yaml
type:
~~~

会看到：

~~~text
text
input
column
row
panel
list
divider
spacer
~~~

推荐初学者先记住这三个：

- column：竖着排。
- panel：加边框。
- list：显示可选择列表。

一个常见布局：

~~~yaml
layout:
  type: column
  children:
    - type: text
      value: "任务管理"
      style: title
    - type: panel
      flex: true
      child:
        type: list
        items: data.tasks
        selected: state.selected
        label: "{{ item.title }}"
~~~

## 5. 写变量时的提示

Page TUI 变量始终从明确的根开始：

~~~text
data
state
params
item
key
index
~~~

例如：

~~~yaml
template: "当前任务：{{ params.task.title }}"
~~~

在双大括号后面按 Ctrl+Space，扩展会提示变量根和当前文件中的字段。

记忆方法：

~~~text
data   多个页面共享
state  当前页面使用
params 上一个页面传入
item   list 当前项目
key    当前按键
~~~

## 6. 写交互时的提示

在 keys 下输入 -：

~~~yaml
keys:
  enter:
    -
~~~

可以选择：

- set：设置变量。
- move：移动选择。
- toggle：切换布尔值。
- push：打开页面。
- pop：返回页面。
- call：调用 Node.js service。
- if：执行条件分支。

例如选择 push 后，补全会生成：

~~~yaml
- push:
    page: detail
    params:
      item:
        bind: state.item
~~~

## 7. 校验错误怎么看

扩展会把结构错误显示为红色波浪线，并在 Problems 面板显示中文消息。

例如：

~~~yaml
- push:
    page: settings
~~~

如果 settings 没有在 pages 中注册，会提示：

~~~text
页面 “settings” 没有在 pages 中注册。
~~~

如果写了不存在的组件：

~~~yaml
type: card
~~~

会提示可用组件列表。

## 8. 页面运行

保存 YAML 后，在命令面板运行：

~~~text
Page TUI: 运行当前项目
~~~

默认执行 npm start，它对应仓库中的：

~~~text
examples/easy-tasks.js
~~~

自己的项目如果使用：

~~~bash
node start.js
~~~

可以在设置中写：

~~~json
{
  "pageTui.runCommand": "node start.js"
}
~~~

## 9. 实时预览

打开命令面板，运行：

~~~text
Page TUI: 打开实时预览
~~~

扩展会在当前编辑器旁边打开一个 Webview 预览面板。它不是截图，而是根据当前 YAML 重新计算并绘制页面，所以修改文件后会自动刷新：

- 页面布局改变后，预览约 120 毫秒内更新。
- `pages` 中的页面可以用顶部下拉框切换。
- `data`、页面 `state`、`params`、`item` 和模板函数会计算出示例结果。
- text、input、column、row、panel、list、divider 和 spacer 都有对应的预览样式。
- YAML 正在输入、暂时无法解析时，面板显示错误；修正后自动恢复。

例如打开 `examples/easy-tasks/app.yaml` 后，运行命令即可看到 `home`、`detail` 和 `create` 三个页面。选择 `detail` 时，由于没有真实运行时传入 `params.task`，依赖它的文本可能为空，这是正常的静态预览结果。

预览只执行安全的 YAML 解析、变量读取和模板计算，不会执行 keys 动作、Node.js service、网络请求或数据库操作。要验证真实交互，请继续使用“Page TUI: 运行当前项目”。

## 10. 推荐工作习惯

建议按下面顺序写页面：

1. 先用“创建初学者页面”生成模板。
2. 只修改 data 中的示例数据。
3. 先调整 layout，确认屏幕结构。
4. 再修改 state 和变量模板。
5. 最后增加 keys 动作。
6. 需要数据库或网络时再写 service。
7. 每次修改后运行 Page TUI 校验。
8. 用“运行当前项目”进行手动验证。

不要一开始就同时修改布局、变量、动作和 service。分层修改更容易定位问题。

## 11. 扩展与 Page TUI 的边界

扩展提供编辑体验：

~~~text
补全
悬停说明
结构诊断
页面模板
运行命令
~~~

Page TUI runtime 负责运行体验：

~~~text
终端输入
页面栈
动作执行
组件绘制
数据更新
~~~

扩展不会改变 Page TUI 的 YAML 语法，也不会让 YAML 直接执行任意 JavaScript。

复杂业务仍然应该写在 Node.js service 中：

~~~yaml
- call: tasks.save
  with:
    title:
      bind: state.title
~~~

## 12. 当前限制

当前版本是轻量扩展，暂时不会：

- 自动推断数据库返回类型。
- 检查自定义 service 名称是否真的注册。
- 执行真实 runtime 的按键和 service 模拟。
- 自动生成 Node.js service。
- 替代完整 YAML 语言服务器。

这些功能可以在后续版本继续增加，但现在的目标是先让初学者能顺畅写出正确的 Page TUI 页面。
