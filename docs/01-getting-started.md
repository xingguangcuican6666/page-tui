# 01：从零运行第一个页面

本章目标是让你完成三件事：

1. 安装并运行 Page TUI。
2. 看懂一个最小页面。
3. 修改 YAML 后立即看到界面变化。

你不需要先学习 JavaScript。

## 1. 环境要求

- Node.js 18 或更高版本。
- 一个可以运行 npm 的终端。
- Windows、macOS、Linux 都可以。
- 如果希望看到颜色、方向键和备用屏幕，需要在真实 TTY 中运行。

检查 Node.js：

~~~bash
node --version
npm --version
~~~

如果 Node.js 版本低于 18，先升级 Node.js。

## 2. 安装

进入项目目录：

~~~bash
cd page-tui
~~~

安装依赖：

~~~bash
npm install
~~~

当前运行时依赖主要是 yaml。它负责把人类容易阅读的 YAML 文件转换成 JavaScript 对象。

安装完成后，项目会出现 node_modules 目录。这个目录不需要提交到 Git，项目已经通过 .gitignore 忽略它。

## 3. 运行内置示例

~~~bash
npm start
~~~

loader 会自动发现项目中的 manifest 并启动页面。如果项目中有多个 manifest，请明确指定：

~~~bash
npm start -- path/to/app.yaml
~~~

键位由 manifest 中当前页面的 `keys` 定义。没有被页面处理的 `q` 会退出应用，`Esc` 默认返回上一页，`Ctrl+C` 强制退出。

退出后，终端会恢复原来的光标和屏幕。

## 4. 项目文件结构

~~~text
page-tui/
├── examples/                     # 可选的示例 manifest
├── src/
│   ├── core/
│   │   ├── app.js                # 应用生命周期
│   │   ├── page.js               # Page 基类
│   │   ├── page-manager.js       # 页面栈
│   │   ├── terminal.js           # 终端输入输出
│   │   └── renderer.js           # 绘制
│   ├── declarative/
│   │   ├── app.js                # YAML 应用入口
│   │   ├── page.js               # YAML 页面编译器
│   │   └── value.js              # 变量路径、模板和条件
│   └── ui.js                     # 基础 UI 组件
├── test/                         # 自动化测试
└── package.json
~~~

如果你只想做页面，不需要阅读 src。

## 5. 最小可运行 manifest

创建文件 ui/app.yaml：

~~~yaml
initial: home

pages:
  home:
    layout:
      type: text
      value: "你好，Page TUI"
~~~

如果需要从代码中指定 manifest，可以创建启动文件 run.js：

~~~js
const { createDeclarativeApp } = require("./src");

createDeclarativeApp({
  manifest: "./ui/app.yaml"
}).start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
~~~

运行：

~~~bash
node run.js
~~~

直接使用通用 loader 也可以：

~~~bash
node src/loader.js ui/app.yaml
~~~

这里的 initial: home 表示应用启动时打开 pages.home。

如果没有写 initial，框架会使用 pages 中的第一个页面。

## 6. 第一次修改布局

把 manifest 改成：

~~~yaml
initial: home

pages:
  home:
    layout:
      type: column
      padding: 1
      children:
        - type: text
          value: "第一行"
          style: title

        - type: text
          value: "第二行"
          style: muted

        - type: divider

        - type: text
          value: "第四行"
~~~

保存后重新运行：

~~~bash
node run.js
~~~

YAML 的 children 顺序就是屏幕上的显示顺序。

## 7. 添加共享数据和页面状态

~~~yaml
initial: home

data:
  username: "小明"
  tasks:
    - title: "阅读文档"

pages:
  home:
    state:
      selected: 0
      notice: ""

    layout:
      type: column
      children:
        - type: text
          template: "你好，{{ data.username }}"

        - type: text
          template: "任务数量：{{ count(data.tasks) }}"

        - type: text
          template: "当前选择：{{ state.selected }}"
~~~

这里：

- data.username 是应用数据。
- data.tasks 是应用数据。
- state.selected 是 home 页面自己的状态。
- state.notice 是 home 页面自己的状态。
- {{ ... }} 是模板占位符。

## 8. 常见的第一次错误

### 错误：找不到 yaml

现象：

~~~text
Error: Cannot find module 'yaml'
~~~

解决：

~~~bash
npm install
~~~

### 错误：YAML 缩进不一致

YAML 依赖缩进表示层级。下面是错误示例：

~~~yaml
layout:
  type: column
    children:
      - type: text
~~~

children 多缩进了一层。正确写法：

~~~yaml
layout:
  type: column
  children:
    - type: text
~~~

建议：

- 统一使用两个空格。
- 不要使用 Tab。
- 一层 children 只增加两个空格。
- 字符串里包含冒号时，用引号包起来。

### 错误：模板变量显示为空

~~~yaml
value: "{{ user.name }}"
~~~

当前运行时不认识没有来源前缀的 user.name。请明确写：

~~~yaml
value: "{{ data.user.name }}"
~~~

或者：

~~~yaml
value:
  bind: data.user.name
~~~

### 错误：页面启动后立即退出

请确认：

- 使用真实终端运行，而不是把输出重定向到文件。
- 没有在启动代码里立刻调用 app.quit。
- initial 指向了存在的页面。
- pages 至少有一个页面。

## 9. 下一步

如果你已经能修改最小页面，继续阅读：

- [02 - 核心概念](./02-core-concepts.md)
- [03 - YAML 页面布局](./03-yaml-layout.md)
- [04 - 变量和模板](./04-variables-and-templates.md)
