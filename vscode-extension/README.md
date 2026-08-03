# Page TUI VS Code 扩展

这是 Page TUI 的 VS Code 扩展，专门帮助初学者编写 YAML 页面。

它不要求你先学会 JavaScript，主要提供：

- Page TUI YAML 文件识别。
- 布局组件补全。
- 内置 action 补全。
- data、state、params、item 等变量路径补全。
- 页面 route 补全。
- 鼠标悬停中文说明。
- YAML、组件、action 和页面跳转校验。
- 一键生成初学者页面。
- 一键插入完整页面模板。
- Webview 实时预览页面布局和变量结果。
- 一键运行当前项目。
- 状态栏显示当前页面是否有错误。

## 1. 在本仓库中运行扩展

这是一个源码形式的扩展。开发和测试步骤：

~~~bash
cd vscode-extension
npm install
~~~

然后用 VS Code 打开 vscode-extension 目录，按 F5。

VS Code 会打开一个新的 Extension Development Host 窗口。新窗口中打开任意 Page TUI YAML 文件，就能看到补全和校验。

也可以从仓库根目录运行：

~~~bash
code --extensionDevelopmentPath="$PWD/vscode-extension" "$PWD"
~~~

## 2. 打包安装

安装打包工具并生成 VSIX：

~~~bash
cd vscode-extension
npm install
npx @vscode/vsce package
~~~

生成文件类似：

~~~text
page-tui-vscode-0.1.0.vsix
~~~

在 VS Code 中执行：

~~~text
Extensions: Install from VSIX...
~~~

选择生成的 .vsix 文件即可。

## 3. 文件识别

扩展会自动识别：

- *.page.yaml
- *.page.yml
- page-tui.yaml
- page-tui.yml
- app.yaml
- app.yml
- ui/pages/**/*.yaml
- ui/pages/**/*.yml

这些文件即使右下角显示普通的 `YAML`，也会触发 Page TUI 的补全和悬停说明。扩展只会在这些约定路径中增加 Page TUI 能力，不会给项目里的其他 YAML 文件添加 Page TUI 诊断。

如果某个文件没有自动识别，或者你正在编辑一个不在约定路径中的独立页面，打开命令面板，运行：

~~~text
Page TUI: 将当前文件设为 Page TUI YAML
~~~

也可以点击编辑器右下角的语言模式，选择 Page TUI YAML。

## 4. 最常用的工作流

### 第一步：创建页面

打开命令面板：

~~~text
Page TUI: 创建初学者页面
~~~

扩展会让你选择保存位置，默认建议保存为 ui/app.yaml。

生成的页面已经包含：

- data.items 示例数据。
- home 首页。
- detail 详情页。
- state.selected 列表选择。
- column、panel、list、text。
- up、down、enter、escape。

### 第二步：用补全写布局

在布局中输入：

~~~yaml
type:
~~~

按 Ctrl+Space，可以看到：

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

在页面字段的空行中输入空格并按 Ctrl+Space，也可以看到：

~~~text
title
state
layout
keys
on
~~~

例如：

~~~yaml
pages:
  home:
    # 在这一行按 Ctrl+Space
~~~

在 `keys` 的直接子级输入 `e`、`u` 等按键名时，补全会自动过滤出 `enter`、`escape`、`up`、`down` 等键。`keys` 下面的 `-` action 模板会按照当前 YAML 行的缩进生成，不需要手动整理多行 `set`、`push` 或 `if`。

补全菜单中带有 `Page TUI ·` 的项目来自本扩展。编辑器里灰色、斜体、还没有真正写入文件的文字是 VS Code 的内联建议，通常来自 Copilot 或其他 AI 扩展；它不是 Page TUI 补全。需要确定地打开本扩展菜单时，请按 Ctrl+Space。

在 keys 的 action 列表中输入 - ，可以看到：

~~~text
set
move
toggle
remove
append
push
pop
call
if
refresh
~~~

选中补全项后，扩展会插入带有 tab stop 的多行模板。

### 第三步：使用变量补全

在下面的位置输入变量：

~~~yaml
bind:
items:
template: "当前：{{ "
path:
~~~

扩展会提示：

~~~text
data
data.items
state
state.selected
params
item
key
index
~~~

它还会读取当前文件中的 data 和页面 state 字段，补全更具体的路径。

### 第四步：查看说明

把鼠标放到这些词上：

~~~text
column
list
state
params
push
toggle
~~~

悬停提示会解释它们的作用和常见用法。

### 第五步：运行

打开命令面板执行：

~~~text
Page TUI: 运行当前项目
~~~

默认会在 VS Code 终端执行：

~~~bash
npm start
~~~

如果项目使用其他启动命令，在设置中修改 pageTui.runCommand。

### 第六步：打开实时预览

打开命令面板，运行：

~~~text
Page TUI: 打开实时预览
~~~

扩展会在编辑器旁边打开一个终端风格的预览面板。它会：

- 读取当前打开的 `app.yaml` 或独立 Page TUI YAML 文件。
- 编辑文件后自动刷新，不需要手动保存。
- 用页面下拉框切换 `pages` 中的页面。
- 点击 list 项目、输入文字，或使用方向键、Enter、Escape 和普通字符测试页面交互。
- 在“实时变量”区域查看当前 `data`、`state` 和 `params`，点击“重置预览”恢复 YAML 初始状态。
- 展示 text、input、column、row、panel、list、divider 和 spacer。
- 计算 `data`、页面 `state`、`params`、`item` 和常用模板函数。
- YAML 暂时写错时显示错误，修正后自动恢复。

预览会在内存中执行安全的内置 keys 动作，例如 set、move、toggle、append、push、pop 和 if；不会执行 call、refresh、Node.js service、网络请求或数据库操作。需要验证真实运行环境时，使用“Page TUI: 运行当前项目”。

## 5. 校验功能

扩展会在编辑时检查：

- YAML 是否可以解析。
- pages 是否是对象。
- initial 页面是否存在。
- 布局组件名称是否正确。
- column、row 是否缺少 children。
- list 是否缺少 items 或 bind。
- action 名称是否正确。
- push、go、replace、reset 目标页面是否已注册。
- keys、state、on 的结构是否合理。

也可以手动执行：

~~~text
Page TUI: 校验当前页面
~~~

错误会显示在 Problems 面板中，状态栏会显示错误或提醒数量。

## 6. 命令列表

| 命令 | 作用 |
| --- | --- |
| Page TUI: 创建初学者页面 | 生成一个可运行的完整页面 |
| Page TUI: 插入页面模板 | 在当前编辑器位置插入完整模板 |
| Page TUI: 校验当前页面 | 手动运行页面校验 |
| Page TUI: 将当前文件设为 Page TUI YAML | 手动启用语言支持 |
| Page TUI: 打开实时预览 | 在编辑器旁边实时查看页面布局 |
| Page TUI: 运行当前项目 | 在终端执行启动命令 |
| Page TUI: 打开中文文档 | 打开仓库的中文文档目录 |

## 7. 设置项

~~~json
{
  "pageTui.autoValidate": true,
  "pageTui.runCommand": "npm start",
  "pageTui.docsUrl": "https://github.com/xingguangcuican6666/page-tui/tree/main/docs"
}
~~~

### pageTui.autoValidate

默认是 true。关闭后，编辑时不自动显示诊断，但仍可以手动运行校验命令。

### pageTui.runCommand

默认是 npm start。例如使用自定义启动文件：

~~~json
{
  "pageTui.runCommand": "node start.js"
}
~~~

### pageTui.docsUrl

默认打开 GitHub 中文文档。如果你维护了自己的内部文档，可以改成自己的地址。

## 8. 与 YAML 扩展配合

建议同时安装 VS Code 的 YAML 扩展，以获得更完整的 YAML 缩进、格式和基础语法能力。

Page TUI 扩展负责 Page TUI 专属能力：

~~~text
页面组件
页面 action
变量路径
页面 route
Page TUI 中文说明
~~~

普通 YAML 能力由 YAML 扩展负责。

如果两个扩展对语言模式显示不一致，使用命令：

~~~text
Page TUI: 将当前文件设为 Page TUI YAML
~~~

## 9. 扩展目录

~~~text
vscode-extension/
├── extension.js                  # VS Code 激活入口、补全、悬停和命令
├── preview.js                    # Webview 预览渲染和变量模板计算
├── validation.js                 # 不依赖 VS Code 的页面校验逻辑
├── starter.js                    # 一键生成的页面模板
├── package.json                  # 扩展清单和命令注册
├── language-configuration.json   # 注释、括号和缩进
├── syntaxes/                     # Page TUI 关键字高亮
├── snippets/                     # 页面和 action 模板
├── schemas/                      # Page TUI schema
└── test/                         # 扩展逻辑测试
~~~

## 10. 当前边界

这个扩展不会执行 YAML 中的任意 JavaScript，也不会替代 Page TUI runtime。实时预览只在内存中模拟有限的页面状态和内置动作，不会执行外部 service。

当前不会自动知道：

- 自定义 service 是否真的存在。
- 数据库返回的数据类型。
- 业务逻辑是否正确。
- 网络请求是否成功。
- 自定义 action 是否会修改正确的数据。

这些内容仍然需要在 Node.js service 和自动化测试中验证。

扩展校验是帮助你尽早发现明显错误，不是 TypeScript 类型系统，也不是完整语言服务器。

## 11. 测试

在仓库根目录运行：

~~~bash
npm --prefix vscode-extension test
~~~

当前测试覆盖：

- 生成模板可以被 Page TUI YAML 解析。
- 仓库中的真实示例没有结构错误。
- 未知组件和未注册页面可以被发现。
- 独立页面文件可以被校验。
- 页面字段补全会在普通 YAML 模式中触发。
- 实时预览可以渲染页面、变量、列表和页面切换。
- YAML 错误会显示为预览面板错误，而不是导致扩展崩溃。
- YAML 语法错误可以被发现。
