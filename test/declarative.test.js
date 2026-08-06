const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const YAML = require("yaml");
const { EventEmitter } = require("node:events");
const { createDeclarativeApp, renderView, Terminal } = require("../src");

class FakeInput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = false;
  }
}

class FakeOutput extends EventEmitter {
  constructor() {
    super();
    this.isTTY = false;
    this.columns = 80;
    this.rows = 24;
  }

  write() {}
}

function key(name, value = name) {
  return { name, value, ctrl: false, meta: false };
}

function shellCalls(node, result = []) {
  if (Array.isArray(node)) {
    node.forEach((item) => shellCalls(item, result));
    return result;
  }
  if (!node || typeof node !== "object") return result;
  if (node.call && typeof node.call === "object" && Object.hasOwn(node.call, "sh")) {
    result.push(node.call);
  }
  Object.values(node).forEach((value) => shellCalls(value, result));
  return result;
}

function installerDefinition() {
  const manifestPath = path.join(__dirname, "..", "examples", "arch_installer", "app.yaml");
  const localeDir = path.join(__dirname, "..", "examples", "arch_installer", "locales");
  const definition = YAML.parse(fs.readFileSync(manifestPath, "utf8"));

  for (const locale of ["zh-CN", "zh-CN_ba"]) {
    definition.i18n.locales[locale] = YAML.parse(
      fs.readFileSync(path.join(localeDir, `${locale}.yaml`), "utf8")
    );
  }

  const systemSettingsCall = shellCalls(definition.pages.home.keys.enter)
    .find((call) => call.sh.includes("localectl") || call.sh.includes("loadkeys"));
  if (!systemSettingsCall) throw new Error("安装器首页缺少系统语言设置命令。");
  systemSettingsCall.sh = "exit 0";
  return definition;
}

function writeExecutable(filePath, source) {
  fs.writeFileSync(filePath, source, { mode: 0o755 });
  fs.chmodSync(filePath, 0o755);
}

async function startInstaller(definition = installerDefinition(), options = {}) {
  const app = createDeclarativeApp({
    definition,
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] },
    env: options.env
  });

  await app.start();
  await app.currentPage.onKey(key("enter"));
  await app.currentPage.onKey(key("enter"));
  return app;
}

test("YAML pages bind variables and navigate through the page stack", async () => {
  const terminal = new Terminal({ input: new FakeInput(), output: new FakeOutput() });
  const app = createDeclarativeApp({
    manifest: path.join(__dirname, "fixtures", "sample-app.yaml"),
    terminal,
    renderer: { render: () => [] }
  });

  await app.start();
  assert.equal(app.currentPage.name, "home");
  assert.equal(app.data.tasks.length, 3);

  await app.currentPage.onKey(key("down"));
  assert.equal(app.currentPage.state.selected, 1);

  await app.currentPage.onKey(key("enter"));
  assert.equal(app.currentPage.name, "detail");
  assert.equal(app.currentPage.params.task.title, "学习变量绑定");

  await app.currentPage.onKey(key("escape"));
  assert.equal(app.currentPage.name, "home");

  await app.currentPage.onKey(key("n"));
  assert.equal(app.currentPage.name, "create");
  await app.currentPage.onKey(key("x"));
  await app.currentPage.onKey(key("y"));
  assert.equal(app.currentPage.state.title, "xy");
  await app.currentPage.onKey(key("enter"));

  assert.equal(app.currentPage.name, "home");
  assert.equal(app.data.tasks.at(-1).title, "xy");
  app.quit();
});

test("declarative push resolves a page target from variables", async () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { nextPage: "detail" },
          layout: { type: "text", value: "home" },
          keys: {
            enter: {
              push: {
                page: { bind: "state.nextPage" }
              }
            }
          }
        },
        detail: {
          layout: { type: "text", value: "detail" }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("enter"));
  assert.equal(app.currentPage.name, "detail");
  app.quit();
});

test("YAML view templates compile into the existing renderer", () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      data: { tasks: [{ title: "Read YAML", done: false }] },
      pages: {
        home: {
          state: { selected: 0 },
          layout: {
            type: "column",
            children: [
              { type: "text", template: "Tasks: {{ count(data.tasks) }}" },
              {
                type: "list",
                items: "data.tasks",
                selected: "state.selected",
                label: "{{ index }} - {{ item.title }}"
              }
            ]
          }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  const page = app.pageManager.resolve("home");
  page._attach(app);
  const lines = renderView(page.render(), 30, 4, { color: false });
  assert.equal(lines.some((line) => line.includes("Tasks: 1")), true);
  assert.equal(lines.some((line) => line.includes("0 - Read YAML")), true);
});

test("declarative progress binds a live numeric state value", () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { percent: 25 },
          layout: {
            type: "progress",
            bind: "state.percent",
            max: 100,
            label: "下载"
          }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  const page = app.pageManager.resolve("home");
  page._attach(app);
  const lines = renderView(page.render(), 30, 2, { color: false });
  assert.equal(lines.some((line) => line.includes("下载")), true);
  assert.equal(lines.some((line) => line.includes("25%")), true);
});

test("declarative visible 条件可以解析普通 state 路径", async () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { show: false },
          layout: {
            type: "column",
            children: [
              {
                type: "text",
                value: "列表",
                visible: { equals: ["state.show", false] }
              },
              {
                type: "popup",
                title: "提示",
                message: "弹窗已显示",
                visible: { equals: ["state.show", true] }
              }
            ]
          },
          keys: {
            enter: [{ set: { path: "state.show", value: true } }]
          }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  let lines = renderView(app.currentPage.render(), 40, 8, { color: false });
  assert.equal(lines.some((line) => line.includes("列表")), true);
  assert.equal(lines.some((line) => line.includes("弹窗已显示")), false);

  await app.currentPage.onKey(key("enter"));
  lines = renderView(app.currentPage.render(), 40, 8, { color: false });
  assert.equal(lines.some((line) => line.includes("列表")), false);
  assert.equal(lines.some((line) => line.includes("弹窗已显示")), true);
  app.quit();
});

test("arch installer first page applies the selected LANG and KEYMAP", async () => {
  const app = createDeclarativeApp({
    definition: installerDefinition(),
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  assert.equal(app.currentPage.name, "home");
  await app.currentPage.onKey(key("down"));
  await app.currentPage.onKey(key("enter"));
  assert.equal(app.data.system.lang, "en_US.UTF-8");
  assert.equal(app.currentPage.state.focus, "keymap");

  await app.currentPage.onKey(key("down"));
  await app.currentPage.onKey(key("enter"));
  assert.equal(app.data.system.keymap, "de");
  assert.equal(app.declarative.env.LANG, "en_US.UTF-8");
  assert.equal(app.declarative.env.LC_ALL, "en_US.UTF-8");
  assert.equal(app.currentPage.name, "First Info");
  app.quit();
});

test("env paths are inherited by later shell commands", async () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { output: "" },
          layout: { type: "text", bind: "state.output" },
          keys: {
            enter: [
              { set: { path: "env.LANG", value: "zh_CN.UTF-8" } },
              { call: { sh: "printf '%s' \"$LANG\"", stdout: "state.output" } }
            ]
          }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("enter"));
  assert.equal(app.declarative.env.LANG, "zh_CN.UTF-8");
  assert.equal(app.currentPage.state.output, "zh_CN.UTF-8");
  app.quit();
});

test("arch installer 进入网络页面时保留列表并隐藏 popup", async () => {
  const app = await startInstaller();

  assert.equal(app.currentPage.name, "First Info");
  assert.equal(app.currentPage.state.isshow_dialog, false);
  const lines = renderView(app.currentPage.render(), 80, 24, { color: false });
  assert.equal(lines.some((line) => line.includes("无线连接")), true);
  assert.equal(lines.some((line) => line.includes("╭ 提示")), false);
  app.quit();
});

test("declarative pages can call an allowlisted service", async () => {
  let received;
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { value: "hello" },
          layout: { type: "text", value: "service" },
          keys: {
            s: {
              call: "demo.save",
              with: { value: { bind: "state.value" } }
            }
          }
        }
      }
    },
    services: {
      "demo.save": (payload) => {
        received = payload;
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("s"));
  assert.deepEqual(received, { value: "hello" });
  app.quit();
});

const shellTest = process.platform === "win32" ? test.skip : test;

shellTest("sh calls use /bin/sh instead of the user's interactive shell", async () => {
  const previousShell = process.env.SHELL;
  process.env.SHELL = "/usr/bin/fish";
  try {
    const app = createDeclarativeApp({
      manifest: {
        initial: "home",
        pages: {
          home: {
            state: { output: "" },
            layout: { type: "text", bind: "state.output" },
            keys: {
              s: {
                call: {
                  sh: "if true; then printf sh-ok; fi",
                  stdout: "state.output"
                }
              }
            }
          }
        }
      },
      terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
      renderer: { render: () => [] }
    });

    await app.start();
    await app.currentPage.onKey(key("s"));
    assert.equal(app.currentPage.state.output, "sh-ok");
    app.quit();
  } finally {
    if (previousShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = previousShell;
    }
  }
});

shellTest("declarative pages can call a blocking shell command", async () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { shell: null },
          layout: { type: "text", value: "shell" },
          keys: {
            s: {
              call: {
                sh: "printf shell-ok",
                stdio: "pipe",
                result: "state.shell"
              }
            }
          }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("s"));
  assert.equal(app.currentPage.state.shell.ok, true);
  assert.equal(app.currentPage.state.shell.code, 0);
  assert.equal(app.currentPage.state.shell.stdout, "shell-ok");
  app.quit();
});

shellTest("shell output can populate log lines and JSON list data", async () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { logs: [], items: [], selected: 0 },
          layout: {
            type: "column",
            children: [
              { type: "list", items: "state.items", selected: "state.selected", label: "{{ item.title }}" },
              { type: "text", bind: "state.logs[0]" }
            ]
          },
          keys: {
            l: {
              call: {
                sh: "printf 'first\\nsecond\\n'",
                lines: "state.logs",
                stdout: "state.raw"
              }
            },
            j: {
              call: {
                sh: "printf '[{\"title\":\"one\"},{\"title\":\"two\"}]'",
                json: "state.items"
              }
            }
          }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("l"));
  assert.deepEqual(app.currentPage.state.logs, ["first", "second"]);
  assert.equal(app.currentPage.state.raw, "first\nsecond\n");

  await app.currentPage.onKey(key("j"));
  assert.deepEqual(app.currentPage.state.items, [{ title: "one" }, { title: "two" }]);
  const lines = renderView(app.currentPage.render(), 30, 5, { color: false });
  assert.equal(lines.some((line) => line.includes("one")), true);
  app.quit();
});

shellTest("blocking shell onLine receives stdout and stderr entries", async () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { stderrLogs: [], lastStream: null, lastLine: null },
          layout: { type: "text", bind: "state.lastLine" },
          keys: {
            s: {
              call: {
                sh: "printf 'out\\n'; printf 'err\\n' >&2",
                stderrLines: "state.stderrLogs",
                onLine: [
                  { set: { path: "state.lastStream", value: { bind: "key.stream" } } },
                  { set: { path: "state.lastLine", value: { bind: "key.value" } } }
                ]
              }
            }
          }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("s"));
  assert.deepEqual(app.currentPage.state.stderrLogs, ["err"]);
  assert.equal(app.currentPage.state.lastStream, "stderr");
  assert.equal(app.currentPage.state.lastLine, "err");
  app.quit();
});

test("declarative pages can start a nonblocking external command", async () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { process: null },
          layout: { type: "text", value: "process" },
          keys: {
            s: {
              call: {
                command: process.execPath,
                args: ["-e", "setTimeout(() => {}, 100)"],
                wait: false,
                result: "state.process"
              }
            }
          }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("s"));
  assert.equal(app.currentPage.state.process.running, true);
  assert.equal(Number.isInteger(app.currentPage.state.process.pid), true);
  app.quit();
});

test("nonblocking shell output streams into state and runs onExit actions", async () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { logs: [], process: null, finished: null },
          layout: { type: "list", items: "state.logs" },
          keys: {
            s: {
              call: {
                command: process.execPath,
                args: ["-e", "console.log('first'); setTimeout(() => console.log('second'), 20)"],
                wait: false,
                lines: "state.logs",
                result: "state.process",
                onExit: [
                  {
                    set: {
                      path: "state.finished",
                      value: { bind: "key.code" }
                    }
                  }
                ]
              }
            }
          }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("s"));
  for (let attempt = 0; attempt < 40 && app.currentPage.state.finished === null; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.deepEqual(app.currentPage.state.logs, ["first", "second"]);
  assert.equal(app.currentPage.state.process.running, false);
  assert.equal(app.currentPage.state.process.code, 0);
  assert.equal(app.currentPage.state.finished, 0);
  app.quit();
});

test("shell onExit can navigate to a result page", async () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { process: null },
          layout: { type: "text", value: "running" },
          keys: {
            s: {
              call: {
                command: process.execPath,
                args: ["-e", "process.stdout.write('done')"],
                wait: false,
                result: "state.process",
                onExit: [
                  {
                    push: {
                      page: "result",
                      params: {
                        code: { bind: "state.process.code" }
                      }
                    }
                  }
                ]
              }
            }
          }
        },
        result: {
          layout: { type: "text", template: "exit={{ params.code }}" }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("s"));
  for (let attempt = 0; attempt < 40 && app.currentPage.name !== "result"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(app.currentPage.name, "result");
  assert.equal(app.currentPage.params.code, 0);
  app.quit();
});

test("input components accept text without explicit character actions", async () => {
  const app = createDeclarativeApp({
    manifest: {
      initial: "home",
      pages: {
        home: {
          state: { title: "" },
          layout: { type: "input", bind: "state.title", placeholder: "title" }
        }
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("h"));
  await app.currentPage.onKey(key("i"));
  await app.currentPage.onKey(key("backspace"));
  assert.equal(app.currentPage.state.title, "h");
  app.quit();
});

test("arch installer wireless form switches focus and masks password", async () => {
  const app = await startInstaller();
  await app.currentPage.onKey(key("enter"));
  const emptyLines = renderView(app.currentPage.render(), 80, 20, { color: false });
  assert.equal(emptyLines.some((line) => line.includes("例如 My-WiFi▌")), false);
  assert.equal(app.currentPage.render().children[0].child.children[2].options.style, "muted");
  for (const character of "My-WiFi") await app.currentPage.onKey(key(character));
  await app.currentPage.onKey(key("tab", "\t"));
  for (const character of "secret") await app.currentPage.onKey(key(character));

  assert.equal(app.currentPage.name, "wireless");
  assert.equal(app.currentPage.state.ssid, "My-WiFi");
  assert.equal(app.currentPage.state.password, "secret");
  assert.equal(app.currentPage.state.focus, "password");
  assert.equal(app.currentPage.render().children[0].child.children[4].options.style, "input");
  const lines = renderView(app.currentPage.render(), 80, 20, { color: false });
  assert.equal(lines.some((line) => line.includes("secret")), false);
  assert.equal(lines.some((line) => line.includes("••••••")), true);
  app.quit();
});

test("arch installer shows the wired check before ping finishes and Esc cancels it", async () => {
  const definition = installerDefinition();
  const wiredActions = definition.pages["First Info"].keys.enter[0].if.else[0].if.else;
  wiredActions.find((action) => action.call).call.sh = "sleep 0.15; exit 0";

  const app = await startInstaller(definition);
  await app.currentPage.onKey(key("down"));
  await app.currentPage.onKey(key("enter"));

  assert.equal(app.currentPage.name, "First Info");
  assert.equal(app.currentPage.state.isshow_dialog, true);
  assert.equal(app.currentPage.state.running, true);
  assert.match(renderView(app.currentPage.render(), 80, 24, { color: false }).join("\n"), /正在检查有线网络/);

  await app.currentPage.onKey(key("escape"));
  assert.equal(app.currentPage.name, "home");
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(app.currentPage.name, "home");
  app.quit();
});

test("arch installer keeps wireless connection and ping cancellable", async () => {
  const definition = installerDefinition();
  for (const [name, page] of Object.entries(definition.pages)) {
    assert.ok(page.keys?.escape, `${name} 页面缺少 escape 动作`);
  }
  const wirelessCalls = shellCalls(definition.pages.wireless.keys.enter);
  wirelessCalls.find((call) => call.sh.includes("nmcli")).sh = "sleep 0.15; exit 0";
  wirelessCalls.find((call) => call.sh.includes("ping -c 3")).sh = "sleep 0.15; exit 0";

  const app = await startInstaller(definition);
  await app.currentPage.onKey(key("enter"));
  app.currentPage.state.ssid = "My-WiFi";
  app.currentPage.state.password = "secret";
  app.currentPage.state.focus = "password";
  await app.currentPage.onKey(key("enter"));

  assert.equal(app.currentPage.name, "wireless");
  assert.equal(app.currentPage.state.working, true);
  assert.match(renderView(app.currentPage.render(), 80, 24, { color: false }).join("\n"), /正在连接无线网络/);

  await app.currentPage.onKey(key("escape"));
  assert.equal(app.currentPage.name, "First Info");
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.equal(app.currentPage.name, "First Info");
  app.quit();
});

test("arch installer enters timezone, time sync, and partition in order", async () => {
  function definitionFor(command) {
    const definition = installerDefinition();
    const wiredActions = definition.pages["First Info"].keys.enter[0].if.else[0].if.else;
    wiredActions.find((action) => action.call).call.sh = command;
    const timezoneActions = definition.pages.timezone.keys.enter[0].if.else[0].if.else;
    timezoneActions.find((action) => action.call).call.sh = 'test "$TIMEZONE" = "Asia/Shanghai"';
    definition.pages["time-sync"].on.enter[0].call.sh = "sleep 0.1; exit 0";
    definition.pages.partition.on.enter[0].call.sh = "printf '/dev/test 10G disk TestDisk\\n'";
    shellCalls(definition.pages.partition.keys.enter).find((call) => call.sh.includes("cfdisk")).sh = "exit 0";
    shellCalls(definition.pages["partition-next"].on.enter).find((call) => call.sh.includes("lsblk")).sh =
      "printf '/dev/test1  1G  ext4  -\\n/dev/test2  512M  vfat  /mnt/boot\\n'";
    return definition;
  }

  async function createAppFor(command) {
    const app = await startInstaller(definitionFor(command));
    await app.currentPage.onKey(key("down"));
    await app.currentPage.onKey(key("enter"));
    return app;
  }

  const success = await createAppFor("exit 0");
  for (let attempt = 0; attempt < 30 && success.currentPage.name !== "timezone"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(success.currentPage.name, "timezone");
  assert.equal(success.currentPage.state.selected, 0);
  await success.currentPage.onKey(key("enter"));
  for (let attempt = 0; attempt < 30 && success.currentPage.name !== "time-sync"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(success.currentPage.name, "time-sync");
  for (let attempt = 0; attempt < 30 && success.currentPage.name !== "partition"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(success.currentPage.name, "partition");
  assert.equal(success.currentPage.state.diskLines[0], "/dev/test 10G disk TestDisk");
  assert.match(renderView(success.currentPage.render(), 80, 24, { color: false }).join("\n"), /打开 cfdisk/);
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.currentPage.state.opened, true);
  assert.equal(success.currentPage.state.exitCode, 0);
  assert.equal(success.currentPage.state.awaitingDecision, true);
  assert.equal(success.currentPage.state.decisionSelected, 0);
  assert.match(success.currentPage.state.status, /cfdisk 已退出/);

  await success.currentPage.onKey(key("enter"));
  assert.equal(success.currentPage.name, "partition");
  assert.equal(success.currentPage.state.awaitingDecision, false);
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.currentPage.state.awaitingDecision, true);
  await success.currentPage.onKey(key("down"));
  assert.equal(success.currentPage.state.decisionSelected, 1);
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.currentPage.name, "partition-next");
  assert.deepEqual(success.currentPage.state.partitionLines, [
    "/dev/test1  1G  ext4  -",
    "/dev/test2  512M  vfat  /mnt/boot",
    "下一步"
  ]);
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.currentPage.name, "partition-config");
  assert.equal(success.currentPage.params.partitionLine, "/dev/test1  1G  ext4  -");
  await success.currentPage.onKey(key("down"));
  assert.equal(success.currentPage.state.mountModeSelected, 1);
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.currentPage.state.focus, "format");
  await success.currentPage.onKey(key("down"));
  assert.equal(success.currentPage.state.formatSelected, 1);
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.currentPage.name, "partition-next");
  assert.deepEqual(success.data.install.mountPlan, [
    {
      partition: "/dev/test1  1G  ext4  -",
      mount: "root",
      mountPoint: "/mnt",
      customMountPoint: "",
      format: "ext4"
    }
  ]);
  assert.equal(success.data.install.mountPlanTsv, "/dev/test1  1G  ext4  -\troot\t/mnt\text4\n");
  assert.equal(success.data.install.hasRoot, true);
  assert.equal(success.data.install.hasBoot, false);
  await success.currentPage.onKey(key("down"));
  await success.currentPage.onKey(key("down"));
  assert.equal(success.currentPage.state.selected, 2);
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.data.install.partitionReady, false);
  assert.match(success.currentPage.state.status, /必须先配置/);
  await success.currentPage.onKey(key("up"));
  assert.equal(success.currentPage.state.selected, 1);
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.currentPage.name, "partition-config");
  await success.currentPage.onKey(key("down"));
  await success.currentPage.onKey(key("down"));
  await success.currentPage.onKey(key("enter"));
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.currentPage.name, "partition-next");
  assert.equal(success.data.install.hasBoot, true);
  assert.equal(
    success.data.install.mountPlanTsv,
    "/dev/test1  1G  ext4  -\troot\t/mnt\text4\n/dev/test2  512M  vfat  /mnt/boot\tboot\t/mnt/boot\tpreserve\n"
  );
  await success.currentPage.onKey(key("down"));
  assert.equal(success.currentPage.state.selected, 2);
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.data.install.partitionReady, true);
  assert.equal(success.currentPage.name, "user-hostname");
  assert.match(renderView(success.currentPage.render(), 80, 24, { color: false }).join("\n"), /用户名/);
  success.currentPage.state.username = "arch";
  success.currentPage.state.password = "secret";
  success.currentPage.state.passwordConfirm = "secret";
  success.currentPage.state.hostname = "archlinux";
  await success.currentPage.onKey(key("enter"));
  await success.currentPage.onKey(key("enter"));
  await success.currentPage.onKey(key("enter"));
  await success.currentPage.onKey(key("enter"));
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.data.install.newUser.name, "arch");
  assert.equal(success.data.install.newUser.password, "secret");
  assert.equal(success.data.install.rootPassword, "secret");
  assert.equal(success.data.install.rootPasswordSameAsUser, true);
  assert.equal(success.data.install.hostname, "archlinux");
  assert.equal(success.data.install.userReady, true);
  assert.equal(success.currentPage.name, "install-profile");
  assert.match(renderView(success.currentPage.render(), 80, 24, { color: false }).join("\n"), /基础安装/);
  assert.equal(success.currentPage.state.selected, 0);
  assert.equal(success.data.install.installProfileReady, false);

  await success.currentPage.onKey(key("enter"));
  assert.equal(success.data.install.installProfileReady, true);
  assert.equal(success.data.install.installProfile.type, "basic");
  assert.equal(success.data.install.installProfile.label, "基础安装");
  assert.equal(success.data.install.installProfile.custom, false);
  assert.deepEqual(success.data.install.installProfile.packages, []);
  assert.equal(success.currentPage.name, "install-run");
  assert.match(renderView(success.currentPage.render(), 80, 24, { color: false }).join("\n"), /install-basic\.sh/);

  await success.currentPage.onKey(key("escape"));
  assert.equal(success.currentPage.name, "install-profile");
  await success.currentPage.onKey(key("escape"));
  assert.equal(success.currentPage.name, "user-hostname");
  success.currentPage.state.rootPasswordModeSelected = 1;
  success.currentPage.state.rootPassword = "root-secret";
  success.currentPage.state.rootPasswordConfirm = "root-secret";
  success.currentPage.state.focus = "hostname";
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.currentPage.name, "install-profile");
  assert.equal(success.data.install.rootPassword, "root-secret");
  assert.equal(success.data.install.rootPasswordSameAsUser, false);
  await success.currentPage.onKey(key("down"));
  assert.equal(success.currentPage.state.selected, 1);
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.data.install.installProfile.type, "full");
  assert.equal(success.data.install.installProfile.label, "完整安装");
  assert.equal(success.data.install.installProfile.custom, false);
  assert.deepEqual(success.data.install.installProfile.packages, []);
  assert.equal(success.currentPage.name, "install-run");
  assert.match(renderView(success.currentPage.render(), 80, 24, { color: false }).join("\n"), /install-full\.sh/);
  await success.currentPage.onKey(key("escape"));
  assert.equal(success.currentPage.name, "install-profile");
  await success.currentPage.onKey(key("down"));
  assert.equal(success.currentPage.state.selected, 2);
  await success.currentPage.onKey(key("enter"));
  assert.equal(success.data.install.installProfile.type, "custom");
  assert.equal(success.data.install.installProfile.label, "自定义安装");
  assert.equal(success.data.install.installProfile.custom, true);
  assert.equal(success.currentPage.name, "install-run");
  assert.match(renderView(success.currentPage.render(), 80, 24, { color: false }).join("\n"), /install-custom\.sh/);
  await success.currentPage.onKey(key("escape"));
  assert.equal(success.currentPage.name, "install-profile");
  await success.currentPage.onKey(key("escape"));
  assert.equal(success.currentPage.name, "user-hostname");
  await success.currentPage.onKey(key("escape"));
  assert.equal(success.currentPage.name, "partition-next");
  await success.currentPage.onKey(key("escape"));
  assert.equal(success.currentPage.name, "partition");
  success.quit();

  const failure = await createAppFor("exit 7");
  for (let attempt = 0; attempt < 30 && !failure.currentPage.state.iserror; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(failure.currentPage.name, "First Info");
  assert.equal(failure.currentPage.state.exitCode, 7);
  assert.equal(failure.currentPage.state.iserror, true);
  assert.match(failure.currentPage.state.pstatus, /退出码 7/);
  failure.quit();
});

test("arch installer mount selection lists partitions from every disk", async () => {
  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), "page-tui-fake-bin-"));
  writeExecutable(
    path.join(fakeBin, "lsblk"),
    `#!/bin/sh
set -eu
args="$*"
case "$args" in
  *NAME,SIZE,TYPE,MODEL*)
    printf '/dev/diskA 100G disk DiskA\\n/dev/diskB 20G disk DiskB\\n'
    ;;
  *NAME,SIZE,FSTYPE,TYPE,MOUNTPOINT*)
    case "$args" in
      */dev/diskA*)
        printf '/dev/diskA1 80G ext4 part\\n'
        ;;
      */dev/diskB*)
        printf '/dev/diskB1 512M vfat part\\n'
        ;;
      *)
        printf '/dev/diskA1 80G ext4 part\\n/dev/diskB1 512M vfat part\\n'
        ;;
    esac
    ;;
  *)
    exit 2
    ;;
esac
`
  );
  writeExecutable(path.join(fakeBin, "cfdisk"), "#!/bin/sh\nexit 0\n");

  const definition = installerDefinition();
  const wiredActions = definition.pages["First Info"].keys.enter[0].if.else[0].if.else;
  wiredActions.find((action) => action.call).call.sh = "exit 0";
  const timezoneActions = definition.pages.timezone.keys.enter[0].if.else[0].if.else;
  timezoneActions.find((action) => action.call).call.sh = "exit 0";
  definition.pages["time-sync"].on.enter[0].call.sh = "exit 0";

  const app = await startInstaller(definition, {
    env: { PATH: `${fakeBin}${path.delimiter}${process.env.PATH || ""}` }
  });

  await app.currentPage.onKey(key("down"));
  await app.currentPage.onKey(key("enter"));
  for (let attempt = 0; attempt < 30 && app.currentPage.name !== "timezone"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(app.currentPage.name, "timezone");
  await app.currentPage.onKey(key("enter"));
  for (let attempt = 0; attempt < 30 && app.currentPage.name !== "partition"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  for (let attempt = 0; attempt < 30 && app.currentPage.state.diskLines.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.equal(app.currentPage.name, "partition");
  assert.deepEqual(app.currentPage.state.diskLines, [
    "/dev/diskA 100G disk DiskA",
    "/dev/diskB 20G disk DiskB"
  ]);

  await app.currentPage.onKey(key("enter"));
  assert.equal(app.currentPage.state.awaitingDecision, true);
  await app.currentPage.onKey(key("down"));
  await app.currentPage.onKey(key("enter"));

  assert.equal(app.currentPage.name, "partition-next");
  for (let attempt = 0; attempt < 30 && app.currentPage.state.partitionLines.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.deepEqual(app.currentPage.state.partitionLines, [
    "/dev/diskA1  80G  ext4  -",
    "/dev/diskB1  512M  vfat  -",
    "下一步"
  ]);

  await app.currentPage.onKey(key("enter"));
  await app.currentPage.onKey(key("down"));
  await app.currentPage.onKey(key("enter"));
  await app.currentPage.onKey(key("enter"));
  assert.equal(app.currentPage.name, "partition-next");
  assert.equal(app.data.install.hasRoot, true);

  await app.currentPage.onKey(key("down"));
  await app.currentPage.onKey(key("enter"));
  await app.currentPage.onKey(key("down"));
  await app.currentPage.onKey(key("down"));
  await app.currentPage.onKey(key("enter"));
  await app.currentPage.onKey(key("enter"));
  assert.equal(app.currentPage.name, "partition-next");
  assert.equal(app.data.install.hasBoot, true);

  await app.currentPage.onKey(key("down"));
  await app.currentPage.onKey(key("enter"));
  assert.equal(app.data.install.partitionReady, true);
  assert.equal(app.currentPage.name, "user-hostname");
  app.quit();
});

shellTest("arch installer install runner dispatches the selected script with saved environment", async () => {
  const definition = installerDefinition();
  const calls = shellCalls(definition.pages["install-run"].keys.enter);
  const basicCall = calls.find((call) => call.sh.includes("install-basic.sh"));
  const fullCall = calls.find((call) => call.sh.includes("install-full.sh"));
  const customCall = calls.find((call) => call.sh.includes("install-custom.sh"));
  assert.ok(basicCall);
  assert.ok(fullCall);
  assert.ok(customCall);
  assert.equal(Object.hasOwn(basicCall.env, "INSTALL_PACKAGES_CSV"), false);
  assert.equal(Object.hasOwn(fullCall.env, "INSTALL_PACKAGES_CSV"), false);
  assert.equal(Object.hasOwn(customCall.env, "INSTALL_PACKAGES_CSV"), true);
  assert.equal(Object.hasOwn(basicCall.env, "MOUNT_PLAN_TSV"), true);
  assert.equal(Object.hasOwn(fullCall.env, "MOUNT_PLAN_TSV"), true);
  assert.equal(Object.hasOwn(customCall.env, "MOUNT_PLAN_TSV"), true);

  basicCall.sh = "exit 41";
  basicCall.stdio = "pipe";
  fullCall.sh = "exit 42";
  fullCall.stdio = "pipe";
  customCall.sh = [
    'test "$INSTALL_PROFILE" = "custom"',
    'test "$INSTALL_PROFILE_LABEL" = "自定义安装"',
    'test "$INSTALL_PROFILE_CUSTOM" = "true"',
    'test "$INSTALL_PACKAGES_CSV" = "base,linux,linux-firmware"',
    'test "$SYSTEM_LANG" = "zh_CN.UTF-8"',
    'test "$SYSTEM_KEYMAP" = "us"',
    'test "$ROOT_PARTITION_LINE" = "/dev/diskA1  80G  ext4  -"',
    'test "$ROOT_MOUNT_POINT" = "/mnt"',
    'test "$ROOT_FORMAT" = "ext4"',
    'test "$BOOT_PARTITION_LINE" = "/dev/diskB1  512M  vfat  -"',
    'test "$BOOT_MOUNT_POINT" = "/mnt/boot"',
    'test "$BOOT_FORMAT" = "vfat"',
    'test "$MOUNT_PLAN_COUNT" = "2"',
    'printf "%s" "$MOUNT_PLAN_TSV" | grep -F "$ROOT_PARTITION_LINE" >/dev/null',
    'printf "%s" "$MOUNT_PLAN_TSV" | grep -F "$BOOT_PARTITION_LINE" >/dev/null',
    'printf "%s" "$MOUNT_PLAN_TSV" | grep -F "$(printf "\\troot\\t/mnt\\text4")" >/dev/null',
    'printf "%s" "$MOUNT_PLAN_TSV" | grep -F "$(printf "\\tboot\\t/mnt/boot\\tvfat")" >/dev/null',
    'test "$NEW_USER" = "arch"',
    'test "$NEW_USER_PASSWORD" = "secret"',
    'test "$ROOT_PASSWORD" = "root-secret"',
    'test "$ROOT_PASSWORD_SAME_AS_USER" = "false"',
    'test "$HOSTNAME" = "archlinux"',
    "printf custom"
  ].join(" && ");
  customCall.stdio = "pipe";
  customCall.stdout = "state.scriptOutput";

  const app = createDeclarativeApp({
    definition,
    initialPage: "install-run",
    data: {
      system: {
        lang: "zh_CN.UTF-8",
        keymap: "us"
      },
      install: {
        mountPlan: [{ partition: "/dev/diskA1" }, { partition: "/dev/diskB1" }],
        mountPlanTsv: "/dev/diskA1  80G  ext4  -\troot\t/mnt\text4\n/dev/diskB1  512M  vfat  -\tboot\t/mnt/boot\tvfat\n",
        hasRoot: true,
        hasBoot: true,
        partitionReady: true,
        rootPartition: {
          line: "/dev/diskA1  80G  ext4  -",
          format: "ext4",
          mountPoint: "/mnt"
        },
        bootPartition: {
          line: "/dev/diskB1  512M  vfat  -",
          format: "vfat",
          mountPoint: "/mnt/boot"
        },
        newUser: {
          name: "arch",
          password: "secret"
        },
        rootPassword: "root-secret",
        rootPasswordSameAsUser: false,
        hostname: "archlinux",
        userReady: true,
        installProfile: {
          type: "custom",
          label: "自定义安装",
          description: "custom",
          packages: ["base", "linux", "linux-firmware"],
          custom: true
        },
        installProfileReady: true
      }
    },
    terminal: new Terminal({ input: new FakeInput(), output: new FakeOutput() }),
    renderer: { render: () => [] }
  });

  await app.start();
  await app.currentPage.onKey(key("enter"));
  assert.equal(app.currentPage.state.exitCode, 0);
  assert.equal(app.currentPage.state.failed, false);
  assert.equal(app.currentPage.state.scriptOutput, "custom");
  assert.match(app.currentPage.state.status, /执行完成/);
  app.quit();
});
