# 14：外部语言模块与运行时切换

Page TUI 可以从独立 YAML 或 JSON 文件加载显示文本，并通过 `data`、`state` 或 `params` 变量选择当前语言。

推荐把应用级语言放在 `data.locale`。语言文件在应用启动时加载一次，运行时只切换当前字典，不会在每次渲染时读取磁盘。构建独立二进制时，这些文件会被直接内嵌。

## 1. 配置语言模块

在 manifest 根节点增加 `i18n`：

~~~yaml
data:
  locale: zh-CN

i18n:
  locale:
    bind: data.locale
  fallback: zh-CN
  locales:
    zh-CN: locales/zh-CN.yaml
    en: locales/en.yaml
~~~

- `locale`：当前语言代码，也可以通过 `bind` 读取变量。
- `fallback`：当前语言或翻译键缺失时使用的默认语言。
- `locales`：语言代码到外部 YAML、JSON 文件或内联对象的映射。
- 相对文件路径以 manifest 所在目录为基准。

也可以直接写 `locale: data.locale`，但对象形式更容易区分“固定语言代码”和“变量路径”。

## 2. 编写语言文件

`locales/zh-CN.yaml`：

~~~yaml
common:
  title: 安装程序
  greeting: "你好，{{ params.name }}"
  empty: 暂无内容
~~~

`locales/en.yaml`：

~~~yaml
common:
  title: Installer
  greeting: "Hello, {{ params.name }}"
  empty: No content
~~~

JSON 文件使用同样的嵌套对象结构。翻译键使用点号访问，例如 `common.title`。

## 3. 显示翻译文本

任何支持动态文本值的字段都可以使用 `t`：

~~~yaml
title:
  t: common.title

layout:
  type: panel
  title:
    t: common.title
  child:
    type: text
    value:
      t: common.empty
~~~

常用可翻译字段包括：

- 页面、panel 和 popup 的 `title`。
- text 的 `value`。
- input 的 `placeholder`。
- list 的 `label`、`description` 和 `emptyText`。
- progress 的 `label`、`filled` 和 `empty`。
- divider 的 `character` 以及列表 marker。

## 4. 向翻译传入变量

语言文件中的模板参数从 `params` 读取。使用 `with` 传入当前变量：

~~~yaml
- type: text
  value:
    t: common.greeting
    with:
      name:
        bind: data.user.name
~~~

对应语言文件：

~~~yaml
common:
  greeting: "你好，{{ params.name }}"
~~~

翻译文本仍可直接访问 `data`、`state` 和当前页面原有的 `params`。`with` 适合让语言文件只依赖明确命名的参数，便于复用。

## 5. 在普通模板中翻译

需要把翻译和其他变量拼在一起时，使用 `t()`：

~~~yaml
- type: text
  template: "{{ t('common.title') }}: {{ data.version }}"
~~~

`t()` 接受一个翻译键。需要传入多个模板参数时，使用上一节的 `{ t, with }` 对象写法。

## 6. 运行时切换语言

语言选择变量和普通变量一样，可以由 `set` 修改：

~~~yaml
keys:
  l:
    - set:
        path: data.locale
        value: en
~~~

动作执行后页面会重新渲染，标题、组件文本、占位符和空状态会一起切换。也可以从列表中选择语言：

~~~yaml
- set:
    path: data.locale
    value:
      itemAt:
        list: data.languages
        index: state.selected
        key: code
~~~

`data.locale` 适合整个应用共享语言。`state.locale` 只适合某个页面独立控制语言；页面切换后会使用新页面自己的 state。

## 7. 回退规则

查找顺序如下：

1. 当前完整语言代码，例如 `en-GB`。
2. 当前基础语言，例如 `en`。
3. `fallback` 完整语言代码。
4. `fallback` 基础语言。

仍然找不到翻译时会直接显示翻译键，便于在开发阶段发现漏项。

## 8. 内联语言对象

小型应用可以不创建外部文件：

~~~yaml
i18n:
  locale: en
  fallback: zh-CN
  locales:
    en:
      common:
        title: Installer
    zh-CN:
      common:
        title: 安装程序
~~~

真实项目更推荐外部文件：每种语言独立维护，manifest 只负责选择和注册模块。

## 9. 预览和独立二进制

VS Code 实时预览会读取 manifest 引用的语言文件；修改语言文件或语言变量后，预览会重新解析文本。

可视化编辑器的可见文本属性可以直接选择“翻译键”，填写 key 和可选模板参数；流程图中的值参数也可切换到“翻译”模式。无需手写翻译对象 JSON。

左侧“翻译文件”区域可以维护字典内容：创建外部 YAML/JSON 语言文件、搜索或新增点路径翻译键，并在右侧编辑文本或 JSON 值。外部文件和 manifest 内联语言都支持；移除语言映射不会删除磁盘上的语言文件。

指定 manifest 构建时，语言模块与页面文件都会内嵌：

~~~bash
npm run build -- --manifest examples/i18n/app.yaml
~~~

生成的程序不需要旁边保留 `locales` 目录。完整示例位于 `examples/i18n/`。
