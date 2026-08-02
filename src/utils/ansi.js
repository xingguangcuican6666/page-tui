const FOREGROUND = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
  grey: 90,
  brightBlack: 90,
  brightRed: 91,
  brightGreen: 92,
  brightYellow: 93,
  brightBlue: 94,
  brightMagenta: 95,
  brightCyan: 96,
  brightWhite: 97
};

const BACKGROUND = Object.fromEntries(
  Object.entries(FOREGROUND).map(([name, code]) => [name, code + 10])
);

function styleText(value, style, theme = {}, enabled = true) {
  if (!enabled || !style) {
    return String(value);
  }

  const resolved = typeof style === "string" ? theme[style] || {} : style;
  if (!resolved || typeof resolved !== "object") {
    return String(value);
  }

  const codes = [];
  const foreground = resolved.fg || resolved.color;
  const background = resolved.bg || resolved.background;

  if (foreground && FOREGROUND[foreground]) {
    codes.push(FOREGROUND[foreground]);
  }
  if (background && BACKGROUND[background]) {
    codes.push(BACKGROUND[background]);
  }
  if (resolved.bold) codes.push(1);
  if (resolved.dim) codes.push(2);
  if (resolved.italic) codes.push(3);
  if (resolved.underline) codes.push(4);
  if (resolved.inverse) codes.push(7);

  return codes.length ? `\u001b[${codes.join(";")}m${value}\u001b[0m` : String(value);
}

module.exports = { BACKGROUND, FOREGROUND, styleText };
