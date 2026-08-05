const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { actionsToWorkflow, workflowToActions } = require("../workflow-model");

const root = path.resolve(__dirname, "..");
const desktopShot = path.join(os.tmpdir(), "page-tui-workflow-desktop.png");
const compactShot = path.join(os.tmpdir(), "page-tui-workflow-compact.png");

const actions = [
  {
    call: {
      command: "printf 'one\\ntwo\\n'",
      wait: true,
      result: "state.output",
      onLine: [{ append: { path: "state.lines", value: "{{ line }}" } }],
      onExit: [{ set: { path: "state.exitCode", value: "{{ code }}" } }]
    }
  },
  {
    if: {
      condition: { equals: ["state.exitCode", 0] },
      then: [{ push: { page: "done", params: {} } }],
      else: [{ notify: "命令执行失败" }]
    }
  }
];

const workflow = actionsToWorkflow(actions, {
  source: "keys",
  event: "enter",
  path: ["pages", "home", "keys", "enter"],
  isList: true
});
const model = {
  selectedPage: "home",
  workflows: [{
    id: "keys.enter",
    source: "keys",
    event: "enter",
    path: ["pages", "home", "keys", "enter"],
    isList: true,
    workflow
  }]
};

async function dimensions(page, selector) {
  return page.locator(selector).evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    scrollWidth: element.scrollWidth
  }));
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(5000);
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  try {
    await page.setContent(`<!doctype html>
      <html lang="zh-CN">
        <head>
          <meta charset="utf-8">
          <style>
            :root {
              color-scheme: dark;
              --vscode-foreground: #cccccc;
              --vscode-descriptionForeground: #9d9d9d;
              --vscode-editor-background: #1f1f1f;
              --vscode-editorWidget-background: #252526;
              --vscode-editor-font-family: ui-monospace, monospace;
              --vscode-panel-border: #3c3c3c;
              --vscode-focusBorder: #007acc;
              --vscode-list-activeSelectionForeground: #ffffff;
              --vscode-list-activeSelectionBackground: #04395e;
              --vscode-testing-iconPassed: #73c991;
              --vscode-errorForeground: #f48771;
              --vscode-button-foreground: #ffffff;
              --vscode-button-background: #0e639c;
              --vscode-charts-green: #89d185;
              --vscode-charts-blue: #75beff;
              --vscode-charts-yellow: #cca700;
              --vscode-charts-purple: #b180d7;
              --vscode-charts-red: #f14c4c;
            }
            * { box-sizing: border-box; }
            html, body, #workflow-root { width: 100%; height: 100%; margin: 0; }
            body { overflow: hidden; color: var(--vscode-foreground); background: var(--vscode-editor-background); font: 13px sans-serif; }
            button, select, textarea { color: inherit; border: 1px solid var(--vscode-panel-border); border-radius: 2px; background: var(--vscode-editorWidget-background); }
            button, select { min-height: 28px; padding: 4px 8px; }
            button { cursor: pointer; }
            textarea { padding: 7px; }
          </style>
        </head>
        <body>
          <div id="workflow-root"></div>
          <script>
            window.__workflowMessages = [];
            window.__workflowState = {};
            window.pageTuiVscode = {
              postMessage(message) { window.__workflowMessages.push(message); },
              getState() { return window.__workflowState; },
              setState(state) { window.__workflowState = state; }
            };
            window.__PAGE_TUI_WORKFLOW_MODEL__ = ${JSON.stringify(model)};
          </script>
        </body>
      </html>`);
    await page.addStyleTag({ path: path.join(root, "media", "workflow-editor.css") });
    await page.addScriptTag({ path: path.join(root, "media", "workflow-editor.js") });

    await page.locator(".react-flow__node").first().waitFor();
    assert.ok(await page.locator(".react-flow__node").count() >= 10, "复杂动作应展开为流程节点");
    assert.equal(await page.locator(".wf-kind-call").count(), 1, "call 应显示为独立节点");
    assert.equal(await page.locator(".wf-kind-if").count(), 1, "if 应显示为独立节点");
    assert.equal(await page.locator(".wf-handle-line").count(), 1, "call 应提供逐行回调端口");
    assert.equal(await page.locator(".wf-handle-exit").count(), 1, "call 应提供退出回调端口");

    const desktopCanvas = await dimensions(page, ".wf-canvas");
    assert.ok(desktopCanvas.width >= 700 && desktopCanvas.height >= 700, "桌面画布尺寸不足");

    await page.locator(".wf-kind-call").click();
    const inspector = page.locator(".wf-inspector");
    await inspector.getByText("执行类型").waitFor();
    await inspector.getByRole("button", { name: "Shell" }).click();
    await inspector.getByRole("textbox", { name: "Shell 命令", exact: true }).fill("printf 'ready\\n'");
    await inspector.getByRole("checkbox", { name: "标准输出", exact: true }).check();
    await inspector.locator('input[aria-label="标准输出变量"]').fill("state.output");
    await inspector.getByRole("button", { name: "保存参数" }).click();
    await page.waitForFunction(() => window.__workflowMessages.filter((message) => message.type === "workflowUpdate").length >= 1);
    const configuredWorkflow = await page.evaluate(() => {
      const updates = window.__workflowMessages.filter((message) => message.type === "workflowUpdate");
      return updates.at(-1).workflow;
    });
    const configuredActions = workflowToActions(configuredWorkflow);
    assert.equal(configuredActions[0].call.sh, "printf 'ready\\n'");
    assert.equal(configuredActions[0].call.stdout, "state.output");

    const messagesBeforeCreate = await page.evaluate(() => window.__workflowMessages.length);
    const edgesBeforeCreate = await page.locator(".react-flow__edge").count();
    const nodesBeforeCreate = await page.locator(".react-flow__node").count();
    await page.getByLabel("节点模板").selectOption("set");
    await page.getByRole("button", { name: "添加节点" }).click();
    await page.waitForFunction((count) => document.querySelectorAll(".react-flow__node").length === count + 1, nodesBeforeCreate);
    assert.equal(await page.locator(".react-flow__edge").count(), edgesBeforeCreate, "新节点不应自动连接");
    assert.equal(await page.evaluate(() => window.__workflowMessages.length), messagesBeforeCreate, "游离节点不应写回 YAML");
    await page.getByText(/未连接/).waitFor();
    await inspector.locator('input[aria-label="变量路径"]').fill("state.created");
    await inspector.getByRole("button", { name: "翻译", exact: true }).click();
    await inspector.getByRole("textbox", { name: "变量值翻译键", exact: true }).fill("common.created");
    await inspector.getByRole("button", { name: "保存参数" }).click();
    assert.equal(await page.evaluate(() => window.__workflowMessages.length), messagesBeforeCreate, "保存游离节点参数时不应写回 YAML");
    await inspector.getByRole("button", { name: "删除节点" }).click();
    await page.waitForFunction((count) => document.querySelectorAll(".react-flow__node").length === count, nodesBeforeCreate);

    const nodeCountBeforeCreate = await page.locator(".react-flow__node").count();
    const edgeCountBeforeContextCreate = await page.locator(".react-flow__edge").count();
    await page.locator(".react-flow__pane").click({ button: "right", position: { x: 520, y: 260 } });
    await page.getByRole("menu").getByRole("menuitem", { name: "显示通知" }).click();
    assert.ok(await page.locator(".react-flow__node").count() > nodeCountBeforeCreate, "右键菜单应创建节点");
    assert.equal(await page.locator(".react-flow__edge").count(), edgeCountBeforeContextCreate, "右键创建的节点不应自动连接");
    await inspector.getByRole("button", { name: "删除节点" }).click();

    const progressPaletteItem = page.locator('.wf-palette-item[data-template-id="progress"]');
    const edgeCountBeforeDrop = await page.locator(".react-flow__edge").count();
    await progressPaletteItem.dragTo(page.locator(".react-flow__pane"), {
      targetPosition: { x: 620, y: 360 }
    });
    assert.equal(await page.locator(".react-flow__edge").count(), edgeCountBeforeDrop, "拖入节点不应自动连接");
    await inspector.getByRole("button", { name: "删除节点" }).click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("page-tui-workflow-error", {
      detail: { message: "fixture write failed" }
    })));
    await page.getByText("fixture write failed").waitFor();
    assert.equal(await page.evaluate(() => Object.keys(window.__workflowState.workflowDrafts || {}).length), 1, "写入失败时应保留当前流程草稿");
    await page.screenshot({ path: desktopShot, fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.dispatchEvent(new Event("page-tui-workflow-resize")));
    await page.waitForTimeout(250);
    const compactCanvas = await dimensions(page, ".wf-canvas");
    const compactShell = await dimensions(page, ".wf-shell");
    assert.ok(compactCanvas.width >= 300 && compactCanvas.height >= 300, "窄屏画布应保持可操作尺寸");
    assert.ok(compactShell.scrollWidth <= compactShell.width + 1, "窄屏流程编辑器不应横向溢出");
    await page.getByRole("button", { name: "节点库" }).click();
    const compactPalette = page.locator(".wf-mobile-palette-drawer");
    await compactPalette.getByText("移动选择").waitFor();
    await compactPalette.getByText("删除列表项").waitFor();
    await compactPalette.getByText("删除末尾字符").waitFor();
    await compactPalette.getByText("重置页面栈").waitFor();
    await compactPalette.getByText("刷新界面").waitFor();
    await compactPalette.getByText("继续（自动）").waitFor();
    await compactPalette.getByText("结束（自动）").waitFor();
    await page.screenshot({ path: compactShot, fullPage: true });
    await compactPalette.getByRole("button", { name: "关闭节点库" }).click();

    const edgeCountBeforeDelete = await page.locator(".react-flow__edge").count();
    const messagesBeforeDelete = await page.evaluate(() => window.__workflowMessages.length);
    await page.locator(".react-flow__edge").first().click({ force: true });
    await inspector.getByRole("button", { name: "删除连线" }).click();
    assert.equal(await page.locator(".react-flow__edge").count(), edgeCountBeforeDelete - 1, "应删除选中的连线");
    assert.equal(await page.evaluate(() => window.__workflowMessages.length), messagesBeforeDelete, "断开的流程不应写回 YAML");

    assert.deepEqual(browserErrors, [], `浏览器错误：${browserErrors.join(" | ")}`);
    console.log(`workflow smoke passed\n${desktopShot}\n${compactShot}`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
