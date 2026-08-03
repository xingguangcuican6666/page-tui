const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { discoverManifest, resolveManifestPath } = require("../src/loader");

function tempProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "page-tui-loader-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("loader 优先发现项目根目录的 app.yaml", (t) => {
  const directory = tempProject(t);
  fs.mkdirSync(path.join(directory, "examples", "nested"), { recursive: true });
  fs.writeFileSync(path.join(directory, "app.yaml"), "initial: home\n");
  fs.writeFileSync(path.join(directory, "examples", "nested", "app.yaml"), "initial: nested\n");

  assert.equal(discoverManifest(directory), path.join(directory, "app.yaml"));
});

test("loader 可以从唯一的嵌套 manifest 自动启动入口", (t) => {
  const directory = tempProject(t);
  const manifest = path.join(directory, "examples", "demo", "app.yaml");
  fs.mkdirSync(path.dirname(manifest), { recursive: true });
  fs.writeFileSync(manifest, "initial: home\n");

  assert.equal(resolveManifestPath([], directory), manifest);
});

test("loader 支持显式 manifest 参数和环境变量", (t) => {
  const directory = tempProject(t);
  fs.mkdirSync(path.join(directory, "ui"), { recursive: true });
  fs.writeFileSync(path.join(directory, "ui", "app.yaml"), "initial: home\n");

  assert.equal(resolveManifestPath(["--manifest", "ui/app.yaml"], directory), path.join(directory, "ui", "app.yaml"));
  assert.equal(resolveManifestPath([], directory, { PAGE_TUI_MANIFEST: "ui/app.yaml" }), path.join(directory, "ui", "app.yaml"));
});

test("多个 manifest 时要求显式指定入口", (t) => {
  const directory = tempProject(t);
  for (const name of ["one", "two"]) {
    const manifest = path.join(directory, "examples", name, "app.yaml");
    fs.mkdirSync(path.dirname(manifest), { recursive: true });
    fs.writeFileSync(manifest, "initial: home\n");
  }

  assert.throws(
    () => discoverManifest(directory),
    /发现多个 Page TUI manifest/
  );
});
