const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { buildVisualModel, createVisualEditorHtml } = require("../visual-editor");

const repositoryRoot = path.resolve(__dirname, "..", "..");
const exampleRoot = path.join(repositoryRoot, "examples", "i18n");
const desktopShot = path.join(os.tmpdir(), "page-tui-i18n-editor-desktop.png");
const compactShot = path.join(os.tmpdir(), "page-tui-i18n-editor-compact.png");

const manifest = fs.readFileSync(path.join(exampleRoot, "app.yaml"), "utf8");
const externalLocales = {
  "zh-CN": {
    uri: "file:///workspace/locales/zh-CN.yaml",
    fileName: "/workspace/locales/zh-CN.yaml",
    source: fs.readFileSync(path.join(exampleRoot, "locales", "zh-CN.yaml"), "utf8")
  },
  en: {
    uri: "file:///workspace/locales/en.yaml",
    fileName: "/workspace/locales/en.yaml",
    source: fs.readFileSync(path.join(exampleRoot, "locales", "en.yaml"), "utf8")
  }
};
const model = buildVisualModel(manifest, "home", ["pages", "home", "layout"], {
  externalLocales,
  selectedLocale: "en",
  selectedTranslationPath: ["app", "heading"]
});

const theme = `
  :root {
    color-scheme: dark;
    --vscode-foreground: #cccccc;
    --vscode-descriptionForeground: #9d9d9d;
    --vscode-editor-background: #1f1f1f;
    --vscode-editorWidget-background: #252526;
    --vscode-input-background: #313131;
    --vscode-input-border: #555555;
    --vscode-panel-border: #444444;
    --vscode-textLink-foreground: #4daafc;
    --vscode-list-hoverBackground: #2a2d2e;
    --vscode-list-activeSelectionBackground: #04395e;
    --vscode-button-background: #0e639c;
    --vscode-button-foreground: #ffffff;
    --vscode-errorForeground: #f48771;
    --vscode-testing-iconPassed: #73c991;
    --vscode-editorWarning-foreground: #cca700;
    --vscode-focusBorder: #007acc;
  }
`;

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__visualMessages = [];
    window.acquireVsCodeApi = () => ({
      postMessage(message) {
        window.__visualMessages.push(message);
      }
    });
  });

  try {
    await page.goto("about:blank");
    await page.setContent(createVisualEditorHtml(model));
    await page.addStyleTag({ content: theme });

    await page.locator("#locales [data-locale]").first().waitFor();
    assert.equal(await page.locator("#locales [data-locale]").count(), 2);
    assert.equal(await page.locator("#translations [data-translation-path]").count(), 7);
    assert.equal(await page.locator("[data-translation-value]").inputValue(), "Page TUI External Language Modules");
    assert.equal(await page.locator(".node-button.active").count(), 0, "翻译选择不应同时高亮布局节点");

    await page.locator("#translation-filter").fill("greeting");
    assert.equal(await page.locator("#translations [data-translation-path]").count(), 1);
    await page.locator("#translation-filter").fill("");

    const valueEditor = page.locator("[data-translation-value]");
    await page.locator("[data-translation-kind]").selectOption("json");
    assert.equal(await valueEditor.inputValue(), '"Page TUI External Language Modules"');
    await page.locator("[data-translation-kind]").selectOption("text");
    assert.equal(await valueEditor.inputValue(), "Page TUI External Language Modules");

    const leftPanel = page.locator("#layout-workspace > aside").first();
    const leftDimensions = await leftPanel.evaluate((element) => ({
      width: element.clientWidth,
      scrollWidth: element.scrollWidth
    }));
    const overflowingElements = await leftPanel.locator("*").evaluateAll((elements) => elements
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => `${element.tagName.toLowerCase()}#${element.id}.${element.className}:${element.scrollWidth}/${element.clientWidth}`));
    assert.ok(
      leftDimensions.scrollWidth <= leftDimensions.width + 1,
      `语言列表不应横向溢出 (${leftDimensions.scrollWidth}px > ${leftDimensions.width}px): ${overflowingElements.join(", ")}`
    );
    await page.screenshot({ path: desktopShot, fullPage: true });

    await page.setViewportSize({ width: 820, height: 900 });
    const compactDimensions = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    assert.ok(compactDimensions.scrollWidth <= compactDimensions.width + 1, "窄屏编辑器不应横向溢出");
    await page.screenshot({ path: compactShot, fullPage: false });

    assert.deepEqual(browserErrors, [], `浏览器错误：${browserErrors.join(" | ")}`);
    console.log(`visual editor smoke passed\n${desktopShot}\n${compactShot}`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
