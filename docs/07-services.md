# 07：Service 与 Node.js 业务代码

YAML 适合描述：

- 页面结构。
- 变量绑定。
- 常见的本地动作。
- 页面之间的导航。

YAML 不应该负责：

- 数据库连接。
- HTTP 请求。
- 文件读写。
- 权限检查。
- 事务。
- 复杂业务规则。
- 密码、金额、库存等敏感逻辑。

这些逻辑放在 Node.js service 中。

## 1. Service 是什么

service 是一个由 Node.js 注册、由 YAML 按名字调用的函数。

Node.js：

~~~js
const services = {
  "tasks.save": async ({ task }) => {
    await database.tasks.save(task);
  }
};
~~~

YAML：

~~~yaml
keys:
  enter:
    - call: tasks.save
      with:
        task:
          bind: state.task
~~~

YAML 只知道 tasks.save 这个名字，不知道数据库细节。

## 2. 启动器写法

~~~js
const { createDeclarativeApp } = require("page-tui");

const tasks = [];

const app = createDeclarativeApp({
  manifest: path.join(__dirname, "ui", "app.yaml"),

  data: {
    tasks
  },

  services: {
    "tasks.create": ({ title }) => {
      const task = {
        id: String(Date.now()),
        title,
        done: false
      };
      tasks.push(task);
      return task;
    },

    "tasks.toggle": ({ id }) => {
      const task = tasks.find((item) => item.id === id);
      if (!task) throw new Error("任务不存在");
      task.done = !task.done;
      return task;
    }
  }
});

app.start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
~~~

注意：这里的 data.tasks 和 tasks 使用同一个数组，所以 service 修改后页面能看到变化。

## 3. Service 的参数

YAML 的 with 会生成 service 的第一个参数对象：

~~~yaml
- call: tasks.create
  with:
    title:
      trim:
        bind: state.title
    operatorId:
      bind: data.currentUser.id
~~~

service 收到：

~~~js
async function createTask({ title, operatorId }) {
  // title 是字符串
  // operatorId 是当前用户 ID
}
~~~

参数可以来自：

- 固定值。
- data。
- state。
- params。
- key。
- item。
- template。
- itemAt。
- trim。

## 4. 固定值参数

~~~yaml
- call: tasks.search
  with:
    status: "open"
    limit: 20
    includeArchived: false
~~~

Node.js：

~~~js
"tasks.search": async ({ status, limit, includeArchived }) => {
  return database.tasks.search({
    status,
    limit,
    includeArchived
  });
}
~~~

## 5. 当前列表项目参数

~~~yaml
- call: tasks.delete
  with:
    id:
      itemAt:
        list: data.tasks
        index: state.selected
        key: id
~~~

如果当前 selected 是 2，就会取 data.tasks[2].id。

## 6. Service 返回值

service 可以返回任何普通数据：

~~~js
"tasks.load": async ({ id }) => {
  return database.tasks.findById(id);
}
~~~

当前动作执行器会把结果放到 action context 的 lastResult 中，供高级扩展使用。

对于初学者，最简单的做法是：

1. service 直接修改 data。
2. 页面执行 refresh 或重新渲染。
3. 页面模板直接读取 data。

## 7. Service 与 data 的更新策略

### 策略 A：service 直接修改共享 data

~~~js
const data = {
  tasks: []
};

const services = {
  "tasks.toggle": ({ id }) => {
    const task = data.tasks.find((item) => item.id === id);
    task.done = !task.done;
  }
};
~~~

优点：

- 简单。
- 页面立即能读到结果。
- 适合本地应用和小型工具。

缺点：

- 数据持久化和 UI 状态混在一起。
- 大型项目需要更严格的 store。

### 策略 B：service 返回结果，由 refresh 重新读取

~~~js
const path = require("node:path");
const { createDeclarativeApp } = require("page-tui");
const dataSource = require("./data-source");

const app = createDeclarativeApp({
  manifest: "./ui/app.yaml",
  data: {
    tasks: []
  },
  services: {
    "tasks.delete": ({ id }) => dataSource.delete(id)
  },
  refresh: async ({ runtime }) => {
    runtime.data.tasks = await dataSource.list();
  }
});
~~~

YAML：

~~~yaml
keys:
  d:
    - call: tasks.delete
      with:
        id:
          itemAt:
            list: data.tasks
            index: state.selected
            key: id
    - refresh
~~~

优点：

- 数据来源明确。
- 适合数据库或远程 API。
- 页面看到的是重新加载后的真实数据。

缺点：

- 需要额外写 refresh。
- 异步状态、加载状态和错误状态要自行设计。

## 8. 异步 service

service 可以是 async 函数：

~~~js
"orders.load": async ({ orderId }) => {
  const response = await fetch(`/api/orders/${orderId}`);
  if (!response.ok) throw new Error("订单加载失败");
  return response.json();
}
~~~

YAML：

~~~yaml
on:
  enter:
    - set:
        path: state.loading
        value: true
    - call: orders.load
      with:
        orderId:
          bind: params.orderId
    - set:
        path: state.loading
        value: false
~~~

建议同时设计错误处理。简单的页面可以在启动器中统一处理错误；需要页面内提示时，可以把 service 调用拆成更小的 Node.js action，或添加专门的自定义 action。

## 9. Service 错误

service 直接抛出错误：

~~~js
"tasks.save": async ({ task }) => {
  if (!task.title) throw new Error("任务标题不能为空");
  await database.tasks.save(task);
}
~~~

框架会进入 App 的错误处理路径。

生产应用建议在 service 层：

- 使用明确的错误消息。
- 检查参数。
- 检查权限。
- 不把密码、token 或数据库连接信息写进错误信息。
- 对可预期的业务错误使用统一格式。

## 10. 为什么不允许 YAML 直接执行 JS

不要设计成：

~~~yaml
- eval: "database.tasks.delete(state.id)"
~~~

原因：

- 页面文件可以执行任意代码。
- 错误难以定位。
- 页面作者必须学习 JavaScript。
- 安全边界不清楚。
- 很难测试和审查。
- 数据库、文件系统、进程环境会被意外暴露。

允许列表 service 更安全：

~~~yaml
- call: tasks.delete
~~~

Node.js 只注册明确允许调用的函数。

## 11. Service 命名

建议使用领域名加动作：

~~~text
tasks.list
tasks.create
tasks.update
tasks.delete
tasks.toggle
users.login
users.logout
orders.load
orders.submit
settings.save
~~~

不要使用过于模糊的名字：

~~~text
doThing
run
handle
execute
process
~~~

好的名字可以让 YAML 自己解释业务意图：

~~~yaml
- call: orders.submit
~~~

## 12. Service 的边界

service 应该负责业务和外部副作用：

~~~text
读取数据库
写入数据库
请求 API
检查权限
计算金额
生成文件
发送消息
~~~

service 不应该负责：

~~~text
决定屏幕上放几个 panel
知道终端宽度
拼接 ANSI 颜色
修改页面 selected
直接调用 page.push
~~~

页面动作负责流程，service 负责业务。

## 13. 一个保存页面的完整例子

YAML：

~~~yaml
pages:
  edit:
    state:
      title: ""
      saving: false
      error: ""

    keys:
      enter:
        - if:
            condition:
              empty: state.title
            then:
              - set:
                  path: state.error
                  value: "标题不能为空"
            else:
              - set:
                  path: state.saving
                  value: true
              - call: tasks.save
                with:
                  title:
                    trim:
                      bind: state.title
              - set:
                  path: state.saving
                  value: false
              - pop
~~~

Node.js：

~~~js
const services = {
  "tasks.save": async ({ title }) => {
    await database.tasks.create({ title });
  }
};
~~~

布局：

~~~yaml
layout:
  type: column
  children:
    - type: input
      bind: state.title
      placeholder: "请输入标题"

    - type: text
      template: "{{ if(state.saving, '保存中...', '') }}"
      style: muted

    - type: text
      bind: state.error
      visible: state.error
      style: danger
~~~

## 14. Service 测试

service 本身可以脱离终端测试：

~~~js
const test = require("node:test");
const assert = require("node:assert/strict");

test("tasks.toggle changes done", () => {
  const task = { id: "1", done: false };
  const services = {
    "tasks.toggle": ({ id }) => {
      if (id !== task.id) throw new Error("not found");
      task.done = !task.done;
    }
  };

  services["tasks.toggle"]({ id: "1" });
  assert.equal(task.done, true);
});
~~~

这样数据库和业务规则不需要通过 TUI 才能验证。

## 15. 面向初学者的建议

刚开始做项目时：

1. 先把假数据直接放在 manifest 的 data 中。
2. 先使用内置 set、toggle、append、remove。
3. 只有需要文件、数据库或网络时才增加 service。
4. 一个 service 只做一件明确的事。
5. 不要把复杂业务逻辑塞进 YAML。
6. 不要让多个 service 同时负责同一个字段的更新。
7. 在 service 中验证输入，不要只依赖页面上的 visible。
