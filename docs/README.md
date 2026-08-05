# Page TUI 文档

这套文档面向两类读者：

1. **完全不会 JavaScript 的页面作者**：只修改 YAML，完成页面布局、变量绑定和常见交互。
2. **需要扩展框架的 Node.js 开发者**：注册 service、接入数据库，或使用底层 Page / PageManager API。

## 推荐阅读顺序

### 第一次使用

1. [01 - 从零运行第一个页面](./01-getting-started.md)
2. [02 - 核心概念：data、state、params、page](./02-core-concepts.md)
3. [03 - YAML 页面布局](./03-yaml-layout.md)
4. [04 - 变量绑定、模板和条件](./04-variables-and-templates.md)
5. [05 - 按键与动作](./05-actions.md)
6. [06 - 页面跳转与页面栈](./06-page-navigation.md)

### 做真实项目

7. [07 - Service 与 Node.js 业务代码](./07-services.md)
8. [08 - 组件参考](./08-components.md)
9. [09 - 高级 JavaScript API](./09-advanced-api.md)
10. [10 - 内部架构](./10-architecture.md)
11. [11 - 常见问题与排错](./11-troubleshooting.md)
12. [12 - 完整项目模板](./12-full-example.md)
13. [13 - VS Code 扩展](./13-vscode-extension.md)
14. [14 - 外部语言模块与运行时切换](./14-internationalization.md)

## 最重要的心智模型

Page TUI 的页面永远可以先拆成五个问题：

~~~text
这个页面要显示什么？       layout
页面有哪些会变化的值？     state
应用共享哪些数据？         data
进入页面时带入什么？       params
按下每个键要做什么？       keys
~~~

对应的 YAML 结构：

~~~yaml
data:
  tasks: []

pages:
  home:
    state:
      selected: 0

    layout:
      type: column
      children: []

    keys:
      up: []
      down: []
~~~

## 当前项目的两个入口

### 初学者入口

~~~js
const { createDeclarativeApp } = require("page-tui");

createDeclarativeApp({
  manifest: "./ui/app.yaml"
}).start();
~~~

页面和变量写在 YAML 中，Node.js 只负责启动应用。

### 高级入口

~~~js
const { createApp, Page, ui } = require("page-tui");
~~~

高级入口可以直接继承 Page、手写 render 和 onKey。它适合复杂交互或开发框架本身，不是初学者的首选。

## 当前实现的范围

已经支持：

- YAML 或 JSON manifest
- 内联页面定义
- 从独立 YAML / JSON 文件加载页面
- 从独立 YAML / JSON 文件加载语言模块并按变量切换语言
- data、state、params、item、key 变量路径
- 文本模板和少量模板函数
- column、row、panel、list、text、input、divider、spacer
- 页面 push、pop、replace、reset
- up、down、enter、escape、space、backspace 和普通字符按键
- set、move、toggle、remove、append、backspace、push、go、replace、reset、pop、quit、call、refresh、notify、if 动作
- 允许列表 service
- 主题和 ANSI 样式
- 页面栈生命周期
- 非 TTY 输出和交互式终端
- VS Code 扩展：补全、悬停说明、页面校验、实时预览、模板和运行命令

## 当前实现的边界

这不是一个完整的 HTML/CSS 浏览器，也不是任意 JavaScript 执行器：

- 不支持任意 JavaScript 表达式。
- 不允许 YAML 直接执行函数、访问数据库或导入模块。
- 复杂业务逻辑应该放在 Node.js service。
- 当前 input 是一个简单的单行文本输入视图，不是完整的多行编辑器。
- 当前 list 是单行项目列表，不是完整的表格组件。
- 文档中的能力以源码实际实现为准。

## 示例位置

默认入口：

- 通用 loader：[src/loader.js](../src/loader.js)
- 页面文件：项目根目录的 `app.yaml`，或显式指定的 manifest

运行：

~~~bash
npm install
npm start
~~~

指定入口：

~~~bash
npm start -- path/to/app.yaml
~~~

## 验证项目

~~~bash
npm test
~~~

测试覆盖变量绑定、页面导航、service、键盘解析、页面管理和基础渲染。

如果你准备修改框架，建议先阅读：

- [10 - 内部架构](./10-architecture.md)
- [09 - 高级 JavaScript API](./09-advanced-api.md)
- [13 - VS Code 扩展](./13-vscode-extension.md)
