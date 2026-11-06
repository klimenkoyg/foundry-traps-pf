import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineHtml, isNewer, parseReleaseNotes, repoOf, versionOf } from "../scripts/core/release.mjs";

test("версии: тег с v, числа по частям", () => {
  assert.equal(versionOf("v0.2.5"), "0.2.5");
  assert.equal(versionOf(" 1.0 "), "1.0");
  assert.equal(isNewer("0.2.5", "0.2.4"), true);
  assert.equal(isNewer("v0.10.0", "0.9.9"), true);
  assert.equal(isNewer("0.2.4", "0.2.4"), false);
  assert.equal(isNewer("0.2.3", "0.2.4"), false);
  assert.equal(isNewer("1.0", "0.9.9"), true);
  assert.equal(isNewer("0.3", "0.3.0"), false);
});

test("репозиторий из адреса модуля", () => {
  assert.equal(repoOf("https://github.com/klimenkoyg/foundry-traps"), "klimenkoyg/foundry-traps");
  assert.equal(repoOf("https://github.com/klimenkoyg/foundry-traps.git"), "klimenkoyg/foundry-traps");
  assert.equal(repoOf("https://github.com/a/b/releases/latest"), "a/b");
  assert.equal(repoOf("https://example.com/x"), null);
  assert.equal(repoOf(undefined), null);
});

const BODY = `## Что нового

- Исправлено: «Выбрать и поправить область ловушки» включал слой регионов, но
  области не выделялись.
- Кнопки с черепом на панели токенов больше нет.

## Обновление

В Foundry: **Add-on Modules** → «Западня» → обновить.

\`\`\`
https://github.com/klimenkoyg/foundry-traps/releases/latest/download/module.json
\`\`\`

---

**English.** Fixes “Select and adjust a trap region”. The skull button is gone from Token Controls.`;

test("что нового: русский список и английский абзац из описания релиза", () => {
  const notes = parseReleaseNotes(BODY);
  assert.deepEqual(notes.ru, [
    "Исправлено: «Выбрать и поправить область ловушки» включал слой регионов, но области не выделялись.",
    "Кнопки с черепом на панели токенов больше нет.",
  ]);
  assert.equal(notes.en, "Fixes “Select and adjust a trap region”. The skull button is gone from Token Controls.");
  // Описание в другом виде — пусто, без ошибок.
  assert.deepEqual(parseReleaseNotes("просто текст"), { ru: [], en: "" });
  assert.deepEqual(parseReleaseNotes(null), { ru: [], en: "" });
  assert.deepEqual(parseReleaseNotes("## Что нового\r\n\r\n- Один\r\n- Два\r\n"), { ru: ["Один", "Два"], en: "" });
});

test("описание в HTML — только жирный и код, разметка из релиза не проходит", () => {
  assert.equal(inlineHtml("**Сразу** и `module.json`"), "<b>Сразу</b> и <code>module.json</code>");
  assert.equal(inlineHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});
