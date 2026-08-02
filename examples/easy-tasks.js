const path = require("node:path");
const { createDeclarativeApp } = require("..");

const app = createDeclarativeApp({
  manifest: path.join(__dirname, "easy-tasks", "app.yaml")
});

app.start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
