# 05：按键与动作

layout 决定页面长什么样，keys 决定页面怎么动。

## 1. keys 的基本结构

~~~yaml
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
~~~

左边是按键名，右边是动作列表。

一个按键可以执行多个动作：

~~~yaml
keys:
  d:
    - remove:
        list: data.tasks
        index: state.selected
    - set:
        path: state.notice
        value: "删除成功"
~~~

动作按照 YAML 中的顺序执行。

## 2. 动作是对象

标准写法：

~~~yaml
- set:
    path: state.notice
    value: "保存成功"
~~~

最简单的无参数动作可以缩写：

~~~yaml
- pop
~~~

下面两种写法等价：

~~~yaml
- pop
~~~

~~~yaml
- pop: {}
~~~

为了让初学者容易读，推荐使用第一种。

## 3. set：设置变量

设置一个变量：

~~~yaml
- set:
    path: state.notice
    value: "操作成功"
~~~

设置为另一个变量：

~~~yaml
- set:
    path: state.lastTitle
    value:
      bind: state.title
~~~

设置为模板结果：

~~~yaml
- set:
    path: state.notice
    value:
      template: "当前是第 {{ state.selected }} 项"
~~~

一次设置多个变量：

~~~yaml
- set:
    state.loading: false
    state.error: ""
~~~

set 可以修改：

- data.x
- state.x
- params.x
- env.NAME：当前应用进程启动的外部命令会继承的环境变量

`env` 只影响当前 Page TUI 进程及其后续启动的子进程，不会修改启动它的父 Shell。需要让
`cfdisk`、`timedatectl` 等后续外部程序使用新的语言时，可以这样写：

~~~yaml
- set:
    path: env.LANG
    value: { bind: data.system.lang }
- set:
    path: env.LC_ALL
    value: { bind: data.system.lang }
~~~

不应该尝试修改 app.x 或 key.x。

## 4. move：移动数字选择

move 适合列表选择器：

~~~yaml
- move:
    path: state.selected
    by: 1
    list: data.tasks
~~~

向上移动：

~~~yaml
- move:
    path: state.selected
    by: -1
    list: data.tasks
~~~

move 会自动限制范围：

~~~text
最小值：0
最大值：data.tasks.length - 1
~~~

如果列表为空，最大值按 0 处理。

为什么需要 list：

~~~yaml
list: data.tasks
~~~

因为框架需要知道当前可选项目的数量。不要手动写 max，数据变化后容易越界。

## 5. toggle：切换布尔值

直接切换一个路径：

~~~yaml
- toggle:
    path: state.enabled
~~~

切换列表项目中的字段：

~~~yaml
- toggle:
    list: data.tasks
    index: state.selected
    field: done
~~~

这表示：

~~~text
找到 data.tasks[state.selected]
把它的 done 从 true 改成 false，或从 false 改成 true
~~~

## 6. remove：删除数组项目

~~~yaml
- remove:
    list: data.tasks
    index: state.selected
~~~

remove 只负责删除，不会自动把 selected 调整到合法范围。推荐删除后补一个 move：

~~~yaml
keys:
  d:
    - remove:
        list: data.tasks
        index: state.selected
    - move:
        path: state.selected
        by: 0
        list: data.tasks
~~~

move by 0 的作用是重新按照数组长度夹紧 selected。

再显示提示：

~~~yaml
    - set:
        path: state.notice
        value: "已删除当前任务"
~~~

## 7. append：追加字符串或数组项目

### 追加字符串

输入页：

~~~yaml
- append:
    path: state.title
    value:
      bind: key.value
~~~

也可以追加固定字符串：

~~~yaml
- append:
    path: state.title
    value: "!"
~~~

### 追加数组项目

~~~yaml
- append:
    list: data.tasks
    value:
      title:
        trim:
          bind: state.title
      done: false
      detail: "由输入页创建"
~~~

append 会把 value 解析后再添加，因此 value 中可以使用 bind、template、itemAt 和嵌套对象。

## 8. backspace：删除字符串末尾字符

~~~yaml
- backspace:
    path: state.title
~~~

它按 Unicode 字符删除，不是简单地删除一个 UTF-16 code unit，所以中文、emoji 等字符不会被拆坏。

backspace 只删除末尾字符，不支持移动到中间再删除。

## 9. push、go：打开新页面

push：

~~~yaml
- push:
    page: detail
    params:
      taskId:
        bind: state.selectedTaskId
~~~

go 是 push 的别名：

~~~yaml
- go:
    page: detail
~~~

页面必须存在于 manifest 的 pages 中。`page` 或 `route` 也可以写成变量绑定或模板，运行时会先求值再跳转。

## 10. replace：替换当前页面

~~~yaml
- replace:
    page: login
~~~

假设当前栈是：

~~~text
home → settings
~~~

replace settings 后：

~~~text
home → login
~~~

按 Esc 会返回 home，而不会回到 settings。

适合：

- 登录页替换过期页。
- 保存后替换为结果页。
- 不希望用户返回旧页面的流程。

## 11. reset：清空页面历史

~~~yaml
- reset:
    page: home
~~~

无论当前页面栈是什么：

~~~text
home → detail → edit
~~~

reset 后变成：

~~~text
home
~~~

适合：

- 退出登录。
- 完成一次完整流程后回到根页面。
- 清除不再有效的历史页面。

谨慎使用 reset，因为它会丢失返回历史。

## 12. pop：返回上一页

最简单：

~~~yaml
- pop
~~~

携带结果：

~~~yaml
- pop:
    result:
      saved: true
      id:
        bind: state.id
~~~

父页面可以通过 PageManager 的 onResume 在高级 API 中接收 result；声明式页面最常见的用法是直接修改 data，再 pop 返回。

## 13. quit：退出应用

~~~yaml
- quit
~~~

指定退出码：

~~~yaml
- quit:
    code: 1
~~~

普通用户退出建议使用默认 q，不必在每一个页面都配置 quit。

## 14. if：条件执行动作

基本结构：

~~~yaml
- if:
    condition:
      notEmpty: state.title
    then:
      - set:
          path: state.error
          value: ""
    else:
      - set:
          path: state.error
          value: "标题不能为空"
~~~

condition 支持：

- 直接路径，例如 state.title。
- notEmpty。
- empty。
- equals。
- notEquals。
- all。
- any。
- not。
- truthy。

### all

~~~yaml
- if:
    condition:
      all:
        - notEmpty: state.title
        - equals:
            - bind: state.mode
            - edit
    then:
      - set:
          path: state.notice
          value: "可以保存"
~~~

## 15. call：调用 service 或外部 sh

~~~yaml
- call: tasks.save
  with:
    task:
      bind: state.task
~~~

上面这种写法会调用 Node.js 启动器传入的 services 中已有名称。

service 的详细说明见 [07 - Service 与 Node.js 业务代码](./07-services.md)。

也可以直接调用外部 shell 命令。默认会阻塞等待命令结束。只要配置了输出字段或回调，框架就会自动捕获 stdout 和 stderr：

~~~yaml
- call:
    sh: "printf hello"
    result: state.lastCall
~~~

`state.lastCall` 会得到类似这样的对象：

~~~json
{"ok":true,"running":false,"code":0,"signal":null,"pid":123,"stdout":"hello","stderr":"","stdoutLines":["hello"],"stderrLines":[],"error":null}
~~~

### 把命令输出写入页面变量

`call` 可以同时写入多种形式的结果：

~~~yaml
- call:
    sh: "printf 'first\\nsecond\\n'"
    stdout: state.rawOutput
    stderr: state.rawError
    lines: state.logs
    stderrLines: state.errorLogs
    code: state.exitCode
    result: state.process
~~~

- stdout、stderr：完整字符串。
- lines、stderrLines：按行拆分后的数组，可以直接给 list 的 items 使用。
- code：退出码；进程尚未结束时是 null。
- result：完整结果对象。非阻塞命令运行时会持续更新，结束后 running 变为 false。

如果 stdout 是完整 JSON，可以直接解析到变量：

~~~yaml
- call:
    command: node
    args: ["scripts/list-packages.js"]
    json: state.packages

layout:
  type: list
  items: state.packages
  selected: state.selected
  label: "{{ item.name }}"
~~~

stdout 必须只包含一个有效 JSON 值。解析失败时目标变量为 null，错误信息保存在 result.jsonError 中。

如果需要直接执行命令而不是交给 shell 解析，使用 `command` 和 `args`：

~~~yaml
- call:
    command: node
    args: ["scripts/build.js"]
    wait: false
    lines: state.logs
    result: state.process
~~~

`wait: false` 或 `blocking: false` 会启动后台进程后立刻返回。配置 lines、stdout、json、result、onLine 或 onExit 时会自动使用管道捕获输出；完全不需要输出时默认使用 `stdio: ignore`。显式设置 `stdio: inherit` 会让子进程直接接管当前终端，因此无法再捕获输出。

### 逐行处理与结束回调

`onLine` 在 stdout 或 stderr 产生一条完整日志时执行。当前行可从 key.value 读取，来源可从 key.stream 读取：

~~~yaml
- call:
    command: ./install.sh
    wait: false
    lines: state.logs
    result: state.install
    onLine:
      - set:
          path: state.progress
          value:
            bind: key.value
    onExit:
      - replace:
          page: result
          params:
            code:
              bind: key.code
~~~

`onExit` 在进程结束且结果变量完成更新后执行。可读取 key.code、key.signal 和 key.result，也可以在这里 push、replace 或 reset 到指定页面。

非阻塞 call 外层的 then 会在进程成功启动后立即执行；需要等待命令结束的动作应放在 onExit 中。

## 16. refresh：执行数据刷新回调

~~~yaml
- refresh
~~~

如果启动器传入 refresh 函数，框架会调用它：

~~~js
createDeclarativeApp({
  manifest: "./ui/app.yaml",
  refresh: async ({ runtime }) => {
    runtime.data.tasks = await loadTasks();
  }
});
~~~

当前 refresh 是一个显式动作，不会自动调用网络请求。

## 17. notify：设置 state.notice

~~~yaml
- notify: "保存成功"
~~~

notify 等价于：

~~~yaml
- set:
    path: state.notice
    value: "保存成功"
~~~

如果你的页面使用的不是 state.notice，直接使用 set 更清楚。

## 18. then：动作完成后继续执行

部分动作可以附带 then：

~~~yaml
- set:
    path: state.loading
    value: false
  then:
    - set:
        path: state.notice
        value: "加载完成"
~~~

更推荐把动作拆成数组，因为执行顺序更明显：

~~~yaml
- set:
    path: state.loading
    value: false
- set:
    path: state.notice
    value: "加载完成"
~~~

## 19. character：处理普通字符

如果需要做文本输入：

~~~yaml
keys:
  character:
    - append:
        path: state.title
        value:
          bind: key.value
~~~

character 是兜底规则：

- 如果 keys 中存在具体的 n，则按 n 规则处理。
- 如果没有具体规则，且 key 是单个字符，则使用 character。
- 因此，具体按键会优先于 character。

例如：

~~~yaml
keys:
  n:
    - push:
        page: create

  character:
    - append:
        path: state.search
        value:
          bind: key.value
~~~

按 n 时打开 create，不会把 n 写入搜索框。

## 20. 默认按键

如果当前页面没有配置对应 keys：

- q：退出。
- Esc：返回上一页；如果当前是根页面，则退出。
- Ctrl+C：退出，退出码为 130。

如果页面配置了 escape 或 q，它会覆盖对应默认行为。

## 21. 动作设计建议

好的动作：

~~~yaml
keys:
  enter:
    - if:
        condition:
          notEmpty: state.title
        then:
          - append:
              list: data.tasks
              value:
                title:
                  trim:
                    bind: state.title
                done: false
          - pop
        else:
          - set:
              path: state.error
              value: "请输入标题"
~~~

不好的动作：

- 一个按键塞几十个互相无关的动作。
- 用多个 set 模拟复杂业务规则。
- 在 YAML 中重复实现权限、金额、事务等业务逻辑。
- 依赖当前数组下标作为永久 ID。
- 删除后不调整 selected。
- service 和 YAML 同时修改同一个字段，导致谁覆盖谁不清楚。

复杂逻辑放 service，页面动作只负责流程编排。
