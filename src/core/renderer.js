const { renderView } = require("../ui");

class Renderer {
  constructor(output, options = {}) {
    this.output = output || process.stdout;
    this.color = options.color ?? Boolean(this.output.isTTY);
    this.theme = options.theme || {};
  }

  render(view, options = {}) {
    const width = Math.max(1, Number(options.width) || Number(this.output.columns) || 80);
    const height = Math.max(1, Number(options.height) || Number(this.output.rows) || 24);
    const color = options.color ?? this.color;
    const lines = renderView(view, width, height, {
      color,
      theme: { ...this.theme, ...(options.theme || {}) }
    });

    if (this.output?.isTTY) {
      const frame = lines
        .map((line, index) => `\u001b[2K${line}${index === lines.length - 1 ? "" : "\n"}`)
        .join("");
      this.output.write(`\u001b[H\u001b[2J${frame}`);
    } else {
      this.output.write(`${lines.join("\n")}\n`);
    }

    return lines;
  }
}

module.exports = { Renderer };
