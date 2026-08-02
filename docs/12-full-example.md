# 12：完整项目模板

本章把一个页面从单文件示例拆成适合真实项目的目录结构。

## 1. 推荐目录

~~~text
my-tui-app/
├── package.json
├── start.js
├── ui/
│   ├── app.yaml
│   └── pages/
│       ├── home.yaml
│       ├── detail.yaml
│       └── create.yaml
├── src/
│   ├── data-source.js
│   └── services.js
└── test/
~~~

页面作者主要修改 ui 目录。

Node.js 开发者主要修改 start.js、src/data-source.js 和 src/services.js。

## 2. package.json

~~~json
{
  "name": "my-tui-app",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "start": "node start.js",
    "test": "node --test"
  },
  "dependencies": {
    "page-tui": "file:../page-tui"
  }
}
~~~

如果 Page TUI 已经发布到 npm，把 file 依赖改成具体版本：

~~~json
"page-tui": "^0.1.0"
~~~

## 3. app.yaml

~~~yaml
initial: home

data:
  currentUser:
    id: "user-001"
    name: "小明"

  tasks: []

pages:
  home: pages/home.yaml
  detail: pages/detail.yaml
  create: pages/create.yaml
~~~

页面文件路径相对于 app.yaml 所在的目录。

## 4. data-source.js

这是一个简单的内存数据源：

~~~js
const tasks = [
  {
    id: "1",
    title: "阅读文档",
    done: false,
    detail: "了解 data、state、params"
  }
];

async function listTasks() {
  return tasks;
}

async function createTask(input) {
  const task = {
    id: String(Date.now()),
    title: input.title,
    done: false,
    detail: "由创建页添加"
  };
  tasks.push(task);
  return task;
}

async function toggleTask(id) {
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error("任务不存在");
  task.done = !task.done;
  return task;
}

async function deleteTask(id) {
  const index = tasks.findIndex((item) => item.id === id);
  if (index < 0) throw new Error("任务不存在");
  return tasks.splice(index, 1)[0];
}

module.exports = {
  createTask,
  deleteTask,
  listTasks,
  toggleTask
};
~~~

以后可以把这里替换成数据库或 HTTP API，页面 YAML 不需要改变。

## 5. services.js

~~~js
const source = require("./data-source");

const services = {
  "tasks.create": ({ title }) => {
    if (!title || !title.trim()) throw new Error("任务名称不能为空");
    return source.createTask({ title: title.trim() });
  },

  "tasks.toggle": ({ id }) => {
    return source.toggleTask(id);
  },

  "tasks.delete": ({ id }) => {
    return source.deleteTask(id);
  }
};

module.exports = services;
~~~

## 6. start.js

~~~js
const path = require("node:path");
const { createDeclarativeApp } = require("page-tui");
const source = require("./src/data-source");
const services = require("./src/services");

async function main() {
  const app = createDeclarativeApp({
    manifest: path.join(__dirname, "ui", "app.yaml"),
    data: {
      tasks: await source.listTasks()
    },
    services,
    refresh: async ({ runtime }) => {
      runtime.data.tasks = await source.listTasks();
    }
  });

  await app.start();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
~~~

## 7. home.yaml

~~~yaml
name: home

state:
  selected: 0
  notice: ""

layout:
  type: column
  padding: [1, 2]
  children:
    - type: text
      value: "任务管理"
      style: title

    - type: text
      value: "↑/↓ 选择   Enter 查看   n 新建   d 删除"
      style: muted

    - type: divider

    - type: panel
      title: "任务"
      flex: true
      child:
        type: list
        items: data.tasks
        selected: state.selected
        label: "{{ if(item.done, '✓', '○') }} {{ item.title }}"
        description: "{{ if(item.done, '已完成', '未完成') }}"
        emptyText: "暂无任务"

    - type: text
      bind: state.notice
      visible: state.notice
      style: success

    - type: text
      value: "Esc 返回   q 退出"
      style: muted

keys:
  up:
    - move:
        path: state.selected
        by: -1
        list: data.tasks

  down:
    - move:
        path: state.selected
        by: 1
        list: data.tasks

  enter:
    - push:
        page: detail
        params:
          taskId:
            itemAt:
              list: data.tasks
              index: state.selected
              key: id

  n:
    - push:
        page: create

  d:
    - call: tasks.delete
      with:
        id:
          itemAt:
            list: data.tasks
            index: state.selected
            key: id
    - refresh
    - move:
        path: state.selected
        by: 0
        list: data.tasks
    - set:
        path: state.notice
        value: "删除成功"

  space:
    - call: tasks.toggle
      with:
        id:
          itemAt:
            list: data.tasks
            index: state.selected
            key: id
    - refresh
~~~

注意：detail 页面现在收到的是 taskId，而不是整个 task 对象。

## 8. detail.yaml

~~~yaml
name: detail

state:
  task: null
  error: ""

on:
  enter:
    - call: tasks.load
      with:
        id:
          bind: params.taskId

layout:
  type: column
  padding: [1, 2]
  children:
    - type: text
      value: "任务详情"
      style: title

    - type: panel
      title: "Detail"
      flex: true
      child:
        type: column
        gap: 1
        children:
          - type: text
            template: "ID：{{ params.taskId }}"
          - type: text
            template: "详情数据请由 service 写入 state.task"
          - type: text
            bind: state.error
            visible: state.error
            style: danger

    - type: text
      value: "Esc 返回"
      style: muted

keys:
  escape:
    - pop
~~~

这里展示了一个重要的真实项目边界：如果 service 返回值需要写入 state.task，需要额外的自定义 action 或在 Node.js 层把数据直接放到共享 data。对于当前最小框架，初学者可以先把完整对象直接传入 params，等数据层稳定后再切换 ID 模式。

## 9. 更简单的 detail.yaml

如果不需要数据库重新加载，可以直接使用对象 params：

home.yaml：

~~~yaml
params:
  task:
    itemAt:
      list: data.tasks
      index: state.selected
~~~

detail.yaml：

~~~yaml
layout:
  type: column
  children:
    - type: text
      template: "标题：{{ params.task.title }}"
    - type: text
      template: "状态：{{ if(params.task.done, '已完成', '未完成') }}"
~~~

这是最适合学习阶段的写法。

## 10. create.yaml

~~~yaml
name: create

state:
  title: ""
  error: ""

layout:
  type: column
  padding: [1, 2]
  children:
    - type: text
      value: "新建任务"
      style: title

    - type: panel
      title: "Create"
      flex: true
      child:
        type: column
        gap: 1
        children:
          - type: text
            value: "任务名称"

          - type: input
            bind: state.title
            placeholder: "请输入任务名称"

          - type: text
            bind: state.error
            visible: state.error
            style: danger

          - type: text
            value: "Enter 保存   Esc 取消"
            style: muted

keys:
  character:
    - append:
        path: state.title
        value:
          bind: key.value
    - set:
        path: state.error
        value: ""

  backspace:
    - backspace:
        path: state.title

  enter:
    - if:
        condition:
          notEmpty: state.title
        then:
          - call: tasks.create
            with:
              title:
                trim:
                  bind: state.title
          - pop
        else:
          - set:
              path: state.error
              value: "任务名称不能为空"

  escape:
    - pop
~~~

## 11. 运行这个项目

~~~bash
npm install
npm start
~~~

## 12. 增加新页面

步骤：

1. 在 ui/pages 中创建新的 YAML 文件。
2. 在 ui/app.yaml 的 pages 中注册它。
3. 从其他页面使用 push、go 或 replace 打开它。
4. 在新页面中定义自己的 state。
5. 在 layout 中写屏幕结构。
6. 在 keys 中写交互。
7. 如果需要数据库或网络，增加 service。
8. 运行 npm test。
9. 在真实 TTY 中手动验证。

## 13. 项目交付清单

~~~text
[ ] npm install 能成功
[ ] npm start 能启动
[ ] app.yaml 的 initial 存在
[ ] 所有 push 的 page 都已注册
[ ] data/state/params 路径清楚
[ ] 所有输入页都有 backspace
[ ] 删除列表后 selected 不越界
[ ] service 参数经过校验
[ ] service 错误可读
[ ] 不在 YAML 中执行任意 JS
[ ] npm test 通过
[ ] README 和 docs 已更新
[ ] 真实终端测试过 q、Esc、Ctrl+C
~~~

## 14. 从示例发展成真实项目

建议分阶段：

### 阶段一：静态原型

- data 直接写在 app.yaml。
- 不写 service。
- 只用 text、panel、list、input。
- 先确认页面流程。

### 阶段二：本地数据

- 增加一个 data-source.js。
- service 负责读写文件。
- refresh 负责重新加载。

### 阶段三：远程数据

- service 调用 API。
- state 增加 loading、error。
- 对网络错误做清晰提示。

### 阶段四：大型应用

- 按领域拆分 services。
- 使用稳定 ID 而不是传可变对象。
- 增加测试。
- 必要时使用底层 Page API 自定义复杂页面。
