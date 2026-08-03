const fs = require("node:fs");
const path = require("node:path");
const { createDeclarativeApp } = require("./declarative/app");

const MANIFEST_NAMES = new Set(["app.yaml", "app.yml", "page-tui.yaml", "page-tui.yml"]);
const DIRECT_MANIFESTS = [
  "app.yaml",
  "app.yml",
  "page-tui.yaml",
  "page-tui.yml",
  path.join("ui", "app.yaml"),
  path.join("ui", "app.yml")
];
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".vscode",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function parseArguments(args) {
  let manifest;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--" || argument === undefined) continue;
    if (argument === "-h" || argument === "--help") return { help: true };
    if (argument === "--manifest") {
      manifest = args[index + 1];
      if (!manifest) throw new Error("--manifest 后面需要一个 manifest 文件路径。");
      index += 1;
      continue;
    }
    if (argument.startsWith("--manifest=")) {
      manifest = argument.slice("--manifest=".length);
      if (!manifest) throw new Error("--manifest= 后面需要一个 manifest 文件路径。");
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`不认识的启动参数：${argument}`);
    if (manifest) throw new Error("只能指定一个 manifest 文件路径。");
    manifest = argument;
  }
  return { manifest };
}

function collectManifestFiles(directory, result = [], depth = 0) {
  if (depth > 5) return result;
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) collectManifestFiles(entryPath, result, depth + 1);
      continue;
    }
    if (entry.isFile() && MANIFEST_NAMES.has(entry.name)) result.push(entryPath);
  }
  return result;
}

function discoverManifest(cwd = process.cwd()) {
  for (const relativePath of DIRECT_MANIFESTS) {
    const candidate = path.resolve(cwd, relativePath);
    if (isFile(candidate)) return candidate;
  }

  const discovered = collectManifestFiles(cwd).sort();
  if (discovered.length === 1) return discovered[0];
  if (!discovered.length) {
    throw new Error(
      "找不到 Page TUI manifest。请在项目中创建 app.yaml，或运行：node src/loader.js path/to/app.yaml"
    );
  }
  throw new Error(`发现多个 Page TUI manifest，请明确指定入口：\n${discovered.join("\n")}`);
}

function resolveManifestPath(args = [], cwd = process.cwd(), env = process.env) {
  const parsed = parseArguments(args);
  if (parsed.help) return null;
  const requested = parsed.manifest || env.PAGE_TUI_MANIFEST;
  if (requested) {
    const resolved = path.resolve(cwd, requested);
    if (!isFile(resolved)) throw new Error(`找不到 Page TUI manifest：${resolved}`);
    return resolved;
  }
  return discoverManifest(cwd);
}

function printUsage() {
  console.log([
    "Page TUI loader",
    "",
    "用法：",
    "  npm start",
    "  npm start -- path/to/app.yaml",
    "  npm start -- --manifest path/to/app.yaml",
    "",
    "默认会从当前项目发现 app.yaml、app.yml、page-tui.yaml 或 page-tui.yml。"
  ].join("\n"));
}

async function main(args = process.argv.slice(2), cwd = process.cwd(), env = process.env) {
  try {
    const manifest = resolveManifestPath(args, cwd, env);
    if (!manifest) {
      printUsage();
      return null;
    }
    const app = createDeclarativeApp({ manifest });
    await app.start();
    return app;
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
    return null;
  }
}

if (require.main === module) void main();

module.exports = {
  collectManifestFiles,
  discoverManifest,
  main,
  parseArguments,
  resolveManifestPath
};
