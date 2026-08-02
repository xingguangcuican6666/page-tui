const { KeyParser } = require("./key-parser");

class Terminal {
  constructor(options = {}) {
    this.input = options.input || process.stdin;
    this.output = options.output || process.stdout;
    this.altScreen = options.altScreen !== false;
    this.started = false;
    this.parser = null;
    this._dataHandler = null;
    this._resizeHandler = null;
    this._onKey = null;
    this._onResize = null;
  }

  get interactive() {
    return Boolean(this.input?.isTTY && this.output?.isTTY);
  }

  get size() {
    return {
      width: Number(this.output?.columns) || 80,
      height: Number(this.output?.rows) || 24,
      columns: Number(this.output?.columns) || 80,
      rows: Number(this.output?.rows) || 24
    };
  }

  start({ onKey, onResize } = {}) {
    if (this.started) return;
    this.started = true;
    this._onKey = onKey;
    this._onResize = onResize;

    if (!this.interactive) return;

    this.parser = new KeyParser((key) => this._onKey?.(key));
    this._dataHandler = (chunk) => this.parser.push(chunk);
    this.input.setEncoding?.("utf8");
    this.input.setRawMode?.(true);
    this.input.on("data", this._dataHandler);
    this.input.resume?.();

    this._resizeHandler = () => this._onResize?.(this.size);
    this.output.on?.("resize", this._resizeHandler);

    const enterAltScreen = this.altScreen ? "\u001b[?1049h" : "";
    this.output.write(`${enterAltScreen}\u001b[2J\u001b[H\u001b[?25l`);
  }

  write(value) {
    this.output.write(value);
  }

  stop() {
    if (!this.started) return;
    this.started = false;

    if (this._dataHandler) this.input.off?.("data", this._dataHandler);
    if (this._resizeHandler) this.output.off?.("resize", this._resizeHandler);
    this.parser?.dispose();
    this.parser = null;

    if (this.interactive) {
      this.input.setRawMode?.(false);
      this.input.pause?.();
      const leaveAltScreen = this.altScreen ? "\u001b[?1049l" : "";
      this.output.write(`\u001b[0m\u001b[?25h${leaveAltScreen}`);
    }
  }
}

module.exports = { Terminal };
