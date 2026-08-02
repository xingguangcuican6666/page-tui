# 11：常见问题与排错

排错时不要一次改很多地方。先确定问题属于哪一层：

~~~text
1. 文件加载
2. YAML 解析
3. 页面注册
4. 变量读取
5. layout 编译
6. key 匹配
7. action 执行
8. 页面栈
9. service
10. terminal / renderer
~~~

## 1. 最小排错原则

先把页面缩到最小：

~~~yaml
initial: home

pages:
  home:
    layout:
      type: text
      value: "页面能显示"
~~~

如果这个页面都不能启动，问题不在变量和动作，而在：

- 启动器。
- manifest 路径。
- YAML 语法。
- 依赖安装。
- Node.js 版本。

如果最小页面能启动，再逐步添加：

1. data。
2. state。
3. 模板。
4. layout 组件。
5. keys。
6. action。
7. service。

## 2. Cannot find module yaml

错误：

~~~text
Error: Cannot find module 'yaml'
~~~

解决：

~~~bash
npm install
~~~

如果仍然失败：

~~~bash
rm -rf node_modules
npm install
~~~

Windows PowerShell：

~~~powershell
Remove-Item -Recurse -Force node_modules
npm install
~~~

确认 package.json 中有：

~~~json
"dependencies": {
  "yaml": "^2.8.1"
}
~~~

## 3. manifest 文件找不到

错误通常类似：

~~~text
ENOENT: no such file or directory
~~~

启动器：

~~~js
createDeclarativeApp({
  manifest: "./ui/app.yaml"
});
~~~

相对路径是相对于 Node.js 当前工作目录，而不是一定相对于启动文件。

最稳定的写法：

~~~js
const path = require("node:path");

createDeclarativeApp({
  manifest: path.join(__dirname, "ui", "app.yaml")
});
~~~

运行时检查当前目录：

~~~js
console.log(process.cwd());
~~~

## 4. YAML 解析错误

常见原因：

- 缩进错误。
- Tab 和空格混用。
- 冒号后面没有正确空格。
- 字符串包含特殊字符但没有引号。
- 列表项少了短横线。
- 引号没有闭合。

错误示例：

~~~yaml
data:
  title:测试
~~~

推荐：

~~~yaml
data:
  title: "测试"
~~~

错误示例：

~~~yaml
children:
  - type: text
    value: "第一行"
   - type: text
     value: "第二行"
~~~

第二个列表项缩进不一致。

正确：

~~~yaml
children:
  - type: text
    value: "第一行"
  - type: text
    value: "第二行"
~~~

建议编辑器：

- 开启显示空格和 Tab。
- 设置 YAML 缩进为 2 个空格。
- 保存为 UTF-8。
- 不要从富文本编辑器复制带格式文本。

## 5. 页面名称找不到

错误：

~~~text
Unknown page route: detail
~~~

检查 manifest：

~~~yaml
pages:
  detail:
    layout:
      type: text
      value: "详情"
~~~

检查 push：

~~~yaml
- push:
    page: detail
~~~

page 名称必须完全相同：

~~~text
detail != Detail
detail != details
detail != " detail"
~~~

如果 pages 使用独立文件：

~~~yaml
pages:
  detail: pages/detail.yaml
~~~

请确认：

- 文件确实存在。
- 路径相对于 manifest 文件目录。
- 文件内容是一个页面对象。
- 文件不是一个完整的 manifest。

## 6. 页面空白

最小检查：

~~~yaml
pages:
  home:
    layout:
      type: text
      value: "固定文字"
~~~

如果固定文字显示，再检查 bind：

~~~yaml
layout:
  type: text
  bind: data.message
~~~

如果 bind 为空，检查 data：

~~~yaml
data:
  message: "有内容"
~~~

如果 layout 使用 visible：

~~~yaml
visible: state.show
~~~

当 state.show 是 false、空字符串、0 或 null 时，整个组件会被隐藏。

## 7. 模板显示为空

错误：

~~~yaml
template: "标题：{{ task.title }}"
~~~

正确：

~~~yaml
template: "标题：{{ data.task.title }}"
~~~

list 中才可以使用 item：

~~~yaml
- type: list
  items: data.tasks
  label: "{{ item.title }}"
~~~

详情页面使用 params：

~~~yaml
template: "标题：{{ params.task.title }}"
~~~

输入页使用 state：

~~~yaml
template: "输入：{{ state.title }}"
~~~

逐级排查：

~~~yaml
- type: text
  template: "data 是否存在：{{ count(data.tasks) }}"

- type: text
  template: "selected：{{ state.selected }}"

- type: text
  template: "task：{{ params.task.title }}"
~~~

## 8. count 返回 0

count 支持：

- 数组。
- 字符串。
- 对象。

~~~yaml
{{ count(data.tasks) }}
{{ count(state.title) }}
{{ count(data.user) }}
~~~

如果返回 0，检查路径是否存在：

~~~yaml
- type: text
  template: "值：{{ data.tasks }}"
~~~

还要确认 data.tasks 确实是数组，而不是字符串：

~~~yaml
data:
  tasks:
    - title: "第一项"
~~~

## 9. list 没有项目

检查 items：

~~~yaml
- type: list
  items: data.tasks
~~~

data.tasks 必须是数组：

~~~yaml
data:
  tasks: []
~~~

如果 items 写成：

~~~yaml
items: data.task
~~~

而真实字段是 tasks，list 会显示 emptyText。

建议加：

~~~yaml
emptyText: "没有任务"
~~~

## 10. list 选中位置越界

selected 从 0 开始：

~~~text
第一项：0
第二项：1
第三项：2
~~~

初始值：

~~~yaml
state:
  selected: 0
~~~

向下移动：

~~~yaml
- move:
    path: state.selected
    by: 1
    list: data.tasks
~~~

删除后建议重新夹紧：

~~~yaml
- remove:
    list: data.tasks
    index: state.selected
- move:
    path: state.selected
    by: 0
    list: data.tasks
~~~

## 11. 按键没有反应

先确认 key 名称：

~~~yaml
keys:
  n:
    - set:
        path: state.notice
        value: "收到 n"
~~~

普通字母按键使用字符本身：

~~~yaml
keys:
  a:
    - set:
        path: state.notice
        value: "收到 a"
~~~

方向键使用：

~~~yaml
up:
down:
left:
right:
~~~

特殊键：

~~~yaml
enter:
escape:
backspace:
space:
character:
~~~

如果配置了 character：

~~~yaml
keys:
  character:
    - append:
        path: state.title
        value:
          bind: key.value
~~~

具体键配置优先于 character。

## 12. Esc 没有返回

App 只有在页面没有处理 escape 时才使用默认返回。

最简单的显式写法：

~~~yaml
keys:
  escape:
    - pop
~~~

如果写了：

~~~yaml
keys:
  escape:
    - set:
        path: state.notice
        value: "不能返回"
~~~

那就不会自动 pop，因为页面已经处理了 escape。

## 13. action 格式错误

错误：

~~~text
动作格式无效。请使用 set、move、toggle、push、pop 等内置动作。
~~~

检查 action 是否是对象或简单动作名称：

正确：

~~~yaml
- pop
~~~

~~~yaml
- set:
    path: state.notice
    value: "成功"
~~~

错误：

~~~yaml
- action: pop
~~~

当前解释器不认识 action 这个名称。

## 14. set 不生效

set 的 path 必须是可写根：

~~~yaml
- set:
    path: state.notice
    value: "成功"
~~~

可写：

- data。
- state。
- params。

不可写：

- key。
- item。
- terminal。
- renderer。

如果路径中间不存在，writePath 会创建对象，但根必须已经存在。

## 15. append 报错

数组追加：

~~~yaml
- append:
    list: data.tasks
    value:
      title: "新任务"
~~~

字符串追加：

~~~yaml
- append:
    path: state.title
    value:
      bind: key.value
~~~

不要把数组写成 path，也不要把字符串写成 list。

## 16. if 条件不符合预期

最简单的条件：

~~~yaml
condition: state.title
~~~

非空时为真。

非空判断：

~~~yaml
condition:
  notEmpty: state.title
~~~

相等判断：

~~~yaml
condition:
  equals:
    - bind: state.mode
    - edit
~~~

注意第一个动态值最好使用 bind，第二个固定值可以直接写字符串。

## 17. service 没有注册

错误：

~~~text
没有注册名为 tasks.save 的 service。
~~~

启动器：

~~~js
createDeclarativeApp({
  manifest: "./ui/app.yaml",
  services: {
    "tasks.save": async ({ task }) => {
      // 保存
    }
  }
});
~~~

YAML 名称必须完全一致：

~~~yaml
- call: tasks.save
~~~

下面这些都不是同一个名字：

~~~text
tasks.save
tasks-save
Tasks.save
task.save
~~~

## 18. service 参数为空

YAML：

~~~yaml
- call: tasks.save
  with:
    id:
      bind: params.taskId
~~~

Node.js：

~~~js
"tasks.save": ({ id }) => {
  console.log(id);
}
~~~

如果 id 是 undefined，先显示它：

~~~yaml
- set:
    path: state.notice
    value:
      template: "id={{ params.taskId }}"
~~~

再检查 params 是否在 push 时传入。

## 19. service 报错后页面显示错误面板

这是 App 的默认错误处理。

建议：

- 查看错误面板中的第一行 message。
- 查看启动终端的 stack。
- 在 service 内对参数做清晰校验。
- 不要吞掉错误后继续执行后续 action。
- 生产环境不要把敏感数据放入 error.message。

可以提供 onError：

~~~js
createDeclarativeApp({
  manifest: "./ui/app.yaml",
  onError: (error) => {
    console.error("[page-tui]", error);
  }
});
~~~

## 20. 页面布局被截断

原因通常是：

- 终端高度不足。
- 固定内容太多。
- panel padding 太大。
- 每一层都加了 flex 或 gap。
- text 长文本换行后高度增加。

排查方式：

1. 删除多余 padding。
2. 暂时删除 gap。
3. 给主 panel 加 flex。
4. 减少固定提示。
5. 在更高的终端中运行。

## 21. 边框破坏或宽度不齐

检查：

- 是否在 row 中放了过宽的固定内容。
- 是否使用了非常宽的 emoji。
- 是否把 ANSI 转义字符直接写进 value。
- 是否有没有闭合的 Unicode 字符。
- 是否在很窄的终端中运行。

text 和 list 已经对中文宽度做了处理，但自定义 renderer 需要自己处理 string width。

## 22. 颜色不显示

可能原因：

- 输出被重定向，不是 TTY。
- color 选项被设置为 false。
- 终端不支持 ANSI。
- 使用了不存在的主题名。

测试颜色：

~~~js
createDeclarativeApp({
  manifest: "./ui/app.yaml",
  color: true
});
~~~

非 TTY 输出会自动关闭颜色，便于测试和日志处理。

## 23. 终端光标没有恢复

正常退出会执行：

- 关闭 raw mode。
- 显示光标。
- 离开 alternate screen。
- 恢复终端输出。

如果 Node.js 被强制 kill，清理代码可能来不及执行。重新打开一个终端通常即可恢复。

## 24. 调试顺序清单

遇到任何问题，可以按这个顺序：

~~~text
[ ] npm install 是否成功
[ ] node --version 是否 >= 18
[ ] manifest 路径是否正确
[ ] YAML 是否能解析
[ ] initial 页面是否存在
[ ] 最小 text 页面是否显示
[ ] data/state/params 路径是否正确
[ ] visible 是否把组件隐藏
[ ] key 名称是否正确
[ ] action 名称是否正确
[ ] action 参数路径是否正确
[ ] service 是否注册
[ ] terminal 是否是真实 TTY
[ ] npm test 是否通过
~~~

## 25. 提交问题时提供什么

如果需要别人帮忙排错，最好提供：

1. Node.js 版本。
2. 操作系统。
3. 最小 manifest。
4. 启动器代码。
5. 完整错误消息。
6. 触发错误的按键。
7. npm test 输出。
8. 是否在真实 TTY 中运行。

不要只说“页面不工作”，要说明哪一步不工作。
