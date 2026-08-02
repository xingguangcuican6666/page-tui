const { createApp, Page, ui } = require("..");

const { column, divider, list, panel, spacer, text } = ui;

const tasks = [
  { title: "设计 page 生命周期", done: true, detail: "明确 onEnter / onLeave / onResume 的职责" },
  { title: "实现键盘事件解析", done: true, detail: "支持方向键、Enter、Esc、Backspace 和 Ctrl+C" },
  { title: "写一个可运行的示例", done: false, detail: "验证页面栈、列表选择和输入页面" }
];

function isKey(key, name) {
  return key.name === name || key.value === name;
}

class HomePage extends Page {
  constructor() {
    super({ name: "home", title: "任务列表" });
    this.selected = 0;
    this.notice = "";
  }

  render() {
    const completed = tasks.filter((task) => task.done).length;
    const items = tasks.map((task) => ({
      label: `${task.done ? "✓" : "○"} ${task.title}`,
      value: task,
      style: task.done ? "muted" : undefined
    }));

    return column([
      text("PAGE TUI  /  示例应用", { style: "title", padding: [0, 1] }),
      text("↑/↓ 选择   Enter 查看   n 新建   d 删除   q 退出", { style: "muted", padding: [0, 1] }),
      divider(),
      panel(list(items, {
        selected: this.selected,
        flex: true,
        emptyText: "还没有任务"
      }), {
        title: `任务 ${completed}/${tasks.length} 已完成`,
        flex: true
      }),
      this.notice
        ? text(this.notice, { style: "success", padding: [1, 1, 0, 1] })
        : spacer(1),
      text("Page stack: " + this.app.pages.snapshot().map((page) => page.name).join(" > "), {
        style: "muted",
        padding: [0, 1]
      })
    ], { padding: [1, 2, 0, 2] });
  }

  async onKey(key) {
    if (isKey(key, "up")) {
      this.selected = Math.max(0, this.selected - 1);
      this.notice = "";
      return true;
    }
    if (isKey(key, "down")) {
      this.selected = Math.min(Math.max(0, tasks.length - 1), this.selected + 1);
      this.notice = "";
      return true;
    }
    if (isKey(key, "enter")) {
      if (tasks[this.selected]) await this.push(new DetailPage(tasks[this.selected]));
      return true;
    }
    if (isKey(key, "n")) {
      await this.push(new CreateTaskPage());
      return true;
    }
    if (isKey(key, "d")) {
      if (tasks.length === 0) return true;
      const [removed] = tasks.splice(this.selected, 1);
      this.selected = Math.min(this.selected, Math.max(0, tasks.length - 1));
      this.notice = `已删除：${removed.title}`;
      return true;
    }
    if (key.name === " ") {
      const task = tasks[this.selected];
      if (task) task.done = !task.done;
      return true;
    }
    return false;
  }
}

class DetailPage extends Page {
  constructor(task) {
    super({ name: "detail", title: task.title });
    this.task = task;
  }

  render() {
    return column([
      text("任务详情", { style: "title", padding: [0, 1] }),
      panel(column([
        text(`标题：${this.task.title}`),
        text(`状态：${this.task.done ? "已完成" : "未完成"}`),
        divider(),
        text(this.task.detail, { style: "muted" })
      ], { gap: 1 }), { title: "Detail", flex: true }),
      text("Enter 切换完成状态   Esc 返回", { style: "muted", padding: [1, 1, 0, 1] })
    ], { padding: [1, 2] });
  }

  async onKey(key) {
    if (isKey(key, "enter")) {
      this.task.done = !this.task.done;
      await this.back({ updated: true });
      return true;
    }
    if (isKey(key, "escape")) {
      await this.back();
      return true;
    }
    return false;
  }
}

class CreateTaskPage extends Page {
  constructor() {
    super({ name: "create", title: "新建任务" });
    this.value = "";
    this.error = "";
  }

  render() {
    return column([
      text("新建任务", { style: "title", padding: [0, 1] }),
      panel(column([
        text("任务名称"),
        text(`${this.value}▌`, { style: "input", padding: [1, 0] }),
        this.error ? text(this.error, { style: "danger" }) : spacer(1),
        text("直接输入文字；Enter 保存；Esc 取消", { style: "muted" })
      ], { gap: 1 }), { title: "Create", flex: true }),
      text("输入页也是一个普通 Page，可以自由维护自己的状态。", { style: "muted", padding: [1, 1, 0, 1] })
    ], { padding: [1, 2] });
  }

  async onKey(key) {
    if (isKey(key, "escape")) {
      await this.back();
      return true;
    }
    if (isKey(key, "backspace")) {
      this.value = Array.from(this.value).slice(0, -1).join("");
      this.error = "";
      return true;
    }
    if (isKey(key, "enter")) {
      const title = this.value.trim();
      if (!title) {
        this.error = "任务名称不能为空";
        return true;
      }
      tasks.push({ title, done: false, detail: "由示例输入页创建" });
      await this.back({ created: title });
      return true;
    }
    if (!key.ctrl && !key.meta && typeof key.value === "string" && key.value.length === 1) {
      this.value += key.value;
      this.error = "";
      return true;
    }
    return false;
  }
}

const app = createApp({
  initialPage: "home",
  routes: {
    home: () => new HomePage()
  }
});

app.start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
