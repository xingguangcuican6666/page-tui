const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const YAML = require("yaml");
const esbuild = require("esbuild");

const MANIFEST_NAMES = new Set(["app.yaml", "app.yml", "page-tui.yaml", "page-tui.yml"]);

function executableName(name) {
  const sanitized = String(name || "page-tui")
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "page-tui";
  if (process.platform === "win32" && !sanitized.toLowerCase().endsWith(".exe")) return `${sanitized}.exe`;
  return sanitized;
}

function withExecutableExtension(filePath) {
  if (process.platform !== "win32") return filePath;
  if (path.extname(filePath).toLowerCase() === ".exe") return filePath;
  return `${filePath}.exe`;
}

function outputName(manifest) {
  if (!manifest) return executableName("page-tui");
  const absolute = path.resolve(manifest);
  const fileName = path.basename(absolute);
  if (MANIFEST_NAMES.has(fileName)) return executableName(path.basename(path.dirname(absolute)));
  return executableName(fileName);
}

function nodeMajorVersion() {
  return Number(process.versions.node.split(".")[0]);
}

function printUsage() {
  console.log([
    "Page TUI binary builder",
    "",
    "用法：",
    "  npm run build -- --manifest examples/arch_installer/app.yaml",
    "  npm run build -- examples/arch_installer/app.yaml",
    "  npm run build -- --manifest ui/app.yaml --output dist/my-app",
    "",
    "不指定 manifest 时会构建通用 runner：dist/page-tui。"
  ].join("\n"));
}

function parseArguments(args = process.argv.slice(2)) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--" || argument === undefined) continue;
    if (argument === "-h" || argument === "--help") return { help: true };
    if (argument === "-o" || argument === "--output") {
      options.output = args[index + 1];
      if (!options.output) throw new Error(`${argument} 后面需要一个输出文件路径。`);
      index += 1;
      continue;
    }
    if (argument.startsWith("--output=")) {
      options.output = argument.slice("--output=".length);
      if (!options.output) throw new Error("--output= 后面需要一个输出文件路径。");
      continue;
    }
    if (argument === "--manifest") {
      options.manifest = args[index + 1];
      if (!options.manifest) throw new Error("--manifest 后面需要一个 manifest 文件路径。");
      index += 1;
      continue;
    }
    if (argument.startsWith("--manifest=")) {
      options.manifest = argument.slice("--manifest=".length);
      if (!options.manifest) throw new Error("--manifest= 后面需要一个 manifest 文件路径。");
      continue;
    }
    if (argument.startsWith("-")) throw new Error(`不认识的构建参数：${argument}`);
    if (options.manifest) throw new Error("只能指定一个 manifest 文件路径。");
    options.manifest = argument;
  }
  return options;
}

async function readDocument(filePath) {
  const source = await fs.readFile(filePath, "utf8");
  if (filePath.endsWith(".json")) return JSON.parse(source);
  return YAML.parse(source);
}

function assertDocumentObject(document, filePath) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`Page TUI 文件必须是 YAML/JSON 对象：${filePath}`);
  }
}

async function inlineManifest(manifest) {
  const manifestPath = path.resolve(manifest);
  const document = await readDocument(manifestPath);
  assertDocumentObject(document, manifestPath);
  if (!document.pages || typeof document.pages !== "object" || Array.isArray(document.pages)) {
    throw new Error(`standalone 构建需要 manifest.pages 对象：${manifestPath}`);
  }

  const baseDir = path.dirname(manifestPath);
  const pages = {};
  for (const [name, source] of Object.entries(document.pages)) {
    if (typeof source === "string") {
      const pagePath = path.resolve(baseDir, source);
      const pageDocument = await readDocument(pagePath);
      assertDocumentObject(pageDocument, pagePath);
      pages[name] = pageDocument;
      continue;
    }
    assertDocumentObject(source, `${manifestPath}#pages.${name}`);
    pages[name] = source;
  }

  const i18n = await inlineI18n(document.i18n, baseDir);

  return {
    ...document,
    pages,
    ...(i18n ? { i18n } : {})
  };
}

async function inlineI18n(definition, baseDir) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) return undefined;
  const sources = definition.locales || definition.files || definition.sources;
  if (!sources || typeof sources !== "object" || Array.isArray(sources)) return definition;

  const locales = {};
  for (const [locale, source] of Object.entries(sources)) {
    if (typeof source === "string") {
      const filePath = path.resolve(baseDir, source);
      const localeDocument = await readDocument(filePath);
      assertDocumentObject(localeDocument, filePath);
      locales[locale] = localeDocument;
    } else {
      assertDocumentObject(source, `${baseDir}#i18n.${locale}`);
      locales[locale] = source;
    }
  }

  const result = { ...definition, locales };
  delete result.files;
  delete result.sources;
  return result;
}

function standaloneEntrySource(rootDir, manifest, definition, binaryName) {
  const appModule = path.join(rootDir, "src", "declarative", "app.js");
  const manifestLabel = path.relative(rootDir, path.resolve(manifest));
  const appName = binaryName || outputName(manifest);
  const pageTitle = definition.pages?.[definition.initial]?.title;
  const title = typeof pageTitle === "string" ? pageTitle : definition.initial || appName;

  return `"use strict";

const { createDeclarativeApp } = require(${JSON.stringify(appModule)});

const definition = ${JSON.stringify(definition, null, 2)};
const appName = ${JSON.stringify(appName)};
const title = ${JSON.stringify(title)};
const manifestLabel = ${JSON.stringify(manifestLabel)};

function printUsage() {
  console.log([
    title,
    "",
    "用法：",
    "  " + appName,
    "",
    "这个二进制已经内嵌 Page TUI 运行时和 manifest：",
    "  " + manifestLabel
  ].join("\\n"));
}

async function main() {
  if (process.argv.includes("-h") || process.argv.includes("--help")) {
    printUsage();
    return;
  }
  const app = createDeclarativeApp({ definition });
  await app.start();
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
`;
}

async function writeEntryPoint(options, rootDir, workDir, binaryName) {
  if (!options.manifest) return path.join(rootDir, "src", "loader.js");

  const definition = await inlineManifest(options.manifest);
  const entryPath = path.join(workDir, "standalone-entry.cjs");
  await fs.writeFile(entryPath, standaloneEntrySource(rootDir, options.manifest, definition, binaryName));
  return entryPath;
}

function resolveBinaryPath(options, rootDir) {
  if (options.output) return withExecutableExtension(path.resolve(rootDir, options.output));
  return path.join(rootDir, "dist", outputName(options.manifest));
}

async function build(options = {}) {
  if (nodeMajorVersion() < 26) {
    throw new Error("构建二进制需要 Node.js 26 或更高版本，因为要使用 node --build-sea。");
  }

  const rootDir = path.resolve(__dirname, "..");
  const distDir = path.join(rootDir, "dist");
  const workDir = path.join(distDir, ".sea");
  const bundlePath = path.join(workDir, "entry.cjs");
  const configPath = path.join(workDir, "sea-config.json");
  const binaryPath = resolveBinaryPath(options, rootDir);

  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });
  await fs.mkdir(path.dirname(binaryPath), { recursive: true });
  await fs.rm(binaryPath, { force: true });

  const entryPoint = await writeEntryPoint(options, rootDir, workDir, path.basename(binaryPath));

  await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node26",
    outfile: bundlePath,
    logLevel: "silent",
    legalComments: "none"
  });

  await fs.writeFile(
    configPath,
    JSON.stringify(
      {
        main: bundlePath,
        output: binaryPath,
        disableExperimentalSEAWarning: true
      },
      null,
      2
    )
  );

  const result = spawnSync(process.execPath, ["--build-sea", configPath], {
    cwd: rootDir,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error("SEA 二进制构建失败。");
  }

  if (process.platform !== "win32") {
    await fs.chmod(binaryPath, 0o755);
  }

  await fs.rm(workDir, { recursive: true, force: true });

  console.log(`已生成：${path.relative(rootDir, binaryPath)}`);
  if (options.manifest) {
    console.log(`已内嵌 manifest：${path.relative(rootDir, path.resolve(options.manifest))}`);
  }
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    printUsage();
    return;
  }
  await build(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  build,
  executableName,
  inlineI18n,
  inlineManifest,
  outputName,
  parseArguments,
  standaloneEntrySource
};
