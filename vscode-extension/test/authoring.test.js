const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const extensionRoot = path.join(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"));
const extensionSource = fs.readFileSync(path.join(extensionRoot, "extension.js"), "utf8");

class CompletionItem {
  constructor(label, kind) {
    this.label = label;
    this.kind = kind;
  }
}

class SnippetString {
  constructor(value) {
    this.value = value;
  }
}

class MarkdownString {
  constructor(value) {
    this.value = value;
  }
}

const vscodeMock = {
  CompletionItem,
  CompletionItemKind: {
    Event: "event",
    Keyword: "keyword",
    Property: "property",
    Reference: "reference",
    Value: "value",
    Variable: "variable"
  },
  MarkdownString,
  SnippetString
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "vscode") return vscodeMock;
  return originalLoad.call(this, request, parent, isMain);
};

const { provideCompletions } = require("../extension");
Module._load = originalLoad;

function documentFrom(lines, languageId = "yaml") {
  return {
    fileName: "/workspace/ui/app.yaml",
    languageId,
    lineAt(line) {
      return { text: lines[line] };
    },
    getText() {
      return lines.join("\n");
    }
  };
}

test("app.yaml activates for the normal YAML language too", () => {
  assert.equal(packageJson.activationEvents.includes("onLanguage:yaml"), true);
});

test("page fields are suggested on an empty page line", () => {
  const document = documentFrom([
    "pages:",
    "  home:",
    "    "
  ]);
  const items = provideCompletions(document, { line: 2, character: 4 });
  assert.equal(items.some((item) => item.label === "state"), true);
  assert.equal(items.some((item) => item.label === "layout"), true);
  assert.equal(items.some((item) => item.label === "keys"), true);
});

test("the extension does not provide AI inline text", () => {
  assert.equal(extensionSource.includes("registerInlineCompletionItemProvider"), false);
});
