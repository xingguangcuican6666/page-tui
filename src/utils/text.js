const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;

const COMBINING_RANGES = [
  [0x0300, 0x036f],
  [0x0483, 0x0489],
  [0x0591, 0x05bd],
  [0x05bf, 0x05bf],
  [0x05c1, 0x05c2],
  [0x05c4, 0x05c5],
  [0x0610, 0x061a],
  [0x064b, 0x065f],
  [0x0670, 0x0670],
  [0x06d6, 0x06dc],
  [0x06df, 0x06e4],
  [0x06e7, 0x06e8],
  [0x06ea, 0x06ed],
  [0x0711, 0x0711],
  [0x0730, 0x074a],
  [0x07a6, 0x07b0],
  [0x07eb, 0x07f3],
  [0x0816, 0x0819],
  [0x081b, 0x0823],
  [0x0825, 0x0827],
  [0x0829, 0x082d],
  [0x0859, 0x085b],
  [0x08d3, 0x0903],
  [0x093a, 0x093c],
  [0x093e, 0x094f],
  [0x0951, 0x0957],
  [0x0962, 0x0963],
  [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff],
  [0x20d0, 0x20ff],
  [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f],
  [0xe0100, 0xe01ef]
];

const WIDE_RANGES = [
  [0x1100, 0x115f],
  [0x231a, 0x231b],
  [0x2329, 0x232a],
  [0x23e9, 0x23ec],
  [0x23f0, 0x23f0],
  [0x23f3, 0x23f3],
  [0x25fd, 0x25fe],
  [0x2614, 0x2615],
  [0x2648, 0x2653],
  [0x267f, 0x267f],
  [0x2693, 0x2693],
  [0x26a1, 0x26a1],
  [0x26aa, 0x26ab],
  [0x26bd, 0x26be],
  [0x26c4, 0x26c5],
  [0x26ce, 0x26ce],
  [0x26d4, 0x26d4],
  [0x26ea, 0x26ea],
  [0x26f2, 0x26f3],
  [0x26f5, 0x26f5],
  [0x26fa, 0x26fa],
  [0x26fd, 0x26fd],
  [0x2705, 0x2705],
  [0x270a, 0x270b],
  [0x2728, 0x2728],
  [0x274c, 0x274c],
  [0x274e, 0x274e],
  [0x2753, 0x2755],
  [0x2757, 0x2757],
  [0x2795, 0x2797],
  [0x27b0, 0x27b0],
  [0x27bf, 0x27bf],
  [0x2b1b, 0x2b1c],
  [0x2b50, 0x2b50],
  [0x2b55, 0x2b55],
  [0x2e80, 0x2ffb],
  [0x3000, 0x303e],
  [0x3040, 0x3247],
  [0x3250, 0x4dbf],
  [0x4e00, 0xa4c6],
  [0xa960, 0xa97c],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe10, 0xfe19],
  [0xfe30, 0xfe6b],
  [0xff01, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f004, 0x1f004],
  [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e],
  [0x1f191, 0x1f19a],
  [0x1f200, 0x1f251],
  [0x1f300, 0x1f64f],
  [0x1f680, 0x1f6ff],
  [0x1f900, 0x1faff],
  [0x20000, 0x3fffd]
];

function inRanges(codePoint, ranges) {
  return ranges.some(([start, end]) => codePoint >= start && codePoint <= end);
}

function stripAnsi(value) {
  return String(value).replace(ANSI_PATTERN, "");
}

function charWidth(character) {
  const codePoint = character.codePointAt(0);

  if (!codePoint || codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) {
    return 0;
  }

  if (inRanges(codePoint, COMBINING_RANGES)) {
    return 0;
  }

  return inRanges(codePoint, WIDE_RANGES) ? 2 : 1;
}

function stringWidth(value) {
  let width = 0;
  for (const character of stripAnsi(value)) {
    width += charWidth(character);
  }
  return width;
}

function takeByWidth(value, maxWidth) {
  const input = stripAnsi(value);
  if (maxWidth <= 0) {
    return { head: "", rest: input };
  }

  let width = 0;
  let index = 0;
  for (const character of input) {
    const nextWidth = charWidth(character);
    if (width + nextWidth > maxWidth) {
      break;
    }
    width += nextWidth;
    index += character.length;
  }

  return { head: input.slice(0, index), rest: input.slice(index) };
}

function wrapText(value, maxWidth) {
  const width = Math.max(1, Number(maxWidth) || 1);
  const lines = [];

  for (const originalLine of String(value).split("\n")) {
    let remaining = originalLine;

    if (remaining.length === 0) {
      lines.push("");
      continue;
    }

    while (stringWidth(remaining) > width) {
      const { head, rest } = takeByWidth(remaining, width);
      if (!head) {
        lines.push("");
        remaining = rest.slice(1);
        continue;
      }

      const breakAt = head.lastIndexOf(" ");
      if (breakAt > 0) {
        lines.push(head.slice(0, breakAt));
        remaining = `${head.slice(breakAt + 1)}${rest}`.replace(/^ +/, "");
      } else {
        lines.push(head);
        remaining = rest;
      }
    }

    lines.push(remaining);
  }

  return lines;
}

function truncate(value, maxWidth, ellipsis = "…") {
  const width = Math.max(0, Number(maxWidth) || 0);
  const input = stripAnsi(value);

  if (stringWidth(input) <= width) {
    return input;
  }

  const ellipsisWidth = stringWidth(ellipsis);
  if (width <= ellipsisWidth) {
    return takeByWidth(ellipsis, width).head;
  }

  return `${takeByWidth(input, width - ellipsisWidth).head}${ellipsis}`;
}

function padRight(value, width, fill = " ") {
  const missing = Math.max(0, width - stringWidth(value));
  return `${value}${fill.repeat(missing)}`;
}

module.exports = {
  charWidth,
  padRight,
  stringWidth,
  stripAnsi,
  takeByWidth,
  truncate,
  wrapText
};
