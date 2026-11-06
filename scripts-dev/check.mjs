/* Проверки без Foundry: синтаксис, ключи перевода, шаблоны, звуки и файлы манифеста. */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CATALOG } from "../scripts/core/catalog.mjs";
import { FX_NAMES, SOUND_NAMES } from "../scripts/core/fx/presets.mjs";
import { CONDITIONS, DAMAGE_TYPES, DISARM_SKILLS, ESCAPE_SKILLS, SAVES, SEVERITIES } from "../scripts/core/trap.mjs";
import { DEGREE_KEYS, RANK_KEYS } from "../scripts/core/degrees.mjs";
import { DEVICES } from "../scripts/core/devices.mjs";

const root = new URL("..", import.meta.url).pathname.replace(/%20/g, " ");
const walk = (dir, ext) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) return walk(rel, ext);
    return ext.some((e) => name.endsWith(e)) ? [rel] : [];
  });

let problems = 0;
const fail = (msg) => {
  problems++;
  console.error("✗", msg);
};

// 1. Синтаксис
const scripts = walk("scripts", [".mjs"]);
for (const file of scripts) {
  try {
    execFileSync(process.execPath, ["--check", join(root, file)], { stdio: "pipe" });
  } catch (err) {
    fail(`${file}: ${err.stderr?.toString().split("\n").slice(0, 4).join(" ")}`);
  }
}

// 2. Ключи перевода: оба языка — одинаковый набор
const flat = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
const langs = Object.fromEntries(["ru", "en"].map((l) => [l, new Set(flat(JSON.parse(readFileSync(join(root, "lang", `${l}.json`), "utf8"))))]));
for (const [a, b] of [["ru", "en"], ["en", "ru"]]) {
  for (const key of langs[a]) if (!langs[b].has(key)) fail(`ключ есть в ${a}, нет в ${b}: ${key}`);
}

const used = new Map();
const note = (key, file) => {
  if (key.includes("${") || key.endsWith(".")) return;
  if (!used.has(key)) used.set(key, file);
};
const templates = walk("templates", [".hbs"]);
for (const file of scripts) {
  const src = readFileSync(join(root, file), "utf8");
  for (const m of src.matchAll(/(?<![.\w])(?:t|has)\(\s*["'`]([A-Za-z0-9_.${}]+)["'`]/g)) note(`TRAPS.${m[1]}`, file);
  for (const m of src.matchAll(/["'`](TRAPS\.[A-Za-z0-9_.]+)["'`]/g)) note(m[1], file);
}
for (const file of templates) {
  const src = readFileSync(join(root, file), "utf8");
  for (const m of src.matchAll(/(TRAPS\.[A-Za-z0-9_.]+)/g)) note(m[1], file);
}
const isGroup = (set, key) => [...set].some((k) => k.startsWith(`${key}.`));
for (const [key, file] of used) {
  for (const [lang, set] of Object.entries(langs)) if (!set.has(key) && !isGroup(set, key)) fail(`нет перевода (${lang}): ${key} — ${file}`);
}

// Семейства ключей, которые собираются на лету.
const behaviorSrc = readFileSync(join(root, "scripts/foundry/behavior.mjs"), "utf8");
// Поля двух поведений: «Ловушка» (до класса триггера) и «Триггер ловушки» — у каждого свои подписи.
const fieldsOf = (src) => [...src.matchAll(/^\s{6}(\w+): (?:new f\.|dc\(|formula\(|rank\()/gm)].map((m) => m[1]);
const [trapSrc, activatorSrc = ""] = behaviorSrc.split("export class ActivatorBehavior");
const fields = fieldsOf(trapSrc);
const activatorFields = fieldsOf(activatorSrc);
if (fields.length < 20) fail(`поля поведения не нашлись в behavior.mjs (${fields.length})`);
if (activatorFields.length < 1) fail(`поля триггера не нашлись в behavior.mjs (${activatorFields.length})`);
const families = [
  ...CATALOG.flatMap((x) => ["name", "text", "flavor"].map((k) => `TRAPS.Trap.${x.id}.${k}`)),
  ...FX_NAMES.map((x) => `TRAPS.Fx.${x}`),
  ...SOUND_NAMES.map((x) => `TRAPS.Sound.${x}`),
  ...SEVERITIES.map((x) => `TRAPS.Severity.${x}`),
  // Подписи PF2e, которые модуль берёт у себя, а не у системы (foundry/pf2e.mjs).
  ...SAVES.flatMap((x) => [`TRAPS.Save.${x}`, `TRAPS.SaveShort.${x}`, `TRAPS.SaveOf.${x}`]),
  ...["perception", ...DISARM_SKILLS, ...ESCAPE_SKILLS].map((x) => `TRAPS.Skill.${x}`),
  ...RANK_KEYS.map((x) => `TRAPS.Rank.${x}`),
  ...DEGREE_KEYS.map((x) => `TRAPS.Degree.${x}`),
  ...DAMAGE_TYPES.map((x) => `TRAPS.Damage.${x}`),
  ...CONDITIONS.map((x) => `TRAPS.Condition.${x}`),
  ...["basic", "avoid"].map((x) => `TRAPS.Device.chip.${x}`),
  ...fields.map((x) => `TRAPS.Behavior.FIELDS.${x}.label`),
  ...activatorFields.map((x) => `TRAPS.ActivatorBehavior.FIELDS.${x}.label`),
  ...["none", "1", "2", "3"].map((x) => `TRAPS.Activators.${x}`),
  "TRAPS.ActivatorName",
  ...["manual", "count"].map((x) => `TRAPS.Activation.${x}`),
  ...["trigger", "area"].map((x) => `TRAPS.Affects.${x}`),
  ...["auto", "once"].map((x) => `TRAPS.Rearm.${x}`),
  ...["basic", "avoid"].map((x) => `TRAPS.OnSave.${x}`),
  "TYPES.RegionBehavior.ssl_traps_pf2e.trap",
  "TYPES.RegionBehavior.ssl_traps_pf2e.activator",
  ...Object.entries(DEVICES).flatMap(([name, def]) =>
    def.params.flatMap((p) => [`TRAPS.Device.${name}.${p.key}.label`, ...(p.options ?? []).map((o) => `TRAPS.Device.${name}.${p.key}.${o}`)]),
  ),
  ...[...new Set(Object.values(DEVICES).flatMap((d) => d.params.map((p) => p.unit).filter(Boolean)))].map((u) => `TRAPS.Unit.${u}`),
];
for (const key of families) {
  for (const [lang, set] of Object.entries(langs)) if (!set.has(key)) fail(`нет перевода (${lang}): ${key}`);
}

// 3. Шаблоны, импорты, звуки и файлы манифеста
for (const file of scripts) {
  const src = readFileSync(join(root, file), "utf8");
  for (const m of src.matchAll(/tpl\("([^"]+)"\)/g)) {
    if (!existsSync(join(root, "templates", m[1]))) fail(`нет шаблона templates/${m[1]} — ${file}`);
  }
  for (const m of src.matchAll(/from\s+"(\.[^"]+)"/g)) {
    if (!existsSync(join(root, file, "..", m[1]))) fail(`нет файла ${m[1]} — ${file}`);
  }
}
for (const s of SOUND_NAMES) if (!existsSync(join(root, "sounds", `${s}.wav`))) fail(`нет звука sounds/${s}.wav (npm run sounds)`);
const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
for (const path of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map((l) => l.path)]) {
  if (!existsSync(join(root, path))) fail(`module.json ссылается на отсутствующий файл: ${path}`);
}
if (!manifest.documentTypes?.RegionBehavior?.trap) fail("module.json: нет documentTypes.RegionBehavior.trap");

// Действия окон: «tab» и «toggleControls» ApplicationV2 обрабатывает сам и до обработчика модуля
// не пускает (так однажды перестали переключаться вкладки окна библиотеки).
const RESERVED_ACTIONS = ["tab", "toggleControls"];
for (const file of [...templates, ...scripts]) {
  const text = readFileSync(join(root, file), "utf8");
  for (const name of RESERVED_ACTIONS) {
    if (text.includes(`data-action="${name}"`)) fail(`${file}: data-action="${name}" — это встроенное действие ApplicationV2, назовите своё иначе`);
    if (new RegExp(`^\\s*${name}\\s*:\\s*\\w+\\.#`, "m").test(text)) fail(`${file}: действие «${name}» в actions — его перехватит ApplicationV2`);
  }
}

// Шрифты: каждый файл из styles/fonts.css лежит в fonts/, лицензия на месте.
const fontsCss = readFileSync(join(root, "styles/fonts.css"), "utf8");
const fontFiles = [...fontsCss.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)].map((m) => m[1]);
for (const f of fontFiles) if (!existsSync(join(root, "fonts", f))) fail(`нет шрифта fonts/${f}`);
if (!existsSync(join(root, "fonts/OFL.txt"))) fail("нет fonts/OFL.txt");

console.log(
  problems
    ? `\nПроблем: ${problems}`
    : `✓ ${scripts.length} модулей, ${templates.length} шаблон, ${used.size + families.length} ключей перевода, ${SOUND_NAMES.length} звуков — всё на месте`,
);
process.exit(problems ? 1 : 0);
