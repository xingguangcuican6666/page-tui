const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { inlineManifest, outputName, parseArguments, standaloneEntrySource } = require("../scripts/build-sea");

test("standalone build arguments accept manifest and output paths", () => {
  assert.deepEqual(parseArguments(["--manifest", "ui/app.yaml", "--output", "dist/demo"]), {
    manifest: "ui/app.yaml",
    output: "dist/demo"
  });
  assert.deepEqual(parseArguments(["examples/arch_installer/app.yaml"]), {
    manifest: "examples/arch_installer/app.yaml"
  });
});

test("standalone output name is based on manifest directory", () => {
  assert.equal(outputName(path.join("examples", "arch_installer", "app.yaml")), process.platform === "win32" ? "arch_installer.exe" : "arch_installer");
  assert.equal(outputName(path.join("apps", "todo.yaml")), process.platform === "win32" ? "todo.exe" : "todo");
});

test("standalone manifest inlines external page files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "page-tui-build-"));
  await fs.mkdir(path.join(directory, "pages"));
  const manifest = path.join(directory, "app.yaml");
  await fs.writeFile(
    manifest,
    [
      "initial: home",
      "data:",
      "  items: []",
      "pages:",
      "  home: pages/home.yaml"
    ].join("\n")
  );
  await fs.writeFile(
    path.join(directory, "pages", "home.yaml"),
    [
      "title: Home",
      "state:",
      "  selected: 0",
      "layout:",
      "  type: text",
      "  value: Hello",
      "keys: {}"
    ].join("\n")
  );

  const definition = await inlineManifest(manifest);
  assert.equal(definition.initial, "home");
  assert.equal(definition.pages.home.title, "Home");
  assert.equal(typeof definition.pages.home, "object");
});

test("standalone manifest inlines external locale files", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "page-tui-build-i18n-"));
  await fs.mkdir(path.join(directory, "locales"));
  const manifest = path.join(directory, "app.yaml");
  await fs.writeFile(manifest, [
    "initial: home",
    "data:",
    "  locale: en",
    "i18n:",
    "  locale: data.locale",
    "  fallback: en",
    "  locales:",
    "    en: locales/en.yaml",
    "pages:",
    "  home:",
    "    layout:",
    "      type: text",
    "      value:",
    "        t: home.title"
  ].join("\n"));
  await fs.writeFile(path.join(directory, "locales", "en.yaml"), "home:\n  title: Embedded locale\n");

  const definition = await inlineManifest(manifest);
  assert.equal(definition.i18n.locales.en.home.title, "Embedded locale");
  assert.equal(typeof definition.i18n.locales.en, "object");
});

test("standalone help does not stringify translated page titles as objects", () => {
  const source = standaloneEntrySource(
    process.cwd(),
    "examples/i18n/app.yaml",
    {
      initial: "home",
      pages: { home: { title: { t: "app.title" } } }
    },
    "i18n-example"
  );

  assert.doesNotMatch(source, /\[object Object\]/);
  assert.match(source, /const title = "home"/);
});
