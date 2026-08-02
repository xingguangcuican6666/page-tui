const { styleText } = require("./utils/ansi");
const {
  padRight,
  stringWidth,
  truncate,
  wrapText
} = require("./utils/text");

const DEFAULT_THEME = {
  title: { fg: "cyan", bold: true },
  primary: { fg: "cyan" },
  selected: { fg: "black", bg: "cyan", bold: true },
  muted: { fg: "gray", dim: true },
  border: { fg: "gray" },
  success: { fg: "green" },
  warning: { fg: "yellow" },
  danger: { fg: "red" },
  input: { fg: "white", underline: true }
};

function node(kind, properties = {}) {
  return { kind, ...properties };
}

function asNode(value) {
  if (value == null || value === false) return null;
  if (typeof value === "object" && value.kind) return value;
  if (Array.isArray(value)) return column(value);
  return text(String(value));
}

function text(content, options = {}) {
  return node("text", { content: String(content ?? ""), options });
}

function spacer(height = 1, options = {}) {
  return node("spacer", { height: Math.max(0, Number(height) || 0), options });
}

function divider(options = {}) {
  return node("divider", { options });
}

function column(children = [], options = {}) {
  return node("column", {
    children: children.map(asNode).filter(Boolean),
    options
  });
}

function row(children = [], options = {}) {
  return node("row", {
    children: children.map(asNode).filter(Boolean),
    options
  });
}

function panel(child, options = {}) {
  return node("panel", { child: asNode(child) || text(""), options });
}

function list(items = [], options = {}) {
  const normalized = items.map((item, index) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return {
        ...item,
        label: String(item.label ?? item.title ?? item.value ?? ""),
        index
      };
    }

    return { label: String(item ?? ""), value: item, index };
  });

  return node("list", { items: normalized, options });
}

function normalizePadding(value, fallback = 0) {
  if (value == null) {
    return { top: fallback, right: fallback, bottom: fallback, left: fallback };
  }
  if (typeof value === "number") {
    return { top: value, right: value, bottom: value, left: value };
  }
  if (Array.isArray(value)) {
    if (value.length === 2) {
      return { top: value[0], right: value[1], bottom: value[0], left: value[1] };
    }
    return {
      top: value[0] || 0,
      right: value[1] || 0,
      bottom: value[2] || 0,
      left: value[3] || 0
    };
  }
  return {
    top: value.top || 0,
    right: value.right || 0,
    bottom: value.bottom || 0,
    left: value.left || 0
  };
}

function createContext(options = {}) {
  return {
    color: options.color !== false,
    theme: { ...DEFAULT_THEME, ...(options.theme || {}) }
  };
}

function lineWidth(value) {
  return stringWidth(value);
}

function padAnsiLine(value, width) {
  const currentWidth = lineWidth(value);
  if (currentWidth >= width) return value;
  return `${value}${" ".repeat(width - currentWidth)}`;
}

function blankLine(width) {
  return " ".repeat(Math.max(0, width));
}

function fitLines(lines, width, height) {
  const output = lines.slice(0, Math.max(0, height)).map((line) => padAnsiLine(line, width));
  while (output.length < height) output.push(blankLine(width));
  return output;
}

function paint(value, width, style, context) {
  const clipped = truncate(value, Math.max(0, width));
  return styleText(padRight(clipped, Math.max(0, width)), style, context.theme, context.color);
}

function naturalHeight(view, width) {
  if (!view) return 0;

  switch (view.kind) {
    case "text": {
      const padding = normalizePadding(view.options.padding);
      const contentWidth = Math.max(1, width - padding.left - padding.right);
      return padding.top + wrapText(view.content, contentWidth).length + padding.bottom;
    }
    case "spacer":
      return view.height;
    case "divider":
      return 1;
    case "list":
      return Math.max(1, view.items.length);
    case "panel": {
      const hasBorder = view.options.border !== false;
      const padding = normalizePadding(view.options.padding, hasBorder ? 1 : 0);
      return 2 + padding.top + padding.bottom + naturalHeight(
        view.child,
        Math.max(1, width - (hasBorder ? 2 : 0) - padding.left - padding.right)
      ) - (hasBorder ? 0 : 2);
    }
    case "column": {
      const padding = normalizePadding(view.options.padding);
      const contentWidth = Math.max(1, width - padding.left - padding.right);
      const gap = Math.max(0, Number(view.options.gap) || 0);
      return padding.top + padding.bottom + view.children.reduce(
        (total, child) => total + naturalHeight(child, contentWidth),
        Math.max(0, view.children.length - 1) * gap
      );
    }
    case "row": {
      const padding = normalizePadding(view.options.padding);
      return padding.top + padding.bottom + view.children.reduce(
        (max, child) => Math.max(max, naturalHeight(child, Math.max(1, width))),
        0
      );
    }
    default:
      return 0;
  }
}

function naturalWidth(view) {
  if (!view) return 0;

  switch (view.kind) {
    case "text": {
      const padding = normalizePadding(view.options.padding);
      const contentWidth = Math.max(...view.content.split("\n").map(stringWidth), 0);
      return padding.left + contentWidth + padding.right;
    }
    case "spacer":
      return 0;
    case "divider":
      return 1;
    case "list": {
      const marker = String(view.options.marker || "❯");
      return Math.max(
        1,
        ...view.items.map((item) => stringWidth(`${marker} ${item.label}`))
      );
    }
    case "panel": {
      const hasBorder = view.options.border !== false;
      const padding = normalizePadding(view.options.padding, hasBorder ? 1 : 0);
      const titleWidth = view.options.title ? stringWidth(` ${view.options.title} `) + 2 : 0;
      return (hasBorder ? 2 : 0) + padding.left + padding.right + Math.max(
        hasBorder ? titleWidth : 0,
        naturalWidth(view.child)
      );
    }
    case "column": {
      const padding = normalizePadding(view.options.padding);
      return padding.left + padding.right + Math.max(0, ...view.children.map(naturalWidth));
    }
    case "row": {
      const padding = normalizePadding(view.options.padding);
      const gap = Math.max(0, Number(view.options.gap) || 0);
      return padding.left + padding.right + view.children.reduce(
        (total, child) => total + naturalWidth(child),
        Math.max(0, view.children.length - 1) * gap
      );
    }
    default:
      return 0;
  }
}

function renderText(view, width, height, context) {
  const padding = normalizePadding(view.options.padding);
  const contentWidth = Math.max(1, width - padding.left - padding.right);
  const contentLines = wrapText(view.content, contentWidth);
  const lines = [];

  for (let index = 0; index < padding.top; index += 1) {
    lines.push(blankLine(width));
  }
  for (const contentLine of contentLines) {
    const inner = paint(contentLine, contentWidth, view.options.style, context);
    lines.push(`${" ".repeat(padding.left)}${inner}${" ".repeat(padding.right)}`);
  }
  for (let index = 0; index < padding.bottom; index += 1) {
    lines.push(blankLine(width));
  }

  return fitLines(lines, width, height);
}

function renderList(view, width, height, context) {
  const options = view.options;
  const selected = Math.min(
    Math.max(0, Number.isInteger(options.selected) ? options.selected : 0),
    Math.max(0, view.items.length - 1)
  );
  const visible = Math.max(0, height);

  if (!view.items.length) {
    return fitLines([paint(options.emptyText || "暂无内容", width, options.emptyStyle || "muted", context)], width, height);
  }

  const start = Math.min(
    Math.max(0, selected - visible + 1),
    Math.max(0, view.items.length - visible)
  );
  const lines = [];
  const marker = String(options.marker || "❯");
  const normalMarker = String(options.normalMarker || " ");
  const showIndex = Boolean(options.showIndex);

  for (let rowIndex = 0; rowIndex < visible; rowIndex += 1) {
    const itemIndex = start + rowIndex;
    if (itemIndex >= view.items.length) {
      lines.push(blankLine(width));
      continue;
    }

    const item = view.items[itemIndex];
    const isSelected = itemIndex === selected;
    const indexPrefix = showIndex ? `${String(itemIndex + 1).padStart(2, " ")} ` : "";
    const description = item.description ? ` — ${item.description}` : "";
    const content = `${isSelected ? marker : normalMarker} ${indexPrefix}${item.label}${description}`;
    const style = item.disabled
      ? options.disabledStyle || "muted"
      : isSelected
        ? options.selectedStyle || "selected"
        : item.style || options.itemStyle;
    lines.push(paint(content, width, style, context));
  }

  return fitLines(lines, width, height);
}

function renderColumn(view, width, height, context) {
  const padding = normalizePadding(view.options.padding);
  const contentWidth = Math.max(0, width - padding.left - padding.right);
  const contentHeight = Math.max(0, height - padding.top - padding.bottom);
  const gap = Math.max(0, Number(view.options.gap) || 0);
  const children = view.children;
  const gapHeight = Math.max(0, children.length - 1) * gap;
  const fixedHeight = children.reduce(
    (total, child) => total + (child.options?.flex ? 0 : naturalHeight(child, Math.max(1, contentWidth))),
    0
  );
  const flexChildren = children.filter((child) => child.options?.flex);
  const remainingForFlex = Math.max(0, contentHeight - gapHeight - fixedHeight);
  const flexHeight = flexChildren.length
    ? Math.floor(remainingForFlex / flexChildren.length)
    : 0;
  let flexRemainder = flexChildren.length ? remainingForFlex % flexChildren.length : 0;
  const lines = [];

  children.forEach((child, index) => {
    const isFlex = Boolean(child.options?.flex);
    const childHeight = isFlex
      ? flexHeight + (flexRemainder-- > 0 ? 1 : 0)
      : naturalHeight(child, Math.max(1, contentWidth));
    lines.push(...renderNode(child, contentWidth, childHeight, context));
    if (index < children.length - 1) {
      for (let gapIndex = 0; gapIndex < gap; gapIndex += 1) {
        lines.push(blankLine(contentWidth));
      }
    }
  });

  const output = [];
  for (let index = 0; index < padding.top; index += 1) output.push(blankLine(width));
  for (const line of fitLines(lines, contentWidth, contentHeight)) {
    output.push(`${" ".repeat(padding.left)}${padAnsiLine(line, contentWidth)}${" ".repeat(padding.right)}`);
  }
  for (let index = 0; index < padding.bottom; index += 1) output.push(blankLine(width));
  return fitLines(output, width, height);
}

function allocateRowWidths(children, width, gap) {
  const available = Math.max(0, width - Math.max(0, children.length - 1) * gap);
  const fixed = children.reduce(
    (total, child) => total + (child.options?.flex ? 0 : Math.max(1, naturalWidth(child))),
    0
  );
  const flexChildren = children.filter((child) => child.options?.flex);
  const remaining = Math.max(0, available - fixed);
  const baseFlex = flexChildren.length ? Math.floor(remaining / flexChildren.length) : 0;
  let flexRemainder = flexChildren.length ? remaining % flexChildren.length : 0;

  return children.map((child) => {
    if (!child.options?.flex) return Math.max(1, naturalWidth(child));
    return baseFlex + (flexRemainder-- > 0 ? 1 : 0);
  });
}

function renderRow(view, width, height, context) {
  const padding = normalizePadding(view.options.padding);
  const contentWidth = Math.max(0, width - padding.left - padding.right);
  const contentHeight = Math.max(0, height - padding.top - padding.bottom);
  const gap = Math.max(0, Number(view.options.gap) || 0);
  const widths = allocateRowWidths(view.children, contentWidth, gap);
  const rendered = view.children.map((child, index) =>
    renderNode(child, widths[index], contentHeight, context)
  );
  const lines = [];

  for (let rowIndex = 0; rowIndex < contentHeight; rowIndex += 1) {
    const parts = rendered.map((childLines, childIndex) =>
      padAnsiLine(childLines[rowIndex] || blankLine(widths[childIndex]), widths[childIndex])
    );
    lines.push(parts.join(" ".repeat(gap)));
  }

  const output = [];
  for (let index = 0; index < padding.top; index += 1) output.push(blankLine(width));
  for (const line of lines) {
    output.push(`${" ".repeat(padding.left)}${line}${" ".repeat(padding.right)}`);
  }
  for (let index = 0; index < padding.bottom; index += 1) output.push(blankLine(width));
  return fitLines(output, width, height);
}

function renderPanel(view, width, height, context) {
  const hasBorder = view.options.border !== false;
  const padding = normalizePadding(view.options.padding, hasBorder ? 1 : 0);

  if (!hasBorder) {
    const innerWidth = Math.max(0, width - padding.left - padding.right);
    const innerHeight = Math.max(0, height - padding.top - padding.bottom);
    const childLines = renderNode(view.child, innerWidth, innerHeight, context);
    const lines = [];
    for (let index = 0; index < padding.top; index += 1) lines.push(blankLine(width));
    for (const childLine of childLines) {
      lines.push(`${" ".repeat(padding.left)}${padAnsiLine(childLine, innerWidth)}${" ".repeat(padding.right)}`);
    }
    for (let index = 0; index < padding.bottom; index += 1) lines.push(blankLine(width));
    return fitLines(lines, width, height);
  }

  if (width < 2 || height < 2) {
    return fitLines(renderNode(view.child, width, height, context), width, height);
  }

  const options = view.options;
  const border = options.border === "single"
    ? { topLeft: "┌", topRight: "┐", bottomLeft: "└", bottomRight: "┘", horizontal: "─", vertical: "│" }
    : { topLeft: "╭", topRight: "╮", bottomLeft: "╰", bottomRight: "╯", horizontal: "─", vertical: "│" };
  const innerWidth = Math.max(0, width - 2 - padding.left - padding.right);
  const innerHeight = Math.max(0, height - 2 - padding.top - padding.bottom);
  const childLines = renderNode(view.child, innerWidth, innerHeight, context);
  const borderStyle = options.borderStyle || "border";
  const title = options.title ? ` ${truncate(options.title, Math.max(0, width - 4))} ` : "";
  const titleWidth = stringWidth(title);
  const topRemaining = Math.max(0, width - 2 - titleWidth);
  const top = `${styleText(border.topLeft, borderStyle, context.theme, context.color)}${
    title ? styleText(title, options.titleStyle || "title", context.theme, context.color) : ""
  }${styleText(border.horizontal.repeat(topRemaining), borderStyle, context.theme, context.color)}${styleText(border.topRight, borderStyle, context.theme, context.color)}`;
  const bottom = styleText(
    `${border.bottomLeft}${border.horizontal.repeat(Math.max(0, width - 2))}${border.bottomRight}`,
    borderStyle,
    context.theme,
    context.color
  );
  const lines = [top];

  for (let index = 0; index < padding.top; index += 1) {
    lines.push(`${styleText(border.vertical, borderStyle, context.theme, context.color)}${blankLine(width - 2)}${styleText(border.vertical, borderStyle, context.theme, context.color)}`);
  }
  for (const childLine of childLines) {
    const content = `${" ".repeat(padding.left)}${padAnsiLine(childLine, innerWidth)}${" ".repeat(padding.right)}`;
    lines.push(`${styleText(border.vertical, borderStyle, context.theme, context.color)}${content}${styleText(border.vertical, borderStyle, context.theme, context.color)}`);
  }
  for (let index = 0; index < padding.bottom; index += 1) {
    lines.push(`${styleText(border.vertical, borderStyle, context.theme, context.color)}${blankLine(width - 2)}${styleText(border.vertical, borderStyle, context.theme, context.color)}`);
  }
  lines.push(bottom);

  return fitLines(lines, width, height);
}

function renderNode(view, width, height, context) {
  const normalizedWidth = Math.max(0, Number(width) || 0);
  const normalizedHeight = Math.max(0, Number(height) || 0);
  if (!view || normalizedHeight === 0) return [];

  switch (view.kind) {
    case "text":
      return renderText(view, normalizedWidth, normalizedHeight, context);
    case "spacer":
      return fitLines([], normalizedWidth, Math.min(normalizedHeight, view.height));
    case "divider": {
      const character = String(view.options.character || "─").slice(0, 1) || "─";
      return fitLines([
        paint(character.repeat(Math.max(0, normalizedWidth)), normalizedWidth, view.options.style || "border", context)
      ], normalizedWidth, normalizedHeight);
    }
    case "list":
      return renderList(view, normalizedWidth, normalizedHeight, context);
    case "column":
      return renderColumn(view, normalizedWidth, normalizedHeight, context);
    case "row":
      return renderRow(view, normalizedWidth, normalizedHeight, context);
    case "panel":
      return renderPanel(view, normalizedWidth, normalizedHeight, context);
    default:
      return fitLines([blankLine(normalizedWidth)], normalizedWidth, normalizedHeight);
  }
}

function renderView(view, width, height, options = {}) {
  const normalized = asNode(view) || text("");
  return renderNode(normalized, Math.max(0, width), Math.max(0, height), createContext(options));
}

module.exports = {
  DEFAULT_THEME,
  asNode,
  column,
  divider,
  list,
  naturalHeight,
  naturalWidth,
  panel,
  renderView,
  row,
  spacer,
  text
};
