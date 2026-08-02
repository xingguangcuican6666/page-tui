const ESC = "\u001b";

const SEQUENCES = new Map([
  [`${ESC}[A`, { name: "up" }],
  [`${ESC}[B`, { name: "down" }],
  [`${ESC}[C`, { name: "right" }],
  [`${ESC}[D`, { name: "left" }],
  [`${ESC}[H`, { name: "home" }],
  [`${ESC}[F`, { name: "end" }],
  [`${ESC}[1~`, { name: "home" }],
  [`${ESC}[4~`, { name: "end" }],
  [`${ESC}[5~`, { name: "pageup" }],
  [`${ESC}[6~`, { name: "pagedown" }],
  [`${ESC}[3~`, { name: "delete" }],
  [`${ESC}[Z`, { name: "tab", shift: true }],
  [`${ESC}OP`, { name: "f1" }],
  [`${ESC}OQ`, { name: "f2" }],
  [`${ESC}OR`, { name: "f3" }],
  [`${ESC}OS`, { name: "f4" }]
]);

function keyFromSequence(sequence) {
  const direct = SEQUENCES.get(sequence);
  if (direct) return { ...direct, sequence, value: undefined, ctrl: false, meta: false };

  const arrow = sequence.match(/^\u001b\[1;([2356])([ABCD])$/);
  if (arrow) {
    const modifier = arrow[1];
    const name = { A: "up", B: "down", C: "right", D: "left" }[arrow[2]];
    return {
      name,
      sequence,
      value: undefined,
      ctrl: modifier === "5" || modifier === "6",
      shift: modifier === "2" || modifier === "6",
      meta: modifier === "3"
    };
  }

  return { name: "escape", sequence, value: undefined, ctrl: false, meta: false };
}

function keyFromCharacter(character) {
  const code = character.codePointAt(0);

  if (code === 3) return { name: "c", value: "c", sequence: character, ctrl: true };
  if (code === 13 || code === 10) return { name: "enter", value: undefined, sequence: character, ctrl: false };
  if (code === 9) return { name: "tab", value: "\t", sequence: character, ctrl: false };
  if (code === 8 || code === 127) return { name: "backspace", value: undefined, sequence: character, ctrl: false };
  if (code === 27) return { name: "escape", value: undefined, sequence: character, ctrl: false };

  if (code < 32) {
    const value = String.fromCodePoint(code + 96);
    return { name: value, value, sequence: character, ctrl: true };
  }

  return { name: character, value: character, sequence: character, ctrl: false, meta: false };
}

class KeyParser {
  constructor(onKey) {
    this.onKey = onKey;
    this.buffer = "";
    this.escapeTimer = null;
  }

  push(chunk) {
    this.buffer += chunk;
    this.flush();
  }

  flush() {
    while (this.buffer) {
      if (this.buffer[0] !== ESC) {
        const character = Array.from(this.buffer)[0];
        this.buffer = this.buffer.slice(character.length);
        this.onKey(keyFromCharacter(character));
        continue;
      }

      if (this.buffer.length === 1) {
        this.scheduleEscape();
        return;
      }

      const sequence = [...SEQUENCES.keys()].find((candidate) => this.buffer.startsWith(candidate));
      if (sequence) {
        this.buffer = this.buffer.slice(sequence.length);
        this.onKey(keyFromSequence(sequence));
        continue;
      }

      const variableSequence = this.buffer.match(/^\u001b(?:\[[0-9;?]*[~A-Za-z]|O[A-Za-z])/);
      if (variableSequence) {
        const value = variableSequence[0];
        this.buffer = this.buffer.slice(value.length);
        this.onKey(keyFromSequence(value));
        continue;
      }

      this.buffer = this.buffer.slice(1);
      this.onKey(keyFromCharacter(ESC));
    }
  }

  scheduleEscape() {
    if (this.escapeTimer) return;
    this.escapeTimer = setTimeout(() => {
      this.escapeTimer = null;
      if (this.buffer === ESC) {
        this.buffer = "";
        this.onKey(keyFromCharacter(ESC));
      } else {
        this.flush();
      }
    }, 25);
  }

  dispose() {
    if (this.escapeTimer) clearTimeout(this.escapeTimer);
    this.escapeTimer = null;
    this.buffer = "";
  }
}

module.exports = { KeyParser };
