// src/lib/markdownEditing.ts
// Operaciones del editor de notas sobre el texto markdown: negrita, títulos, listas, alineación...
// Son funciones puras: reciben el texto y la selección y devuelven el texto nuevo y la selección nueva.

export interface EditResult {
  value: string;
  start: number; // selección resultante
  end: number;
}

export type ListKind = "ul" | "ol" | "task" | "quote";
export type Align = "left" | "center" | "right" | "justify";

// ---------- Texto en línea ----------

// Envuelve la selección con `before`/`after` (negrita, cursiva...). Si ya estaba envuelta, lo quita.
export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string
): EditResult {
  const selected = value.slice(start, end);

  // Los marcadores están justo fuera de la selección: se quitan.
  if (
    start >= before.length &&
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after
  ) {
    const s = start - before.length;
    return {
      value: value.slice(0, s) + selected + value.slice(end + after.length),
      start: s,
      end: s + selected.length,
    };
  }

  // Los marcadores están dentro de la selección: se quitan.
  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      start,
      end: start + inner.length,
    };
  }

  const text = selected || placeholder;
  const s = start + before.length;
  return {
    value: value.slice(0, start) + before + text + after + value.slice(end),
    start: s,
    end: s + text.length,
  };
}

export function insertLink(value: string, start: number, end: number, placeholder: string): EditResult {
  const text = value.slice(start, end) || placeholder;
  const url = "https://";
  const urlStart = start + text.length + 3; // "[" + text + "]("
  return {
    value: value.slice(0, start) + `[${text}](${url})` + value.slice(end),
    start: urlStart,
    end: urlStart + url.length,
  };
}

export function codeBlock(value: string, start: number, end: number, placeholder: string): EditResult {
  const text = value.slice(start, end) || placeholder;
  const needsLeadingBreak = start > 0 && value[start - 1] !== "\n";
  const before = (needsLeadingBreak ? "\n" : "") + "```\n";
  const after = "\n```";
  const s = start + before.length;
  return {
    value: value.slice(0, start) + before + text + after + value.slice(end),
    start: s,
    end: s + text.length,
  };
}

// ---------- Líneas ----------

// Inicio y fin (sin salto de línea) de las líneas que toca la selección.
function lineRange(value: string, start: number, end: number): { ls: number; le: number } {
  const ls = value.lastIndexOf("\n", start - 1) + 1;
  const last = end > start ? end - 1 : end;
  const idx = value.indexOf("\n", last);
  return { ls, le: idx === -1 ? value.length : idx };
}

function replaceLines(value: string, ls: number, le: number, lines: string[], keepCursor: boolean): EditResult {
  const text = lines.join("\n");
  const result = value.slice(0, ls) + text + value.slice(le);
  return keepCursor
    ? { value: result, start: ls + text.length, end: ls + text.length }
    : { value: result, start: ls, end: ls + text.length };
}

// Título de nivel 1-6 en cada línea. Con `level` 0 (o repitiendo el mismo nivel) vuelve a párrafo.
export function setHeading(value: string, start: number, end: number, level: number): EditResult {
  const { ls, le } = lineRange(value, start, end);
  const lines = value.slice(ls, le).split("\n");
  const single = lines.length === 1;
  const strip = (line: string) => line.replace(/^#{1,6}[ \t]+/, "");
  const levelOf = (line: string) => (line.match(/^(#{1,6})[ \t]+/)?.[1].length ?? 0);
  const targets = lines.filter((l) => single || l.trim() !== "");
  const sameLevel = level > 0 && targets.length > 0 && targets.every((l) => levelOf(l) === level);
  const finalLevel = sameLevel ? 0 : level;

  const out = lines.map((line) => {
    if (!single && line.trim() === "") return line;
    const base = strip(line);
    return finalLevel > 0 ? `${"#".repeat(finalLevel)} ${base}` : base;
  });
  return replaceLines(value, ls, le, out, single && lines[0].trim() === "");
}

const LIST_PATTERNS: Record<ListKind, RegExp> = {
  ul: /^[-*+] (?!\[[ xX]\] )/,
  task: /^[-*+] \[[ xX]\] /,
  ol: /^\d+\. /,
  quote: /^> ?/,
};
const ANY_LIST = /^(?:[-*+] \[[ xX]\] |[-*+] |\d+\. )/;

// Lista con viñetas, numerada o de tareas, o cita, en cada línea. Repetir el mismo tipo la quita.
export function toggleList(value: string, start: number, end: number, kind: ListKind): EditResult {
  const { ls, le } = lineRange(value, start, end);
  const lines = value.slice(ls, le).split("\n");
  const single = lines.length === 1;
  const targets = lines.filter((l) => single || l.trim() !== "");
  const allHave = targets.length > 0 && targets.every((l) => LIST_PATTERNS[kind].test(l));

  let n = 0;
  const out = lines.map((line) => {
    if (!single && line.trim() === "") return line;
    if (allHave) return line.replace(LIST_PATTERNS[kind], "");
    const base = kind === "quote" ? line : line.replace(ANY_LIST, "");
    n++;
    const prefix = kind === "ul" ? "- " : kind === "task" ? "- [ ] " : kind === "ol" ? `${n}. ` : "> ";
    return prefix + base;
  });
  return replaceLines(value, ls, le, out, single && lines[0].trim() === "");
}

// ---------- Alineación ----------
// Markdown no tiene alineación: se envuelven las líneas en <div align="..."> con líneas en blanco
// alrededor, para que el markdown de dentro siga funcionando. Volver a elegir la misma, o "izquierda", la quita.

const WRAP_BEFORE = /<div align="(left|center|right|justify)">\n\n$/;
const WRAP_AFTER = /^\n\n<\/div>/;

export function setAlign(value: string, start: number, end: number, align: Align): EditResult {
  const { ls, le } = lineRange(value, start, end);
  const block = value.slice(ls, le);
  const head = value.slice(0, ls);
  const tail = value.slice(le);

  const open = head.match(WRAP_BEFORE);
  if (open && WRAP_AFTER.test(tail)) {
    const wrapStart = ls - open[0].length;
    const closeLen = tail.match(WRAP_AFTER)![0].length;
    if (align === "left" || open[1] === align) {
      return { value: value.slice(0, wrapStart) + block + value.slice(le + closeLen), start: wrapStart, end: wrapStart + block.length };
    }
    const opening = `<div align="${align}">\n\n`;
    return {
      value: value.slice(0, wrapStart) + opening + block + value.slice(le),
      start: wrapStart + opening.length,
      end: wrapStart + opening.length + block.length,
    };
  }

  if (align === "left") return { value, start, end };

  const lead = ls >= 2 && value[ls - 2] !== "\n" ? "\n" : "";
  const trail = le < value.length && value[le + 1] !== "\n" ? "\n" : "";
  const opening = `${lead}<div align="${align}">\n\n`;
  const closing = `\n\n</div>${trail}`;
  const s = ls + opening.length;
  return { value: head + opening + block + closing + tail, start: s, end: s + block.length };
}

// ---------- Bloques sueltos ----------

function insertBlock(value: string, end: number, block: string): EditResult {
  const { le } = lineRange(value, end, end);
  const lead = le > 0 && value.slice(Math.max(0, le - 1), le) !== "\n" ? "\n\n" : "\n";
  const text = lead + block + "\n";
  const pos = le + text.length;
  return { value: value.slice(0, le) + text + value.slice(le), start: pos, end: pos };
}

export function insertDivider(value: string, end: number): EditResult {
  return insertBlock(value, end, "---");
}

export function insertTable(value: string, end: number, column: (n: number) => string, cell: string): EditResult {
  const rows = [`| ${column(1)} | ${column(2)} |`, "| --- | --- |", `| ${cell} | ${cell} |`];
  return insertBlock(value, end, rows.join("\n"));
}