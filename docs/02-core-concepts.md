# 02：核心概念——data、state、params、page

如果你只记住一件事，请记住：

~~~text
data   是应用的共享数据
state  是当前页面的临时变量
params 是进入当前页面时收到的数据
page   是一个屏幕和它的交互规则
~~~

## 1. App、Page 和 PageManager

从外部看，一个应用由三层组成：

~~~text
App
└── PageManager
    ├── home page
    ├── detail page
    └── create page
~~~

### App

App 负责：

- 启动终端。
- 接收键盘输入。
- 触发当前页面的按键动作。
- 在变量变化后重新绘制。
- 处理 q、Esc、Ctrl+C 默认行为。
- 在退出时恢复光标和终端屏幕。

初学者不需要直接操作 App。

### Page

Page 表示一个页面。声明式页面通常包含：

~~~yaml
home:
  state: {}
  layout: {}
  keys: {}
~~~

页面的三个核心部分：

- state：页面自己的变量。
- layout：页面长什么样。
- keys：页面如何响应按键。

### PageManager

PageManager 管理页面栈。

例如：

~~~text
打开 home：
[home]

从 home 打开 detail：
[home, detail]

detail 返回：
[home]

从 home 打开 create：
[home, create]

create 替换为 login：
[home, login]
~~~

push 会增加一层页面，pop 会返回上一层，replace 会替换当前层，reset 会清空历史后打开新页面。

## 2. data：应用共享数据

data 定义在 manifest 顶层：

~~~yaml
data:
  user:
    name: "小明"

  tasks:
    - id: "1"
      title: "阅读文档"
      done: false
~~~

所有页面都可以读取 data：

~~~yaml
pages:
  home:
    layout:
      type: column
      children:
        - type: text
          template: "用户：{{ data.user.name }}"
        - type: text
          template: "任务数：{{ count(data.tasks) }}"
~~~

### data 的适用范围

适合放在 data 中：

- 从文件加载的列表。
- 当前登录用户。
- 应用配置。
- 多个页面都需要的数据。
- 页面操作后仍然要保留的数据。
- 业务实体，例如任务、订单、用户。

不适合放在 data 中：

- 只用于页面显示的临时提示。
- 当前页面的选中序号。
- 当前输入框的草稿。
- 只与某一个页面有关的展开状态。

### data 是共享的

如果 home 修改 data.tasks，detail 页面稍后读取到的也是修改后的 data.tasks。

~~~yaml
keys:
  space:
    - toggle:
        list: data.tasks
        index: state.selected
        field: done
~~~

这里修改的是 data.tasks 中的真实对象，而不是一份只存在于当前页面的副本。

## 3. state：当前页面自己的变量

state 写在页面内部：

~~~yaml
pages:
  home:
    state:
      selected: 0
      notice: ""
      filter: "all"
~~~

使用：

~~~yaml
layout:
  type: column
  children:
    - type: text
      template: "当前序号：{{ state.selected }}"
    - type: text
      bind: state.notice
      visible: state.notice
~~~

### state 的生命周期

每次创建一个新的页面实例时，框架会复制该页面定义中的 state 初始值。

例如：

~~~yaml
pages:
  create:
    state:
      title: ""
      error: ""
~~~

第一次 push create：

~~~text
state.title = ""
state.error = ""
~~~

输入一些内容后：

~~~text
state.title = "测试任务"
~~~

pop 后再 push 一个新的 create 页面，新的页面会重新从空字符串开始。

### state 不会自动跨页面共享

下面是两个不同页面的 state：

~~~yaml
pages:
  home:
    state:
      selected: 0

  create:
    state:
      selected: 0
      title: ""
~~~

它们虽然都叫 selected，但完全不是同一个变量。

如果两个页面需要共享值，应把值放在 data，或者在 push 时通过 params 传递。

## 4. params：页面跳转参数

params 是当前页面收到的参数。

home 页面打开 detail：

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
~~~

detail 页面读取：

~~~yaml
pages:
  detail:
    layout:
      type: column
      children:
        - type: text
          template: "标题：{{ params.task.title }}"
        - type: text
          template: "详情：{{ params.task.detail }}"
~~~

params 是进入页面时传递的数据，不需要重复复制到 state。

### params 的推荐用途

适合传递：

- 当前选中的任务。
- 当前要编辑的订单。
- 当前用户 ID。
- 当前模式，例如 view 或 edit。
- 返回后需要知道的上下文。

~~~yaml
params:
  taskId: "task-001"
  mode: "edit"
~~~

### 传对象还是传 ID

小型示例可以直接传对象：

~~~yaml
params:
  task:
    itemAt:
      list: data.tasks
      index: state.selected
~~~

大型应用更建议传稳定 ID：

~~~yaml
params:
  taskId:
    template: "{{ item.id }}"
~~~

然后由 Node.js service 或 refresh 逻辑根据 ID 重新取得数据。

直接传对象很方便，但 detail 页面修改 params.task.done 时，实际上会修改 data.tasks 中同一个对象。传 ID 则更容易控制数据更新边界。

## 5. key：当前按键

key 只在 keys 动作执行期间存在。

输入页：

~~~yaml
keys:
  character:
    - append:
        path: state.title
        value:
          bind: key.value
~~~

如果用户按下字母 a：

~~~text
key.name  = "a"
key.value = "a"
key.ctrl  = false
~~~

如果用户按下 Ctrl+C：

~~~text
key.name  = "c"
key.ctrl  = true
~~~

如果用户按下方向键：

~~~text
key.name  = "up"
key.value = undefined
~~~

常用 key.name：

| 按键 | key.name |
| --- | --- |
| ↑ | up |
| ↓ | down |
| ← | left |
| → | right |
| Enter | enter |
| Esc | escape |
| Backspace | backspace |
| Delete | delete |
| Tab | tab |
| 空格 | 空格会匹配 keys.space |
| 普通字符 | 字符本身，例如 a、n、1 |

## 6. 变量路径

路径必须从一个明确的根开始：

~~~text
data.tasks
data.user.name
state.selected
state.form.title
params.task.id
params.mode
key.value
item.title
~~~

支持数组下标：

~~~text
data.tasks[0].title
~~~

变量根的含义：

| 根 | 来源 | 是否可写 |
| --- | --- | --- |
| data | manifest 顶层共享数据 | 是 |
| state | 当前页面 state | 是 |
| params | 页面进入参数 | 是 |
| page | params 的别名 | 是 |
| item | list 当前项目 | 主要用于读取 |
| key | 当前按键 | 读取 |
| app | App 对象 | 不建议在 YAML 中使用 |

修改变量时，推荐只修改 data、state、params：

~~~yaml
- set:
    path: state.notice
    value: "保存成功"
~~~

## 7. 读取变量的三种方式

### bind：读取完整值

~~~yaml
- type: text
  bind: state.notice
~~~

bind 适合：

- text 显示一个变量。
- list 的 items。
- list 的 selected。
- input 的 value。
- service 参数。

### template：把多个值拼成文字

~~~yaml
- type: text
  template: "用户 {{ data.user.name }} 有 {{ count(data.tasks) }} 个任务"
~~~

### itemAt：从数组取一个项目

~~~yaml
itemAt:
  list: data.tasks
  index: state.selected
~~~

取项目中的某个字段：

~~~yaml
itemAt:
  list: data.tasks
  index: state.selected
  key: id
~~~

## 8. 选择 data、state 还是 params

可以按下面的问题判断：

### 这个值是否多个页面都需要？

是：放 data。

~~~yaml
data:
  tasks: []
~~~

### 这个值是否只服务于当前页面？

是：放 state。

~~~yaml
state:
  selected: 0
  notice: ""
~~~

### 这个值是否由上一个页面带过来？

是：放 params。

~~~yaml
params:
  taskId: "task-001"
~~~

### 这个值是否可以由其他变量计算出来？

不要重复存储，使用模板：

~~~yaml
template: "共 {{ count(data.tasks) }} 个任务"
~~~

## 9. 一个完整的变量流

下面是从首页进入详情页的完整流转：

~~~text
1. data.tasks 存放全部任务
2. home.state.selected 存放当前序号
3. Enter 触发 itemAt(data.tasks, state.selected)
4. push 把得到的任务放入 detail.params.task
5. detail.layout 读取 params.task.title
6. detail 的 toggle 动作修改 params.task.done
7. pop 返回 home
8. home 重新渲染，显示最新的 data.tasks
~~~

这就是 Page TUI 的变量系统。没有全局隐式变量，也不需要在页面之间复制一堆状态。

## 10. 下一步

- 要学习如何组织屏幕结构，阅读 [03 - YAML 页面布局](./03-yaml-layout.md)。
- 要学习模板和条件，阅读 [04 - 变量绑定、模板和条件](./04-variables-and-templates.md)。
- 要学习按键和修改数据，阅读 [05 - 按键与动作](./05-actions.md)。
