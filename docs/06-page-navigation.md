# 06：页面跳转与页面栈

页面管理是 Page TUI 的核心能力之一。

## 1. 页面定义

manifest 的 pages 是页面注册表：

~~~yaml
initial: home

pages:
  home:
    layout:
      type: text
      value: "首页"

  detail:
    layout:
      type: text
      value: "详情页"

  settings:
    layout:
      type: text
      value: "设置页"
~~~

页面名称就是 push、replace、reset 中使用的 page 名称。

## 2. initial：启动页

~~~yaml
initial: home
~~~

应用启动时会打开 pages.home。

如果不写 initial，框架使用 pages 中的第一个页面：

~~~yaml
pages:
  home:
    ...
~~~

虽然可以省略，但正式项目建议明确写 initial，避免后来调整页面顺序后启动页变化。

## 3. 页面栈的视觉模型

把页面栈想成一摞纸：

~~~text
最下面：home
上面：detail
最上面：edit
~~~

用户只看得到最上面的页面。

当前栈：

~~~text
[home, detail, edit]
~~~

当前页面是 edit。

按 Esc：

~~~text
[home, detail]
~~~

当前页面变成 detail。

再次按 Esc：

~~~text
[home]
~~~

当前页面变成 home。

## 4. push：进入子页面

~~~yaml
keys:
  enter:
    - push:
        page: detail
~~~

执行后：

~~~text
home → detail
~~~

push 不会销毁 home。home 仍然留在栈中，返回时会恢复它。

### push 参数

~~~yaml
- push:
    page: detail
    params:
      task:
        itemAt:
          list: data.tasks
          index: state.selected
~~~

detail 读取：

~~~yaml
template: "当前任务：{{ params.task.title }}"
~~~

### push 固定参数

~~~yaml
- push:
    page: settings
    params:
      section: account
      readonly: false
~~~

settings 读取：

~~~yaml
template: "当前分区：{{ params.section }}"
~~~

## 5. pop：返回上一页

~~~yaml
keys:
  escape:
    - pop
~~~

pop 会：

1. 离开当前页面。
2. 从栈顶移除当前页面。
3. 恢复上一页。
4. 触发上一页重新渲染。

### pop 结果

~~~yaml
- pop:
    result:
      saved: true
      id:
        bind: state.id
~~~

结果主要用于底层 Page API 的 onResume。声明式页面通常直接修改 data 后 pop 返回：

~~~yaml
- toggle:
    path: params.task.done
- pop
~~~

因为 params.task 通常指向 data.tasks 中的同一个对象，返回后 home 会看到最新状态。

## 6. replace：替换当前页面

~~~yaml
- replace:
    page: success
    params:
      message: "保存成功"
~~~

假设原栈：

~~~text
home → edit
~~~

replace 后：

~~~text
home → success
~~~

success 按 Esc 会回到 home，不会回到 edit。

适合不可重复返回的流程：

~~~text
登录页 → 登录成功页
支付确认页 → 支付结果页
过期页面 → 登录页
~~~

## 7. reset：重置整个栈

~~~yaml
- reset:
    page: home
~~~

无论当前是：

~~~text
home → settings → account → password
~~~

reset 后都是：

~~~text
home
~~~

适合：

- 用户退出登录。
- 清空向导流程。
- 完成订单后回到首页。
- 权限变化后丢弃旧页面。

reset 是破坏历史的操作，普通返回不要使用 reset。

## 8. go：push 的别名

~~~yaml
- go:
    page: detail
~~~

go 和 push 行为相同。建议同一个项目只选一个写法：

- 想表达“增加一层页面”，用 push。
- 想表达“去某个页面”，用 go。

## 9. 默认返回规则

如果当前页面没有定义 escape：

- 当前栈有多个页面：pop。
- 当前栈只有根页面：退出应用。

因此最简单的页面不需要写：

~~~yaml
keys:
  escape:
    - pop
~~~

除非你希望自定义返回逻辑。

## 10. 页面生命周期

底层 PageManager 会触发以下生命周期：

### push

~~~text
旧页面 onBlur
新页面 onEnter
新页面 onFocus
~~~

### pop

~~~text
当前页面 onBlur
当前页面 onLeave
上一页面 onResume
上一页面 onFocus
~~~

### replace

~~~text
旧页面 onBlur
旧页面 onLeave
新页面 onEnter
新页面 onFocus
~~~

### reset

当前页面先离开，然后新根页面进入。

声明式页面可以配置 enter 和 resume 动作：

~~~yaml
on:
  enter:
    - set:
        path: state.notice
        value: "页面已进入"

  resume:
    - set:
        path: state.notice
        value: "从子页面返回"
~~~

## 11. on.enter：进入时执行动作

~~~yaml
pages:
  detail:
    state:
      loaded: false

    on:
      enter:
        - set:
            path: state.loaded
            value: true
~~~

进入页面时，params 已经可用：

~~~yaml
on:
  enter:
    - set:
        path: state.title
        value:
          bind: params.task.title
~~~

如果进入动作调用 service：

~~~yaml
on:
  enter:
    - call: tasks.load
      with:
        id:
          bind: params.taskId
~~~

## 12. on.resume：从子页面返回时执行

~~~yaml
pages:
  home:
    state:
      notice: ""

    on:
      resume:
        - set:
            path: state.notice
            value: "子页面已返回"
~~~

当前实现会把 pop 的 result 放在生命周期上下文中，复杂的 result 读取适合使用底层 Page API 或直接修改 data。

## 13. 多层页面示例

~~~yaml
pages:
  home:
    keys:
      enter:
        - push:
            page: settings

  settings:
    keys:
      enter:
        - push:
            page: account

  account:
    keys:
      enter:
        - push:
            page: profile
~~~

导航过程：

~~~text
home
home → settings
home → settings → account
home → settings → account → profile
~~~

profile 按 Esc 会逐层返回。

## 14. 页面 state 和页面实例

同一个 route 可以被多次 push。每次 push 都会创建新的 DeclarativePage 实例，因此 state 是独立的。

例如：

~~~yaml
pages:
  search:
    state:
      keyword: ""
~~~

如果从不同页面多次打开 search，每个页面实例都有自己的 keyword。

data 则仍然是共享的。

## 15. 防止页面参数过期

不推荐长期保存一个可变对象引用：

~~~yaml
params:
  task:
    itemAt:
      list: data.tasks
      index: state.selected
~~~

如果 data.tasks 在其他地方删除或排序，params.task 可能不再符合当前列表位置。

大型项目更稳定的做法：

~~~yaml
params:
  taskId:
    itemAt:
      list: data.tasks
      index: state.selected
      key: id
~~~

然后使用 service 根据 taskId 读取或更新任务。

## 16. 设计导航 API 的规则

推荐：

- 临时详情页使用 push。
- 编辑页保存后使用 pop。
- 登录成功后使用 replace 或 reset。
- 退出登录使用 reset。
- 正常返回使用 pop。
- 不要用 reset 模拟普通返回。
- 不要把所有页面都做成 replace，否则用户无法回到上一级。

## 17. 导航排错

### push 后页面空白

检查：

- page 名称是否与 pages 下的 key 完全一致。
- page 定义是否有 layout。
- params 路径是否拼写正确。
- detail 是否读取了不存在的 params。

### Esc 没有返回

检查：

- 当前页面是否配置了 escape 动作。
- escape 动作是否写成了字符串 pop 或对象 pop。
- 是否误用了 reset。
- 当前是否已经在根页面。

### 返回后列表状态不对

检查：

- selected 是否在 state 中。
- 删除后是否用 move by 0 重新夹紧。
- 是否把列表放在 state 和 data 两处，导致修改了错误的数据。
- 是否传递了对象引用，还是传递了 ID。

## 18. 下一步

- [05 - 按键与动作](./05-actions.md)
- [07 - Service 与 Node.js 业务代码](./07-services.md)
- [10 - 内部架构](./10-architecture.md)
