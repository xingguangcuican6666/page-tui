# 08：组件参考

声明式布局最终会被编译成 Page TUI 的基础 UI 节点。

## 1. 通用规则

每个组件都有 type：

~~~yaml
type: text
~~~

大多数组件都可以使用：

- padding
- style
- flex

布局组件使用：

- children
- child
- gap

组件的属性必须放在同级，不要把 type 放进 children。

错误：

~~~yaml
layout:
  type: column
    type: text
~~~

正确：

~~~yaml
layout:
  type: column
  children:
    - type: text
~~~

## 2. style

内置主题名：

| 名称 | 默认效果 |
| --- | --- |
| title | 青色、加粗 |
| primary | 青色 |
| selected | 黑字、青色背景、加粗 |
| muted | 灰色、弱化 |
| border | 灰色边框 |
| success | 绿色 |
| warning | 黄色 |
| danger | 红色 |
| input | 白色、下划线 |

示例：

~~~yaml
- type: text
  value: "成功"
  style: success
~~~

style 可以使用颜色对象：

~~~yaml
- type: text
  value: "重点"
  style:
    fg: red
    bold: true
~~~

支持的常见字段：

- fg：前景色。
- bg：背景色。
- bold：粗体。
- dim：弱化。
- italic：斜体。
- underline：下划线。
- inverse：反色。

常见颜色：

~~~text
black red green yellow blue magenta cyan white gray
brightBlack brightRed brightGreen brightYellow
brightBlue brightMagenta brightCyan brightWhite
~~~

## 3. text

### 固定文字

~~~yaml
- type: text
  value: "固定文字"
~~~

### bind

~~~yaml
- type: text
  bind: state.notice
~~~

### template

~~~yaml
- type: text
  template: "共 {{ count(data.tasks) }} 个任务"
~~~

### 选项

~~~yaml
- type: text
  value: "标题"
  style: title
  padding: [1, 0, 0, 0]
~~~

text 会自动换行。中文和宽字符会按终端显示宽度计算。

## 4. input

~~~yaml
- type: input
  bind: state.title
  placeholder: "请输入标题"
~~~

input 本身只是显示绑定值和光标。要让它能输入，必须配置：

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

选项：

- bind：输入值的路径。
- value：不使用 bind 时的初始显示值。
- placeholder：值为空时显示的提示。
- cursor：是否显示 ▌，默认 true。
- style：输入文字的样式。

## 5. column

~~~yaml
- type: column
  padding: 1
  gap: 1
  children:
    - type: text
      value: "上面"

    - type: text
      value: "下面"
~~~

属性：

- children：子组件数组。
- padding：内边距。
- gap：子组件之间的空行数。
- flex：让这个 column 在父布局中占剩余空间。

## 6. row

~~~yaml
- type: row
  gap: 2
  children:
    - type: text
      value: "左"
    - type: text
      value: "右"
~~~

row 会在水平方向排列子组件。

适合：

- 左右标题。
- 小状态标签。
- 并列内容。

如果需要让某个子组件占剩余宽度：

~~~yaml
- type: row
  children:
    - type: text
      value: "固定"
    - type: text
      value: "占剩余空间"
      flex: true
~~~

## 7. panel

### child 写法

~~~yaml
- type: panel
  title: "详情"
  child:
    type: text
    value: "详情内容"
~~~

### children 写法

~~~yaml
- type: panel
  title: "详情"
  children:
    - type: text
      value: "第一行"
    - type: text
      value: "第二行"
~~~

### 属性

- title：标题。
- border：默认圆角；single 使用单线；false 关闭边框。
- borderStyle：边框样式名。
- titleStyle：标题样式名。
- padding：边框内部的内边距。
- flex：在父 column 或 row 中占剩余空间。

~~~yaml
- type: panel
  title: "任务"
  border: single
  borderStyle: border
  titleStyle: title
  padding: 1
  flex: true
  child:
    type: list
    items: data.tasks
~~~

## 8. list

### 最小写法

~~~yaml
- type: list
  items: data.tasks
~~~

### 绑定选中项

~~~yaml
- type: list
  items: data.tasks
  selected: state.selected
~~~

selected 是从 0 开始的数字：

~~~text
selected = 0  第一项
selected = 1  第二项
selected = 2  第三项
~~~

### label 和 description

~~~yaml
- type: list
  items: data.tasks
  label: "{{ item.title }}"
  description: "{{ item.detail }}"
~~~

### 样式和标记

~~~yaml
- type: list
  items: data.tasks
  label: "{{ item.title }}"
  marker: "❯"
  normalMarker: " "
  selectedStyle: selected
  itemStyle: primary
  disabledStyle: muted
~~~

list 也支持：

- emptyText：数组为空时显示的文字。
- emptyStyle：空状态样式。
- flex：占用父布局剩余高度。

### 对象项目

data.tasks：

~~~yaml
data:
  tasks:
    - title: "任务一"
      detail: "说明一"
      done: false
~~~

list：

~~~yaml
- type: list
  items: data.tasks
  label: "{{ item.title }}"
  description: "{{ item.detail }}"
~~~

每一项会被转换为：

~~~text
label       任务标题
description 任务描述
value       原始 item 对象
~~~

## 9. divider

~~~yaml
- type: divider
~~~

可选：

~~~yaml
- type: divider
  character: "─"
  style: border
~~~

divider 会横向填满当前可用宽度。

## 10. spacer

~~~yaml
- type: spacer
  height: 2
~~~

或者：

~~~yaml
- type: spacer
  lines: 2
~~~

spacer 不显示文字，只占用高度。

## 11. 组件组合示例

~~~yaml
layout:
  type: column
  padding: [1, 2]
  children:
    - type: text
      value: "任务管理"
      style: title

    - type: text
      value: "↑/↓ 选择，Enter 查看"
      style: muted

    - type: divider

    - type: panel
      title: "任务"
      flex: true
      child:
        type: list
        items: data.tasks
        selected: state.selected
        label: "{{ item.title }}"
        description: "{{ if(item.done, '已完成', '未完成') }}"

    - type: text
      bind: state.notice
      visible: state.notice
      style: success

    - type: text
      value: "Esc 返回   q 退出"
      style: muted
~~~

## 12. 布局顺序的阅读方法

看到：

~~~yaml
type: column
children:
  - type: text
  - type: panel
    child:
      type: list
  - type: text
~~~

先读外层：

~~~text
一列布局
├── text
├── panel
└── text
~~~

再展开 panel：

~~~text
panel
└── list
~~~

不要先从样式入手。先确认结构，再调整 padding、gap、flex。

## 13. 组件不显示时

按顺序检查：

1. visible 是否为 false。
2. bind 路径是否存在。
3. list items 是否真的为数组。
4. panel 或 column 是否被高度裁剪。
5. flex 是否放在正确的父布局中。
6. 当前终端是否太小。
7. YAML 缩进是否正确。

## 14. 终端尺寸

renderer 会按照终端 columns 和 rows 绘制。

如果内容超过高度：

- column 会裁剪超出的行。
- list 会显示可见窗口中的项目。
- panel 会保留边框并裁剪内部内容。

如果内容超过宽度：

- text 会换行。
- list 行会截断。
- panel 会保持边框宽度。

## 15. 主题覆盖

启动器可以覆盖主题：

~~~js
createDeclarativeApp({
  manifest: "./ui/app.yaml",
  theme: {
    title: {
      fg: "magenta",
      bold: true
    },
    selected: {
      fg: "white",
      bg: "blue",
      bold: true
    }
  }
}).start();
~~~

YAML 中仍然使用 style: title 和 style: selected，不需要修改页面结构。

## 16. 组件选择建议

| 需求 | 组件 |
| --- | --- |
| 一行文字 | text |
| 输入文字 | input |
| 上下排列 | column |
| 左右排列 | row |
| 加边框分组 | panel |
| 选择列表 | list |
| 横线 | divider |
| 留白 | spacer |

先用这 8 个组件完成页面，再考虑扩展表格、弹窗和 tabs。
