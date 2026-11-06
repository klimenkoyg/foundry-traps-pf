/* Новая версия модуля: сравнить версии и вынуть «что нового» из описания релиза на GitHub.
   Описание релиза модуль пишет так: «## Что нового» и список, «## Обновление», затем после «---»
   абзац «**English.** …». Без Foundry — покрыто тестами. */

/** "v0.2.5" → "0.2.5". */
export const versionOf = (tag = "") => String(tag ?? "").trim().replace(/^v/i, "");

/** Новее ли версия a, чем b: по числам слева направо, 0.10.0 новее 0.9.9. */
export function isNewer(a, b) {
  const parts = (v) => versionOf(v).split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Адрес репозитория → "владелец/имя" или null: https://github.com/klimenkoyg/foundry-traps. */
export function repoOf(url) {
  const m = String(url ?? "").match(/github\.com\/([^/\s]+)\/([^/#?\s]+)/i);
  return m ? `${m[1]}/${m[2].replace(/\.git$/i, "")}` : null;
}

/**
 * «Что нового» из описания релиза → { ru: ["пункт", …], en: "абзац" }.
 * Пункты — строки списка под «## Что нового» (перенесённые строки склеиваются); en — текст после
 * «**English.**». Чего нет — пусто.
 */
export function parseReleaseNotes(body = "") {
  const lines = String(body ?? "").replace(/\r\n?/g, "\n").split("\n");
  const ru = [];
  const start = lines.findIndex((l) => /^##\s*Что нового/i.test(l.trim()));
  if (start >= 0) {
    for (const line of lines.slice(start + 1)) {
      const s = line.trim();
      if (/^##\s/.test(s) || /^---+$/.test(s)) break;
      if (/^[-*]\s+/.test(s)) ru.push(s.replace(/^[-*]\s+/, ""));
      else if (s && ru.length) ru[ru.length - 1] += ` ${s}`;
    }
  }
  let en = "";
  const at = lines.findIndex((l) => /^\*\*English\.\*\*/.test(l.trim()));
  if (at >= 0) {
    const rest = [lines[at].trim().replace(/^\*\*English\.\*\*\s*/, "")];
    for (const line of lines.slice(at + 1)) {
      if (!line.trim()) break;
      rest.push(line.trim());
    }
    en = rest.join(" ").trim();
  }
  return { ru, en };
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Строка описания → безопасный HTML: только **жирный** и `код`, остальное — как текст. */
export function inlineHtml(text = "") {
  return String(text ?? "")
    .replace(/[&<>"']/g, (c) => ESC[c])
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}
