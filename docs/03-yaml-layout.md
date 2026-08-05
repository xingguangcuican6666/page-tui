# 03：YAML 页面布局

本章只讲一个问题：

> 如何只看 YAML，就能知道屏幕会长什么样？

答案是：把 layout 当成一棵从上到下、从外到内的树。

## 1. 最小布局

~~~yaml
layout:
  type: text
  value: "你好"
~~~

布局节点通常包含：

- type：组件类型。
- value、template 或 bind：显示内容。
- children：子组件列表。
- child：单个子组件。
- 样式和尺寸选项。

## 2. column：垂直排列

column 是最常用的布局。

~~~yaml
layout:
  type: column
  children:
    - type: text
      value: "第一行"

    - type: text
      value: "第二行"

    - type: text
      value: "第三行"
~~~

屏幕效果：

~~~text
第一行
第二行
第三行
~~~

children 的顺序就是显示顺序。

### column 的 padding

~~~yaml
layout:
  type: column
  padding: 1
~~~

表示四周都留 1 个字符的空间。

两项写法：

~~~yaml
padding: [1, 2]
~~~

含义是：

~~~text
上下 1
左右 2
~~~

四项写法：

~~~yaml
padding: [上, 右, 下, 左]
~~~

例如：

~~~yaml
padding: [1, 2, 0, 2]
~~~

表示：

- 上：1
- 右：2
- 下：0
- 左：2

### column 的 gap

~~~yaml
layout:
  type: column
  gap: 1
  children:
    - type: text
      value: "标题"

    - type: text
      value: "内容"

    - type: text
      value: "底部"
~~~

gap: 1 会在相邻 children 之间增加一行空白。

## 3. row：水平排列

row 把子组件放在同一行：

~~~yaml
layout:
  type: row
  gap: 2
  children:
    - type: text
      value: "左边"

    - type: text
      value: "右边"
~~~

row 适合：

- 简单的左右信息。
- 状态标签。
- 顶部标题和计数。
- 两个并列面板。

示例：

~~~yaml
- type: row
  children:
    - type: text
      value: "任务"
    - type: text
      value: "3/10"
      style: muted
~~~

## 4. 嵌套布局

column、row 可以互相嵌套：

~~~yaml
layout:
  type: column
  children:
    - type: text
      value: "页面标题"
      style: title

    - type: row
      gap: 2
      children:
        - type: panel
          title: "左侧"
          flex: true
          child:
            type: text
            value: "左侧内容"

        - type: panel
          title: "右侧"
          flex: true
          child:
            type: text
            value: "右侧内容"
~~~

读这个结构的方式：

~~~text
最外层 column
├── 标题 text
└── row
    ├── 左侧 panel
    │   └── text
    └── 右侧 panel
        └── text
~~~

## 5. flex：占用剩余空间

flex: true 表示这个组件尽量占用父布局中的剩余空间。

最常见的用法：

~~~yaml
layout:
  type: column
  children:
    - type: text
      value: "固定高度的标题"

    - type: panel
      flex: true
      child:
        type: list
        items: data.tasks
~~~

这里：

- 标题占自己的高度。
- panel 占剩余高度。
- list 在 panel 中显示。
- 终端变高时，panel 也会变高。

多个 flex 子项会大致平均分配剩余空间：

~~~yaml
type: column
children:
  - type: panel
    flex: true
  - type: panel
    flex: true
~~~

### flex 的限制

flex 只在父组件是 column 或 row 时有明确效果。

推荐：

- 在 column 中给主要内容 panel 设置 flex。
- 在 panel 内让 list 使用可用高度。
- 不要给每一个 text 都写 flex。
- 固定页脚不要写 flex。

## 6. text：文本

最简单：

~~~yaml
- type: text
  value: "固定文字"
~~~

使用模板：

~~~yaml
- type: text
  template: "当前用户：{{ data.user.name }}"
~~~

绑定一个值：

~~~yaml
- type: text
  bind: state.notice
~~~

常用选项：

~~~yaml
- type: text
  value: "重要提示"
  style: title
  padding: [1, 0, 0, 0]
~~~

text 会根据终端宽度自动换行。

## 7. input：单行输入显示

input 是一个简单的单行文本输入视图。它不会自己保存数据，必须绑定到一个可写变量：

~~~yaml
state:
  title: ""

layout:
  type: input
  bind: state.title
  placeholder: "请输入标题"
~~~

默认会显示光标符号 ▌。

关闭光标：

~~~yaml
- type: input
  bind: state.title
  cursor: false
~~~

默认会自动接收普通字符和 backspace。只有需要自定义按键行为时，才在 keys 中显式定义：

~~~yaml
keys:
  character:
    - append:
        path: state.title
        value:
          bind: key.value

  backspace:
    - backspace:
        path: state.title
~~~

input 当前是单行输入，支持追加字符和删除末尾字符。它不负责：

- 鼠标操作。
- Home、End 移动。
- 光标中间插入。
- 多行文本。
- 自动校验。
- 保存到数据库。

这些行为可以通过自定义 action 或底层 JS API 扩展。

## 8. panel：边框容器

### popup：居中弹窗

popup 和 panel 很像，但它会在当前布局区域里居中显示，适合提示、确认和简单表单：

~~~yaml
- type: popup
  title: "提示"
  width: 40
  height: 8
  message: "确定继续吗？"
~~~

也可以像 panel 一样放 child 或 children。

~~~yaml
- type: panel
  title: "任务"
  child:
    type: text
    value: "面板内容"
~~~

panel 可以包住任何组件：

~~~yaml
- type: panel
  title: "任务列表"
  flex: true
  child:
    type: list
    items: data.tasks
~~~

### panel 的 children 简写

如果不想写 child，也可以直接写 children：

~~~yaml
- type: panel
  title: "详情"
  children:
    - type: text
      value: "第一行"
    - type: text
      value: "第二行"
~~~

### panel 边框

默认使用圆角边框：

~~~text
╭ 任务 ─────────╮
│ 内容          │
╰───────────────╯
~~~

使用单线边框：

~~~yaml
- type: panel
  border: single
  title: "详情"
  child:
    type: text
    value: "内容"
~~~

关闭边框：

~~~yaml
- type: panel
  border: false
  child:
    type: text
    value: "没有边框的内容"
~~~

## 9. list：列表

最小列表：

~~~yaml
- type: list
  items: data.tasks
~~~

如果数组项目是对象，默认会尝试显示项目的 label 或 title。

指定选中序号：

~~~yaml
- type: list
  items: data.tasks
  selected: state.selected
~~~

指定项目标题：

~~~yaml
- type: list
  items: data.tasks
  label: "{{ item.title }}"
~~~

指定项目描述：

~~~yaml
- type: list
  items: data.tasks
  label: "{{ item.title }}"
  description: "{{ if(item.done, '已完成', '未完成') }}"
~~~

### list 当前项目变量

list 为每一项建立一个临时 item 变量：

~~~yaml
label: "{{ item.title }}"
description: "{{ item.detail }}"
~~~

index 也可以使用：

~~~yaml
label: "{{ index }} - {{ item.title }}"
~~~

### list 样式

~~~yaml
- type: list
  items: data.tasks
  label: "{{ item.title }}"
  style: muted
~~~

项目样式可以根据当前 item 判断：

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

### list 空状态

~~~yaml
- type: list
  items: data.tasks
  emptyText: "没有任务"
~~~

## 10. divider：分隔线

~~~yaml
- type: divider
~~~

修改字符：

~~~yaml
- type: divider
  character: "-"
~~~

修改样式：

~~~yaml
- type: divider
  style: muted
~~~

## 11. spacer：空白

~~~yaml
- type: spacer
  height: 1
~~~

也可以使用 lines：

~~~yaml
- type: spacer
  lines: 2
~~~

spacer 适合：

- 在标题和内容之间留空。
- 为页脚保留空间。
- 在可选提示不存在时保持布局稳定。

## 12. 一个常见的页面骨架

推荐页面骨架：

~~~yaml
layout:
  type: column
  padding: [1, 2]
  children:
    - type: text
      value: "页面标题"
      style: title

    - type: text
      value: "操作提示"
      style: muted

    - type: divider

    - type: panel
      title: "主内容"
      flex: true
      child:
        type: list
        items: data.items
        selected: state.selected

    - type: text
      bind: state.notice
      visible: state.notice
      style: success

    - type: text
      value: "Esc 返回   q 退出"
      style: muted
~~~

这个结构将屏幕分为：

~~~text
顶部标题
操作提示
分隔线
会伸缩的主内容
可选提示
底部帮助
~~~

## 13. 布局排错方法

当布局不符合预期时，按下面顺序检查：

1. 先把外层改成 column。
2. 暂时删除所有 panel，只保留 text。
3. 每个组件只保留 value。
4. 给主要区域加 flex。
5. 检查 padding 是否太大。
6. 检查终端高度是否足够。
7. 再逐层把组件加回来。

不要一开始就同时调 panel、row、flex、padding 和 template。

## 14. 下一步

- [04 - 变量绑定、模板和条件](./04-variables-and-templates.md)
- [05 - 按键与动作](./05-actions.md)
- [08 - 组件参考](./08-components.md)
