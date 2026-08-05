const path = require("node:path");
const esbuild = require("esbuild");

const root = path.resolve(__dirname, "..");

esbuild.build({
  entryPoints: [path.join(root, "webview", "workflow-editor.jsx")],
  outfile: path.join(root, "media", "workflow-editor.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome120"],
  jsx: "automatic",
  minify: true,
  legalComments: "none",
  sourcemap: false
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
