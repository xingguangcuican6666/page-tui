# 04：变量绑定、模板和条件

本章讲清楚三个问题：

1. 如何把变量显示到屏幕上。
2. 如何在一段文字中使用多个变量。
3. 如何根据变量决定显示或隐藏组件。

## 1. 绑定和模板的区别

### bind：整个组件显示一个值

~~~yaml
- type: text
  bind: state.notice
~~~

如果 state.notice 是：

~~~yaml
state:
  notice: "保存成功"
~~~

屏幕显示：

~~~text
保存成功
~~~

bind 适合一个组件对应一个变量。

### template：一段文字里放多个值

~~~yaml
- type: text
  template: "一共有 {{ count(data.tasks) }} 个任务"
~~~

template 适合：

- 标题。
- 状态描述。
- 帮助文字。
- 将多个变量拼成一句话。
- list 的 label 和 description。

## 2. 模板占位符

模板使用两个大括号：

~~~yaml
template: "用户：{{ data.user.name }}"
~~~

模板中的内容叫表达式，但它不是任意 JavaScript。

当前支持：

- 变量路径。
- if。
- count。
- length。
- upper。
- lower。
- default。
- 字符串、数字、true、false、null 字面量。

不支持：

~~~text
data.tasks.filter(...)
data.tasks.length > 0 && data.user.admin
user?.profile?.name
任意 JavaScript 函数
~~~

这样做是为了让页面文件保持可读、可检查、可预测。

## 3. 变量路径

最常用：

~~~yaml
- type: text
  template: "标题：{{ data.pageTitle }}"
~~~

嵌套对象：

~~~yaml
- type: text
  template: "用户：{{ data.user.name }}"
~~~

页面状态：

~~~yaml
- type: text
  template: "第 {{ state.selected }} 项"
~~~

页面参数：

~~~yaml
- type: text
  template: "正在编辑：{{ params.task.title }}"
~~~

列表 item：

~~~yaml
- type: list
  items: data.tasks
  label: "{{ item.title }}"
  description: "{{ item.detail }}"
~~~

按键变量：

~~~yaml
keys:
  character:
    - set:
        path: state.lastKey
        value:
          bind: key.value
~~~

## 4. count 和 length

统计数组：

~~~yaml
template: "任务数量：{{ count(data.tasks) }}"
~~~

length 与 count 等价：

~~~yaml
template: "任务数量：{{ length(data.tasks) }}"
~~~

统计字符串：

~~~yaml
template: "输入长度：{{ length(state.title) }}"
~~~

统计对象的字段数：

~~~yaml
template: "字段数量：{{ count(data.user) }}"
~~~

如果值不存在或不是数组、字符串、对象，结果会是 0。

## 5. if 函数

基本形式：

~~~yaml
template: "{{ if(条件, 条件为真时的文字, 条件为假时的文字) }}"
~~~

任务状态：

~~~yaml
template: "{{ if(item.done, '已完成', '未完成') }}"
~~~

勾选符号：

~~~yaml
label: "{{ if(item.done, '✓', '○') }} {{ item.title }}"
~~~

页面模式：

~~~yaml
template: "{{ if(params.mode, params.mode, 'view') }}"
~~~

if 的第一个参数会被当作条件：

- false、null、空字符串、0 会被当作假。
- true、非空字符串、对象、数组会被当作真。

## 6. upper、lower

~~~yaml
- type: text
  template: "{{ upper(data.user.name) }}"
~~~

~~~yaml
- type: text
  template: "{{ lower(data.user.name) }}"
~~~

它们主要适合：

- 将状态码转换为大写。
- 统一显示用户名。
- 展示简单的标签。

## 7. default

当值为空时提供默认值：

~~~yaml
- type: text
  template: "{{ default(params.task.detail, '暂无详情') }}"
~~~

如果 params.task.detail 有内容，则显示原内容；否则显示暂无详情。

也可以用于用户名：

~~~yaml
template: "欢迎，{{ default(data.user.name, '访客') }}"
~~~

## 8. bind 对象写法

除了简写：

~~~yaml
- type: text
  bind: data.user.name
~~~

还可以写成 value 对象：

~~~yaml
- type: text
  value:
    bind: data.user.name
~~~

在 action 参数中，value 对象写法非常常见：

~~~yaml
- append:
    path: state.title
    value:
      bind: key.value
~~~

这表示把当前按键中的字符读取出来，再追加到 state.title。

## 9. itemAt 取列表项目

从 data.tasks 取当前选中项目：

~~~yaml
itemAt:
  list: data.tasks
  index: state.selected
~~~

传给 detail：

~~~yaml
- push:
    page: detail
    params:
      task:
        itemAt:
          list: data.tasks
          index: state.selected
~~~

只取 ID：

~~~yaml
- push:
    page: detail
    params:
      taskId:
        itemAt:
          list: data.tasks
          index: state.selected
          key: id
~~~

## 10. trim

trim 去掉字符串首尾空格：

~~~yaml
- call: tasks.create
  with:
    title:
      trim:
        bind: state.title
~~~

也可以放在 append 中：

~~~yaml
- append:
    list: data.tasks
    value:
      title:
        trim:
          bind: state.title
      done: false
~~~

## 11. visible：条件显示组件

最简单的写法：

~~~yaml
- type: text
  bind: state.notice
  visible: state.notice
~~~

state.notice 为空时，整个 text 不参与布局；有内容时才显示。

非空判断：

~~~yaml
- type: text
  bind: state.error
  visible:
    notEmpty: state.error
  style: danger
~~~

空判断：

~~~yaml
visible:
  empty: state.loadingMessage
~~~

注意：visible 隐藏的是整个组件，不是把文字变成空字符串。对于需要保持位置的提示，可以使用 spacer 代替：

~~~yaml
- type: text
  bind: state.notice
  visible: state.notice

- type: spacer
  height: 1
~~~

如果你希望提示消失后仍然保留一行空间，可以把 text 和 spacer 放到 if 之外，或者始终渲染一个固定高度的布局。

## 12. equals：相等判断

equals 接受两个值：

~~~yaml
visible:
  equals:
    - bind: state.mode
    - edit
~~~

如果 state.mode 等于 edit，组件显示。

比较布尔值：

~~~yaml
style:
  when:
    equals:
      - bind: item.done
      - true
  value: muted
  else: ""
~~~

比较页面参数：

~~~yaml
visible:
  equals:
    - bind: params.mode
    - view
~~~

## 13. notEquals

~~~yaml
visible:
  notEquals:
    - bind: state.status
    - loading
~~~

它等价于“不是 loading”。

## 14. all、any、not

所有条件都满足：

~~~yaml
visible:
  all:
    - notEmpty: state.title
    - equals:
        - bind: state.mode
        - edit
~~~

任意一个条件满足：

~~~yaml
visible:
  any:
    - equals:
        - bind: state.status
        - error
    - equals:
        - bind: state.status
        - warning
~~~

取反：

~~~yaml
visible:
  not:
    empty: state.title
~~~

## 15. list 中的 item 条件

list 每一项都会创建临时上下文 item：

~~~yaml
- type: list
  items: data.tasks
  label: "{{ item.title }}"
  description: "{{ if(item.done, '已完成', '未完成') }}"
~~~

style 也可以使用当前 item：

~~~yaml
- type: list
  items: data.tasks
  label: "{{ item.title }}"
  style:
    when:
      equals:
        - bind: item.done
        - true
    value: muted
    else: ""
~~~

这不会修改 item，只决定该行怎么显示。

## 16. 常见错误

### 把普通文字误写成变量路径

错误：

~~~yaml
template: "{{ user.name }}"
~~~

正确：

~~~yaml
template: "{{ data.user.name }}"
~~~

### 把模板函数写成 JavaScript

错误：

~~~yaml
template: "{{ data.tasks.filter(task => task.done).length }}"
~~~

正确：

~~~yaml
template: "总数：{{ count(data.tasks) }}"
~~~

如果确实需要复杂统计，把统计逻辑放到 Node.js service 或预先准备一个 data 字段。

### 忘记 item 只在 list 项目中存在

下面写法通常是错误的：

~~~yaml
pages:
  home:
    layout:
      type: text
      template: "{{ item.title }}"
~~~

item 只在 list 的 label、description、style 条件中有意义。页面普通 layout 应使用 data、state 或 params。

## 17. 调试模板

如果模板为空，先改成固定文字，确认组件本身显示：

~~~yaml
- type: text
  value: "固定文字"
~~~

再确认根路径：

~~~yaml
- type: text
  template: "data.tasks = {{ count(data.tasks) }}"
~~~

再确认嵌套路径：

~~~yaml
- type: text
  template: "标题 = {{ data.tasks[0].title }}"
~~~

最后再加入 if 或 default。一次只增加一个变量层级，最容易找到问题。
