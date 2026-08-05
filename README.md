# Page TUI

一个适合初学者的 Node.js TUI 框架。页面可以完全用 YAML 编写，不需要写 class、render() 或 onKey()。

## 运行示例

~~~bash
npm install
npm start
~~~

`npm start` 会运行 `src/loader.js`。loader 会优先寻找当前项目根目录的
`app.yaml`、`app.yml`、`page-tui.yaml` 或 `page-tui.yml`；如果根目录没有，且项目中只有一个这类文件，也会自动使用它。

也可以明确指定入口：

~~~bash
npm start -- path/to/app.yaml
~~~

页面作者通常只需要编辑 YAML，不需要维护固定的 Node.js 启动文件。

## 构建二进制

~~~bash
npm run build -- --manifest examples/arch_installer/app.yaml
./dist/arch_installer
~~~

指定 manifest 时，构建产物会内嵌 Page TUI 运行时、UI 渲染逻辑、manifest，以及 manifest 引用的外部页面和语言文件；运行时不再需要传入 YAML。默认输出到 `dist/<manifest 目录名>`，也可以指定文件名：

~~~bash
npm run build -- --manifest ui/app.yaml --output dist/my-tui
~~~

这个步骤需要 Node.js 26 或更高版本，因为它依赖 Node 自带的 SEA 构建能力。不指定 manifest 时会构建通用 runner：`dist/page-tui`。

## 超详细文档

完整中文文档从安装、页面模型、布局、变量、动作、页面栈、Service、组件、高级 API、内部架构、排错、完整项目模板、VS Code 扩展到外部语言模块，共 14 章：

[打开完整文档目录](docs/README.md)

如果你主要用 VS Code 写页面，可以直接使用仓库内的扩展：[vscode-extension/README.md](vscode-extension/README.md)。

## 页面模型

~~~text
data    应用数据：所有页面都能使用
state   页面变量：只属于当前页面
params  页面参数：上一个页面传进来的数据
layout  页面布局：从上到下就是屏幕顺序
keys    按键动作：按键后要做什么
~~~

### 变量绑定

~~~yaml
data:
  tasks:
    - title: "学习 TUI"
      done: false

pages:
  home:
    state:
      selected: 0

    layout:
      type: text
      template: "当前选中第 {{ state.selected }} 项，共 {{ count(data.tasks) }} 项"
~~~

变量路径始终写清楚来源：

- data.tasks：应用共享数据
- state.selected：当前页面状态
- params.task.title：上一个页面传入的任务标题
- key.value：用户刚刚输入的字符

### 外部语言模块

~~~yaml
data:
  locale: zh-CN

i18n:
  locale:
    bind: data.locale
  fallback: zh-CN
  locales:
    zh-CN: locales/zh-CN.yaml
    en: locales/en.yaml
~~~

组件文本使用 `{ t: common.title }`，普通模板使用 `{{ t('common.title') }}`。通过 `set data.locale` 即可在运行时切换，独立构建会把语言文件一并内嵌。完整说明见 [外部语言模块与运行时切换](docs/14-internationalization.md)。

### 布局

布局是一个树，从外到内、从上到下阅读：

~~~yaml
layout:
  type: column
  padding: [1, 2]
  children:
    - type: text
      value: "页面标题"
      style: title

    - type: panel
      title: "任务列表"
      flex: true
      child:
        type: list
        items: data.tasks
        selected: state.selected
        label: "{{ item.title }}"

    - type: text
      value: "底部说明"
      style: muted
~~~

可用组件：text、input、column、row、panel、popup、progress、list、divider、spacer。

### 页面跳转

页面栈由框架自动管理：

~~~yaml
keys:
  enter:
    - push:
        page: detail
        params:
          task:
            itemAt:
              list: data.tasks
              index: state.selected

  escape:
    - pop
~~~

这表示：Enter 打开 detail 页面，并把当前任务传给它；Esc 返回上一页。

### 常用动作

~~~yaml
keys:
  up:
    - move:
        path: state.selected
        by: -1
        list: data.tasks

  space:
    - toggle:
        list: data.tasks
        index: state.selected
        field: done

  d:
    - remove:
        list: data.tasks
        index: state.selected
    - set:
        path: state.notice
        value: "删除成功"
~~~

内置动作包括：set、move、toggle、remove、append、backspace、push、replace、reset、pop、if、call。

模板只提供少量、容易理解的函数：

~~~yaml
value: "{{ item.title }}"
value: "{{ if(item.done, '已完成', '未完成') }}"
value: "共 {{ count(data.tasks) }} 项"
~~~

这里没有开放任意 JavaScript 表达式，避免页面文件变成另一种难学的编程语言。

## 需要写 JS 时怎么办

普通页面不需要 JS。只有数据库、网络请求或复杂业务规则才需要注册 service：

~~~js
const { createDeclarativeApp } = require("page-tui");

createDeclarativeApp({
  manifest: "./ui/app.yaml",
  services: {
    "orders.save": async ({ order }) => {
      await database.save(order);
    }
  }
}).start();
~~~

YAML 既可以调用已经注册的 service：

~~~yaml
- call: orders.save
  with:
    order:
      bind: state.order
~~~

也可以直接执行外部命令：

~~~yaml
- call:
    sh: "printf hello"
    stdio: pipe
    result: state.lastCall
~~~

这样页面作者不需要接触数据库或 Node.js 内部代码。

## 高级 API

原来的 JS class API 仍然保留，入口在 src/core/page.js。YAML 层只是建立在 App、Page、PageManager 和 UI renderer 之上的易用入口。

核心实现：

- src/declarative/app.js：加载 YAML 与创建应用
- src/declarative/page.js：布局编译与动作执行
- src/declarative/value.js：变量路径、模板与条件
- src/core/page-manager.js：页面栈
