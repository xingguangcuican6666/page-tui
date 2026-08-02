# 09：高级 JavaScript API

如果你只是写 YAML 页面，可以跳过本章。

本章面向：

- 需要自定义组件的开发者。
- 需要复杂键盘交互的开发者。
- 需要直接控制页面生命周期的开发者。
- 需要维护 Page TUI 核心代码的人。

## 1. 包导出

src/index.js 导出：

~~~js
const {
  App,
  Page,
  PageManager,
  Renderer,
  Terminal,
  createApp,
  createPage,
  createDeclarativeApp,
  ui
} = require("page-tui");
~~~

也会直接导出 ui 中的函数：

~~~js
const {
  text,
  column,
  row,
  panel,
  list,
  divider,
  spacer,
  renderView
} = require("page-tui");
~~~

初学者优先使用 createDeclarativeApp。

## 2. createDeclarativeApp

完整选项：

~~~js
const app = createDeclarativeApp({
  manifest: "./ui/app.yaml",

  data: {
    tasks: []
  },

  services: {
    "tasks.save": async (payload, context) => {
      // payload 来自 YAML 的 with
      // context 是当前页面运行上下文
    }
  },

  refresh: async ({ runtime }) => {
    runtime.data.tasks = await loadTasks();
  },

  theme: {
    title: {
      fg: "magenta",
      bold: true
    }
  },

  color: true,
  terminalOptions: {},
  onError: (error, app) => {}
});
~~~

### manifest

可以是文件路径：

~~~js
manifest: "./ui/app.yaml"
~~~

也可以直接传配置对象：

~~~js
manifest: {
  initial: "home",
  data: {},
  pages: {}
}
~~~

JSON 文件也支持：

~~~js
manifest: "./ui/app.json"
~~~

### data

options.data 会与 manifest.data 合并，options.data 中的字段覆盖同名字段。

~~~js
createDeclarativeApp({
  manifest: "./ui/app.yaml",
  data: {
    currentUser: getCurrentUser()
  }
});
~~~

### services

services 是允许 YAML 调用的函数表：

~~~js
services: {
  "users.logout": logout,
  "tasks.create": createTask
}
~~~

### refresh

refresh 是可选的异步数据刷新函数。YAML 执行 refresh 动作时会调用它：

~~~yaml
- refresh
~~~

### theme

theme 覆盖默认主题，不改变 YAML 中的 style 名称。

## 3. App

直接创建底层 App：

~~~js
const app = createApp({
  initialPage: new HomePage(),
  routes: {
    home: () => new HomePage(),
    detail: (params) => new DetailPage(params)
  }
});
~~~

常用方法：

~~~js
await app.start();
await app.push(page, params);
await app.replace(page, params);
await app.reset(page, params);
await app.go(route, params);
await app.back(result);
app.invalidate();
app.render();
app.quit();
~~~

常用属性：

~~~js
app.currentPage
app.pageManager
app.pages
app.terminal
app.renderer
app.running
app.closed
~~~

app.pages 和 app.pageManager 是同一个 PageManager 实例。

## 4. Page

最小 Page：

~~~js
const { Page, ui } = require("page-tui");

class HomePage extends Page {
  constructor() {
    super({
      name: "home",
      title: "首页"
    });
  }

  render() {
    return ui.text("Hello");
  }
}
~~~

### render

render 接受 context：

~~~js
render({ app, manager, page, width, height, theme }) {
  return ui.column([
    ui.text("宽度：" + width),
    ui.text("高度：" + height)
  ]);
}
~~~

render 应该只描述页面，不应该执行数据库写入或导航。

### onKey

~~~js
async onKey(key) {
  if (key.name === "enter") {
    await this.push(new DetailPage());
    return true;
  }
  return false;
}
~~~

返回 true 表示页面已经处理按键。返回 false 时，App 可能执行默认行为：

- q 退出。
- escape 返回。
- Ctrl+C 退出。

### 页面导航快捷方法

Page 内部可以直接使用：

~~~js
this.push(page, params);
this.replace(page, params);
this.reset(page, params);
this.go(route, params);
this.back(result);
this.quit(code);
~~~

### 生命周期

~~~js
async onEnter(params) {}
async onLeave(result) {}
async onResume(result) {}
async onFocus() {}
async onBlur() {}
async onResize(size) {}
~~~

## 5. PageManager

PageManager 管理页面栈：

~~~js
const manager = app.pages;
~~~

属性：

~~~js
manager.current
manager.depth
manager.canGoBack
manager.stack
manager.routes
~~~

方法：

~~~js
manager.register(name, factory);
await manager.reset(page, params);
await manager.push(page, params);
await manager.replace(page, params);
await manager.pop(result);
manager.resolve(target, params);
manager.snapshot();
~~~

snapshot 返回可安全打印的页面信息：

~~~js
[
  {
    name: "home",
    title: "任务列表",
    params: undefined
  },
  {
    name: "detail",
    title: "详情",
    params: {
      taskId: "1"
    }
  }
]
~~~

## 6. createPage 配置对象

不想继承 class 时，可以使用配置对象：

~~~js
const page = createPage({
  name: "about",
  title: "关于",
  render() {
    return ui.text("About");
  },
  onKey(key) {
    return key.name === "escape";
  }
});
~~~

这个配置对象会被包装为 Page。

## 7. UI 函数

基础节点：

~~~js
ui.text("文字", { style: "title" });

ui.column([
  ui.text("上"),
  ui.text("下")
], { padding: 1 });

ui.row([
  ui.text("左"),
  ui.text("右")
], { gap: 2 });

ui.panel(
  ui.text("内容"),
  { title: "面板", flex: true }
);

ui.list(
  [
    { label: "第一项", value: 1 },
    { label: "第二项", value: 2 }
  ],
  { selected: 0 }
);

ui.divider();
ui.spacer(1);
~~~

## 8. 直接渲染 View

renderView 是纯函数：

~~~js
const lines = ui.renderView(
  ui.panel(ui.text("Hello"), { title: "Test" }),
  80,
  24,
  { color: false }
);
~~~

返回固定高度的字符串数组，每一行适合直接写到终端。

它适合测试：

~~~js
const assert = require("node:assert/strict");

assert.equal(lines.length, 24);
assert.equal(lines.some((line) => line.includes("Hello")), true);
~~~

## 9. 自定义 Page 与声明式 Page 共存

可以在一个 App 中同时注册两种页面。

更直接的方式是：

~~~js
const app = createApp({
  initialPage: "home",
  routes: {
    home: () => new HomePage(),
    yamlPage: () => new DeclarativePage("yamlPage", definition, runtime)
  }
});
~~~

声明式层和底层 PageManager 使用同一个页面栈，所以导航模型一致。

## 10. 自定义组件

当前 compileLayout 支持固定 type。如果需要新组件，例如 table，有两种方式：

### 方式 A：修改 compileLayout

在 src/declarative/page.js 增加：

~~~js
case "table":
  return compileTable(node, context);
~~~

然后把 compileTable 转换为已有 UI 节点。

### 方式 B：扩展 UI renderer

在 src/ui.js 增加新的 node kind，并实现：

- naturalHeight。
- naturalWidth。
- renderNode 分支。
- 宽度和高度裁剪。
- 主题样式。

方式 A 更适合业务组件，方式 B 更适合框架级组件。

## 11. 测试自定义 Page

~~~js
const test = require("node:test");
const assert = require("node:assert/strict");

test("home handles enter", async () => {
  const page = new HomePage();
  const handled = await page.onKey({
    name: "enter",
    value: undefined,
    ctrl: false
  });

  assert.equal(handled, true);
});
~~~

页面栈测试参考 test/page-manager.test.js。

## 12. 测试声明式 Page

可以直接创建 manifest 对象，不需要临时文件：

~~~js
const app = createDeclarativeApp({
  manifest: {
    initial: "home",
    data: {
      message: "hello"
    },
    pages: {
      home: {
        layout: {
          type: "text",
          bind: "data.message"
        }
      }
    }
  },
  terminal: fakeTerminal,
  renderer: fakeRenderer
});
~~~

这样测试速度快，也不依赖真实终端。

## 13. 什么时候应该回到底层 API

使用 YAML 的情况：

- 页面主要是布局和表单。
- 动作可以用内置 action 表达。
- 业务逻辑可以放 service。
- 希望非 JavaScript 用户维护页面。

使用 class API 的情况：

- 需要非常复杂的输入编辑器。
- 需要鼠标事件。
- 需要自定义焦点管理。
- 需要动画或复杂的异步状态机。
- 需要动态生成完全不同的组件树。
- 需要直接访问终端底层能力。

YAML 和 class 不是互相排斥，而是两个抽象层。
