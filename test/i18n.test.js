const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createDeclarativeApp, createI18n, renderView } = require("../src");

function renderPage(page, width = 48, height = 12) {
  return renderView(page.render(), width, height, { color: false });
}

test("i18n 根据变量选择语言并回退到基础语言和默认语言", () => {
  const i18n = createI18n({
    locale: { bind: "data.locale" },
    fallback: "zh-CN",
    locales: {
      en: { common: { hello: "Hello" } },
      "zh-CN": { common: { hello: "你好", fallback: "默认文本" } }
    }
  });

  assert.equal(i18n.translate("common.hello", { data: { locale: "en-GB" } }), "Hello");
  assert.equal(i18n.translate("common.fallback", { data: { locale: "en-GB" } }), "默认文本");
  assert.equal(i18n.translate("common.missing", { data: { locale: "en-GB" } }), "common.missing");
});

test("声明式页面切换语言变量后重新解析所有文本字段", async () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      data: { locale: "en", name: "Ada", items: [] },
      i18n: {
        locale: { bind: "data.locale" },
        fallback: "zh-CN",
        locales: {
          en: {
            home: {
              title: "Installer",
              panel: "Options",
              greeting: "Hello, {{ params.name }}",
              footer: "Press L to switch",
              placeholder: "Type a value",
              empty: "No items"
            }
          },
          "zh-CN": {
            home: {
              title: "安装程序",
              panel: "选项",
              greeting: "你好，{{ params.name }}",
              footer: "按 L 切换语言",
              placeholder: "请输入内容",
              empty: "暂无项目"
            }
          }
        }
      },
      pages: {
        home: {
          title: { t: "home.title" },
          state: { value: "" },
          layout: {
            type: "panel",
            title: { t: "home.panel" },
            child: {
              type: "column",
              children: [
                { type: "text", value: { t: "home.greeting", with: { name: { bind: "data.name" } } } },
                { type: "text", template: "{{ t('home.footer') }}" },
                { type: "input", bind: "state.value", placeholder: { t: "home.placeholder" } },
                { type: "list", items: "data.items", emptyText: { t: "home.empty" } }
              ]
            }
          },
          keys: {
            l: { set: { path: "data.locale", value: "zh-CN" } }
          }
        }
      }
    }
  });
  const page = app.pageManager.resolve("home");
  page._attach(app);

  let lines = renderPage(page);
  assert.equal(page.title, "Installer");
  assert.equal(lines.some((line) => line.includes("Options")), true);
  assert.equal(lines.some((line) => line.includes("Hello, Ada")), true);
  assert.equal(lines.some((line) => line.includes("Press L to switch")), true);
  assert.equal(lines.some((line) => line.includes("Type a value")), true);
  assert.equal(lines.some((line) => line.includes("No items")), true);

  await page.onKey({ name: "l", value: "l", ctrl: false, meta: false });
  lines = renderPage(page);
  assert.equal(page.title, "安装程序");
  assert.equal(lines.some((line) => line.includes("选项")), true);
  assert.equal(lines.some((line) => line.includes("你好，Ada")), true);
  assert.equal(lines.some((line) => line.includes("按 L 切换语言")), true);
  assert.equal(lines.some((line) => line.includes("请输入内容")), true);
  assert.equal(lines.some((line) => line.includes("暂无项目")), true);
});

test("manifest 可以加载外部 YAML 和 JSON 语言模块", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "page-tui-i18n-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, "locales"));
  await fs.writeFile(path.join(directory, "locales", "en.yaml"), "home:\n  title: External English\n");
  await fs.writeFile(path.join(directory, "locales", "zh.json"), JSON.stringify({ home: { title: "外部中文" } }));
  await fs.writeFile(path.join(directory, "app.yaml"), [
    "initial: home",
    "data:",
    "  locale: zh-CN",
    "i18n:",
    "  locale:",
    "    bind: data.locale",
    "  fallback: en",
    "  locales:",
    "    en: locales/en.yaml",
    "    zh-CN: locales/zh.json",
    "pages:",
    "  home:",
    "    layout:",
    "      type: text",
    "      value:",
    "        t: home.title"
  ].join("\n"));

  const app = createDeclarativeApp({ manifest: path.join(directory, "app.yaml") });
  const page = app.pageManager.resolve("home");
  page._attach(app);
  assert.equal(renderPage(page).some((line) => line.includes("外部中文")), true);
});
