# Page TUI VS Code 扩展

这是 Page TUI 的 VS Code 扩展，专门帮助初学者编写 YAML 页面。

它不要求你先学会 JavaScript，主要提供：

- Page TUI YAML 文件识别。
- 布局组件补全。
- 内置 action 补全。
- data、state、params、item 等变量路径补全。
- 外部语言模块配置和翻译文本补全。
- 页面 route 补全。
- 鼠标悬停中文说明。
- YAML、组件、action 和页面跳转校验。
- 一键生成初学者页面。
- 一键插入完整页面模板。
- 可视化编辑页面、布局树、变量和 action，并自动写回 YAML。
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
page-tui-vscode-0.2.0.vsix
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

根节点会根据文件类型区分：

- `app.yaml` 是应用 manifest，根键是 `initial`、`data`、`i18n`、`pages`。
- `ui/pages/home.yaml`、`*.page.yaml` 是独立页面，根键是 `name`、`title`、`state`、`layout`、`keys`、`on`。

所以在 `app.yaml` 根部输入 `ke` 不会出现 `keys`；应在 `pages.home.keys` 下写按键，或把页面拆到独立页面文件。`data` 本身是对象，列表要放在 `data.items`、`data.tasks` 等字段下。

## 4. 可视化编辑器

打开 `app.yaml`、独立页面文件或 `ui/pages/**/*.yaml` 后，在命令面板运行：

~~~text
Page TUI: 打开可视化编辑器
~~~

左侧管理页面和变量，中间编辑布局树与 action，右侧修改当前节点属性。布局节点可以拖拽到同级节点前面，也可以使用上移、下移和删除操作。

绑定、列表、action 路径和页面目标支持候选值。新增组件、变量、页面或 action 后会自动写回当前 YAML；修改不会执行 Node.js 代码。

样式属性支持预设样式、自定义样式对象和条件样式；`visible` 与 `if.condition` 使用条件构建器，可选择直接变量、`notEmpty`、`empty`、`truthy`、`equals`、`notEquals`、`all`、`any` 和 `not`，也可以切换到高级 JSON。直接判断变量表示判断变量的真值，例如 `condition: data.items`；选择“等于”或“不等于”后，会分别显示“左值”和“右值”，两边都可以从变量路径候选中选择，也可以切换为固定值并手动输入。例如：

~~~yaml
condition:
  equals:
    - state.selected
    - 0
~~~

`if` 的 `then`、`else` 分支可以选择、添加和删除动作，并保留参数 JSON 编辑入口。扩展升级后如果已经打开的可视化编辑器仍显示旧内容，请关闭该编辑器标签页并重新打开；新的 custom editor 不会继续保留旧的隐藏 Webview 状态。

“按键与动作”标题旁的“流程图”按钮会打开独立的事务流程编辑器。它只编辑当前页面的 `keys.*` 和 `on.*` 动作，不会改变现有布局树、组件拖拽或属性面板的编辑方式。普通动作按执行顺序连线，`if` 使用“满足/不满足”分支，shell `call` 使用“逐行/退出”回调分支。

左侧节点库包含 Shell 命令、直接运行程序、Service、变量设置与提取、列表追加/移动/删除、布尔切换、退格、进度、条件、通知、刷新和页面导航。窄屏时通过工具栏的节点库按钮打开同一目录。节点可以拖入画布，也可以右键创建；新节点默认保持游离，不会改动已有连线，连接执行链后才会写回 YAML。`if` 的“继续”和事件的“结束”是自动结构节点，不需要手动创建。

右侧参数区默认使用结构化表单，固定值、变量引用、模板和 JSON 可以直接切换，`if` 条件支持嵌套的全部满足、任一满足和取反；“高级 JSON”仍可编辑完整 action。`call` 可以切换 Shell、直接程序和 Service，配置阻塞等待、失败检查、工作目录、参数、环境变量、标准流和缓冲区，并按需把完整结果、stdout、stderr、行列表、JSON 或退出码写入指定变量。创建/设置变量节点会生成运行时 `set` 动作，不会额外修改页面初始 `state`。

布局属性中的标题、文字、占位文字、列表空状态和进度标签可以在“固定文本 / 变量绑定 / 模板 / 翻译键 / 高级 JSON”之间切换；翻译键模式可直接填写 `with` 模板参数。流程图的值参数也提供同样的“翻译”模式。

左侧“翻译文件”区域用于维护翻译字典本身：可以创建并注册 YAML/JSON 语言文件、搜索和新增嵌套翻译键，也可以在右侧属性区编辑或删除当前值。外部语言写回对应文件，内联语言写回 manifest；移除语言只删除 `i18n.locales`（或 `files`、`sources`）映射，不会删除磁盘文件。已经打开的语言文件发生修改时，键列表会实时同步。

节点位置只保存在 VS Code Webview 状态中，不会写入 YAML。点击连线后可在检查器中删除，也可按 `Delete` 或 `Backspace`；断开的动作、重复出口或循环会作为 Webview 草稿保留，整张图重新合法后才写回对应事件，避免编辑中间态覆盖原动作。标量 service 写法 `call: tasks.save` 只有“后续”出口，因为 `onLine`、`onExit` 是外部 shell 命令的回调能力。

manifest 使用外部页面文件时，页面列表中的外部页面也可以直接编辑。共享 `data` 写入 manifest，外部页面的 layout、state 和 keys 写入被引用的页面文件。YAML AST 写回会尽量保留注释、未知字段和原有结构；需要高级配置时可以点击“源码”切回文本编辑器。

## 5. 最常用的工作流

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

`-` 的补全会根据根节点切换：

- `data` 下显示 `object` 和 `value` 数据项模板。
- `pages` 的 `layout.children` 下显示 `text`、`input`、`column`、`row`、`panel`、`list` 等组件节点模板。
- `keys`、`on`、`then`、`else` 下才显示 `set`、`push`、`if` 等动作模板。

因此在 `data` 列表里不会误弹动作。`data` 的字段名是用户自定义的，扩展不会擅自猜测 `name`、`title` 等字段；编辑器中灰色的字段文字仍可能来自 AI 内联建议。

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
- 加载 manifest 引用的外部语言文件，并按语言变量解析 `{ t: ... }` 和 `t()`。
- YAML 暂时写错时显示错误，修正后自动恢复。

预览会在内存中执行安全的内置 keys 动作，例如 set、move、toggle、append、push、pop 和 if；不会执行 call、refresh、Node.js service、网络请求或数据库操作。需要验证真实运行环境时，使用“Page TUI: 运行当前项目”。

## 6. 校验功能

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

## 7. 命令列表

| 命令 | 作用 |
| --- | --- |
| Page TUI: 创建初学者页面 | 生成一个可运行的完整页面 |
| Page TUI: 插入页面模板 | 在当前编辑器位置插入完整模板 |
| Page TUI: 校验当前页面 | 手动运行页面校验 |
| Page TUI: 将当前文件设为 Page TUI YAML | 手动启用语言支持 |
| Page TUI: 打开实时预览 | 在编辑器旁边实时查看页面布局 |
| Page TUI: 打开可视化编辑器 | 用布局树和属性表单编辑页面 |
| Page TUI: 运行当前项目 | 在终端执行启动命令 |
| Page TUI: 打开中文文档 | 打开仓库的中文文档目录 |

## 8. 设置项

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

## 9. 与 YAML 扩展配合

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

## 10. 扩展目录

~~~text
vscode-extension/
├── extension.js                  # VS Code 激活入口、补全、悬停、命令和 custom editor
├── visual-editor.js              # 可视化编辑器模型、AST 操作和 Webview
├── workflow-model.js             # action 与流程图的双向转换和完整性校验
├── webview/                      # React Flow 流程编辑器源码
├── media/                        # 构建后随扩展发布的 Webview 资源
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

## 11. 当前边界

这个扩展不会执行 YAML 中的任意 JavaScript，也不会替代 Page TUI runtime。实时预览只在内存中模拟有限的页面状态和内置动作，不会执行外部 service。

当前不会自动知道：

- 自定义 service 是否真的存在。
- 数据库返回的数据类型。
- 业务逻辑是否正确。
- 网络请求是否成功。
- 自定义 action 是否会修改正确的数据。

这些内容仍然需要在 Node.js service 和自动化测试中验证。

扩展校验是帮助你尽早发现明显错误，不是 TypeScript 类型系统，也不是完整语言服务器。

## 12. 测试

在仓库根目录运行：

~~~bash
npm --prefix vscode-extension test
npm --prefix vscode-extension run build:webview
npm --prefix vscode-extension run smoke:webview
~~~

当前测试覆盖：

- 生成模板可以被 Page TUI YAML 解析。
- 仓库中的真实示例没有结构错误。
- 未知组件和未注册页面可以被发现。
- 独立页面文件可以被校验。
- 页面字段补全会在普通 YAML 模式中触发。
- 实时预览可以渲染页面、变量、列表和页面切换。
- action、`if` 分支和 shell 回调可以在流程图与 YAML 之间往返。
- 打包后的 React Flow Webview 可以在桌面和窄屏尺寸中完成节点插入与写回。
- YAML 错误会显示为预览面板错误，而不是导致扩展崩溃。
- YAML 语法错误可以被发现。
