/* Ловушка в чистом виде по правилам Pathfinder 2e: описание, пересчёт под уровень партии, исход
   срабатывания по степеням успеха, обезвреживание. Без Foundry — всё здесь покрыто тестами. */

import { BASIC_MULTIPLIER, CRIT_FAILURE, CRIT_SUCCESS, degreeFor, degreeOf, FAILURE, SUCCESS } from "./degrees.mjs";
import { deriveDevice, DEVICES, normalizeOptions } from "./devices.mjs";
import { attackShift, clampLevel, damageFactor, dcShift, hazardXp, rankShift, saveShift } from "./tables.mjs";

/**
 * @typedef {object} TrapDef
 * @property {string} id
 * @property {string} [name]          Своё название (у встроенных — из перевода)
 * @property {string} [text]          Заметка для ведущего
 * @property {string} [flavor]        Что видят игроки при срабатывании
 * @property {string} icon            Значок Font Awesome
 * @property {"setback"|"dangerous"|"deadly"} severity  Опасность: цвет и порядок в библиотеке
 * @property {number} level           Уровень ловушки (для партии 1 уровня; на сцене — под уровень партии)
 * @property {boolean} magical
 * @property {number} width           Ширина области в клетках
 * @property {number} height          Высота области в клетках
 * @property {number} size            Большая сторона (для старых ловушек — сторона квадрата)
 * @property {"trigger"|"area"} affects  Только наступивший или все в области
 * @property {boolean} stops          Останавливает движение наступившего (яма, капкан, сеть)
 * @property {number} detectDC        Скрытность ловушки: Сл для Внимательности
 * @property {number} detectRank      Какой ранг Внимательности нужен, чтобы заметить: 0 — любой
 * @property {number} detectRange     С какого расстояния её можно заметить, фт (по клеткам, как линейка)
 * @property {number} disarmDC        Обезвредить устройство: Сл
 * @property {string} disarmSkill     Навык PF2e (thievery, athletics, arcana…)
 * @property {number} disarmRank      Какой ранг навыка нужен для попытки: 0 — любой
 * @property {number} disarmSuccesses Сколько успехов нужно (критический успех — за два)
 * @property {number|null} attackBonus Ловушка с атакой: модификатор против КБ
 * @property {string} saveAbility     Спасбросок: fortitude, reflex, will; "" — без спасброска
 * @property {number} saveDC
 * @property {"basic"|"avoid"} onSave basic — базовый спасбросок (0 / ½ / весь / вдвое);
 *                                    avoid — успех спасает целиком, провал — урон и состояние
 * @property {string} damage
 * @property {string} damageType
 * @property {string} damage2
 * @property {string} damage2Type
 * @property {boolean} damage2Persistent Второй урон — продолжительный (горение, кровотечение…)
 * @property {string} condition       Состояние при провале / попадании
 * @property {number} conditionValue  Значение состояния (напуган 1, тошнота 2…); 0 — без значения.
 *                                    При критическом провале — на 1 больше.
 * @property {string} fx              Анимация (fx/presets.mjs)
 * @property {string} sound
 * @property {"auto"|"once"} rearm    Взводится снова или срабатывает один раз
 * @property {string} device          Устройство (devices.mjs): параметры на языке мира
 * @property {object} options         Параметры устройства: { depth: 30, spikes: "stakes", … }
 * @property {boolean} fixedDamage    Урон и Сл выбраться не растут с уровнем (падение в яму);
 *                                    Скрытность, обезвреживание, спасбросок и атака растут всегда
 * @property {number} escapeDC        Выбраться (из ямы, капкана, сети): Сл; 0 — не нужно
 * @property {string} escapeSkill     Чем выбираться: athletics или acrobatics
 * @property {boolean} manual         Срабатывает только по кнопке ведущего
 * @property {number} activators      Сколько триггеров ставить вместе с ловушкой: 0 — ни одного,
 *                                    срабатывает сама область; 1–3 — столько триггеров.
 */

export const SEVERITIES = ["setback", "dangerous", "deadly"];

/** Больше триггеров у одной ловушки не ставим. */
export const MAX_ACTIVATORS = 3;

/** Уровни партии, под которые подстраиваются ловушки. */
export const PARTY_LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);
export const SAVES = ["fortitude", "reflex", "will"];
/** Чем обезвреживают: Воровство — механизмы, остальное — магия и грубая сила. */
export const DISARM_SKILLS = ["thievery", "athletics", "acrobatics", "arcana", "crafting", "nature", "occultism", "religion", "survival"];
/** Чем выбираются: Высвободиться — Атлетикой или Акробатикой; из ямы — Атлетикой (лазание). */
export const ESCAPE_SKILLS = ["athletics", "acrobatics"];
export const DAMAGE_TYPES = [
  "acid", "bleed", "bludgeoning", "cold", "electricity", "fire", "force", "mental", "piercing",
  "poison", "slashing", "sonic", "spirit", "vitality", "void",
];
export const CONDITIONS = [
  "blinded", "clumsy", "confused", "dazzled", "deafened", "drained", "enfeebled", "fatigued",
  "frightened", "grabbed", "immobilized", "off-guard", "paralyzed", "prone", "restrained",
  "sickened", "slowed", "stunned", "stupefied", "unconscious",
];
/** Состояния со значением: напуган 2, тошнота 1… */
export const VALUED_CONDITIONS = ["clumsy", "drained", "enfeebled", "frightened", "sickened", "slowed", "stunned", "stupefied"];
export const isValued = (condition) => VALUED_CONDITIONS.includes(condition);

const DEFAULTS = {
  id: "",
  name: "",
  text: "",
  flavor: "",
  icon: "fa-solid fa-triangle-exclamation",
  severity: "dangerous",
  level: 1,
  magical: false,
  size: 1,
  affects: "trigger",
  stops: false,
  detectDC: 17,
  detectRank: 0,
  detectRange: 10,
  disarmDC: 17,
  disarmSkill: "thievery",
  disarmRank: 1,
  disarmSuccesses: 1,
  attackBonus: null,
  saveAbility: "",
  saveDC: 17,
  onSave: "basic",
  damage: "",
  damageType: "bludgeoning",
  damage2: "",
  damage2Type: "",
  damage2Persistent: false,
  condition: "",
  conditionValue: 0,
  fx: "burst",
  sound: "",
  rearm: "auto",
  device: "",
  options: {},
  fixedDamage: false,
  escapeDC: 0,
  escapeSkill: "athletics",
  manual: false,
  activators: 0,
};

const int = (v, fallback, min = -Infinity, max = Infinity) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const str = (v) => (typeof v === "string" ? v.trim() : "");

/** Любые данные (из каталога, настроек, поведения области) → полная корректная ловушка. */
export function normalizeTrap(raw = {}) {
  const t = { ...DEFAULTS, ...raw };
  // Ширина и высота; у старых ловушек и в каталоге — только size, это квадрат.
  const width = int(raw.width ?? raw.size, 1, 1, 12);
  const height = int(raw.height ?? raw.size, 1, 1, 12);
  const attack = t.attackBonus === null || t.attackBonus === undefined || t.attackBonus === "" ? null : int(t.attackBonus, null, -5, 60);
  const condition = str(t.condition);
  return {
    id: str(t.id),
    name: str(t.name),
    text: str(t.text),
    flavor: str(t.flavor),
    icon: str(t.icon) || DEFAULTS.icon,
    severity: oneOf(t.severity, SEVERITIES, DEFAULTS.severity),
    level: clampLevel(int(t.level, DEFAULTS.level)),
    magical: Boolean(t.magical),
    width,
    height,
    size: Math.max(width, height),
    affects: oneOf(t.affects, ["trigger", "area"], "trigger"),
    stops: Boolean(t.stops),
    detectDC: int(t.detectDC, DEFAULTS.detectDC, 0, 70),
    detectRank: int(t.detectRank, DEFAULTS.detectRank, 0, 4),
    detectRange: int(t.detectRange, DEFAULTS.detectRange, 5, 120),
    disarmDC: int(t.disarmDC, DEFAULTS.disarmDC, 0, 70),
    disarmSkill: str(t.disarmSkill) || DEFAULTS.disarmSkill,
    disarmRank: int(t.disarmRank, DEFAULTS.disarmRank, 0, 4),
    disarmSuccesses: int(t.disarmSuccesses, DEFAULTS.disarmSuccesses, 1, 5),
    attackBonus: attack,
    saveAbility: attack === null ? oneOf(t.saveAbility, SAVES, "") : "",
    saveDC: int(t.saveDC, DEFAULTS.saveDC, 1, 70),
    onSave: oneOf(t.onSave, ["basic", "avoid"], "basic"),
    damage: isFormula(t.damage) ? str(t.damage) : "",
    damageType: str(t.damageType) || DEFAULTS.damageType,
    damage2: isFormula(t.damage2) ? str(t.damage2) : "",
    damage2Type: str(t.damage2Type) || str(t.damageType) || DEFAULTS.damageType,
    damage2Persistent: Boolean(t.damage2Persistent),
    condition,
    // Значение — только у состояний со значением; без него у них — 1.
    conditionValue: isValued(condition) ? int(t.conditionValue, 1, 1, 4) || 1 : 0,
    fx: str(t.fx) || DEFAULTS.fx,
    sound: str(t.sound),
    rearm: oneOf(t.rearm, ["auto", "once"], "auto"),
    device: str(t.device) in DEVICES ? str(t.device) : "",
    options: normalizeOptions(str(t.device), t.options),
    fixedDamage: Boolean(t.fixedDamage),
    escapeDC: int(t.escapeDC, 0, 0, 70),
    escapeSkill: oneOf(str(t.escapeSkill), ESCAPE_SKILLS, DEFAULTS.escapeSkill),
    manual: Boolean(t.manual),
    activators: int(raw.activators ?? (raw.activator ? 1 : 0), 0, 0, MAX_ACTIVATORS),
  };
}

/**
 * Как срабатывает ловушка: "manual" — только по кнопке ведущего; "activator" — когда наступают
 * на её триггер (count — сколько их на сцене); "area" — когда заходят в саму область.
 */
export function activation({ manual = false } = {}, count = 0) {
  if (manual) return "manual";
  return count > 0 ? "activator" : "area";
}

/** Простая проверка формулы урона: кубики, числа, + и −. Пустая строка — урона нет. */
export function isFormula(value) {
  const s = str(value);
  if (!s) return false;
  return /^\s*(\d*d\d+|\d+)(\s*[+-]\s*(\d*d\d+|\d+))*\s*$/i.test(s);
}

/** «2d6+3» × 2 → «4d6+6»: множим число кубиков и прибавку. */
export function scaleFormula(formula, factor) {
  const s = str(formula);
  if (!s || factor === 1) return s;
  return s
    .replace(/(\d*)d(\d+)/gi, (m, n, d) => `${Math.max(1, Math.round((Number(n) || 1) * factor))}d${d}`)
    .replace(/([+-]\s*)(\d+)(?![\dd])/gi, (m, sign, n) => `${sign}${Math.max(0, Math.round(Number(n) * factor))}`)
    .replace(/[+-]\s*0(?![\dd])/g, "")
    .trim();
}

/** Сдвиг уровня: ловушка уровня level → уровня level + delta. Сл, атака и урон — по таблицам. */
function shiftLevel(t, delta) {
  if (!delta) return t;
  const from = t.level;
  const to = clampLevel(from + delta);
  if (to === from) return t;
  const dc = dcShift(from, to);
  const add = (v, by = dc) => Math.max(1, v + by);
  // Нужный ранг растёт вместе с уровнем; у ловушки «на виду» (без ранга) — не появляется.
  const rank = (r) => (r > 0 ? Math.min(4, Math.max(1, r + rankShift(from, to))) : 0);
  const factor = t.fixedDamage ? 1 : damageFactor(from, to);
  return {
    ...t,
    level: to,
    detectDC: add(t.detectDC),
    detectRank: rank(t.detectRank),
    disarmDC: add(t.disarmDC),
    disarmRank: rank(t.disarmRank),
    saveDC: add(t.saveDC, saveShift(from, to)),
    // Стены ямы и прочее «физическое» (fixedDamage) от уровня не зависят.
    escapeDC: t.escapeDC && !t.fixedDamage ? add(t.escapeDC) : t.escapeDC,
    attackBonus: t.attackBonus === null ? null : t.attackBonus + attackShift(from, to),
    damage: scaleFormula(t.damage, factor),
    damage2: scaleFormula(t.damage2, factor),
  };
}

/** Ловушка под уровень партии: в библиотеке она описана для партии 1 уровня. */
export function scaleTrap(trap, party = 1) {
  return shiftLevel(normalizeTrap(trap), (Number(party) || 1) - 1);
}

/** Обратно к партии 1 уровня: так ловушки хранятся в библиотеке. */
export function unscaleTrap(trap, party = 1) {
  return shiftLevel(normalizeTrap(trap), 1 - (Number(party) || 1));
}

/** Опыт за ловушку для партии этого уровня (простая ловушка). */
export const trapXp = (trap, party = 1) => hazardXp(trap.level, party);

/**
 * Ловушка на разных уровнях партии — чтобы в окне настройки было видно, как она растёт.
 * trap — уже под уровень party (как в окне). → [{ party, level, dc, attack, damage, damage2, current }]
 */
export function byPartyLevel(trap, party = 1, levels = [1, 4, 8, 12, 16, 20]) {
  const now = normalizeTrap(trap);
  const base = unscaleTrap(now, party);
  const list = [...new Set([...levels, Number(party) || 1])].sort((a, b) => a - b);
  return list.map((p) => {
    const at = p === party ? now : scaleTrap(base, p);
    return { party: p, level: at.level, detectDC: at.detectDC, disarmDC: at.disarmDC, saveDC: at.saveDC, attackBonus: at.attackBonus, damage: at.damage, damage2: at.damage2, current: p === party };
  });
}

/**
 * Поменять параметры устройства: поля, которые оно задаёт, пересчитываются (под уровень ловушки),
 * остальное остаётся как было. trap — уже под уровень партии party (как в окне настройки).
 */
export function withDevice(trap, options, party = 1) {
  const t = normalizeTrap(trap);
  if (!t.device) return t;
  const opts = normalizeOptions(t.device, { ...t.options, ...options });
  const patch = deriveDevice(t.device, opts);
  // Устройство описывает ловушку для партии 1 уровня — поднимаем её числа до нынешнего уровня.
  const base = unscaleTrap(t, party);
  const fresh = scaleTrap({ ...base, ...patch, options: opts }, party);
  const next = normalizeTrap({ ...t, options: opts });
  for (const key of Object.keys(patch)) next[key] = fresh[key];
  return normalizeTrap(next);
}

/** Чем проверяется ловушка: атака, спасбросок или ничем (сработала — и всё). */
export function trapMode(trap) {
  if (trap.attackBonus !== null && trap.attackBonus !== undefined) return "attack";
  if (trap.saveAbility) return "save";
  return "auto";
}

export const hasDamage = (trap) => Boolean(trap.damage || trap.damage2);

/** Значение состояния при этой степени: на критическом провале — на 1 больше. */
const conditionAt = (trap, degree) => (isValued(trap.condition) ? Math.min(4, (trap.conditionValue || 1) + (degree === CRIT_FAILURE ? 1 : 0)) : 0);

/**
 * Исход для одной цели.
 * attack: { total, natural, ac, degree? } — ловушка с атакой против КБ
 * save:   { total, natural?, degree? }     — ловушка со спасброском (degree — от системы, если есть)
 * → { mode, degree, hit?, crit?, success?, multiplier, condition, conditionValue }
 *   multiplier — доля урона (2, 1, 0.5, 0); condition — накладывать ли состояние.
 */
export function resolveTarget(trap, { attack, save } = {}) {
  const mode = trapMode(trap);
  if (mode === "attack") {
    const degree = degreeFor(attack, attack?.ac ?? 10);
    const hit = degree >= SUCCESS;
    const crit = degree === CRIT_SUCCESS;
    return { mode, degree, hit, crit, multiplier: crit ? 2 : hit ? 1 : 0, condition: hit, conditionValue: hit ? conditionAt(trap, crit ? CRIT_FAILURE : FAILURE) : 0 };
  }
  if (mode === "save") {
    const degree = degreeFor(save, trap.saveDC);
    const success = degree >= SUCCESS;
    const multiplier = trap.onSave === "avoid" ? (success ? 0 : 1) : BASIC_MULTIPLIER[degree];
    return { mode, degree, success, multiplier, condition: !success, conditionValue: success ? 0 : conditionAt(trap, degree) };
  }
  return { mode, degree: null, multiplier: 1, condition: true, conditionValue: conditionAt(trap, FAILURE) };
}

/**
 * Обезвредить устройство (Player Core): критический успех — два успеха, успех — один, провал —
 * ничего, критический провал — ловушка срабатывает. Нужно disarmSuccesses успехов.
 * check: { total, natural?, degree? }; progress — сколько успехов уже есть.
 * → { degree, outcome: "success" | "progress" | "fail" | "triggered", progress }
 */
export function resolveDisarm(check, dc, { progress = 0, needed = 1 } = {}) {
  const degree = degreeFor(typeof check === "number" ? { total: check } : check, dc);
  if (degree === CRIT_FAILURE) return { degree, outcome: "triggered", progress };
  if (degree === FAILURE) return { degree, outcome: "fail", progress };
  const next = progress + (degree === CRIT_SUCCESS ? 2 : 1);
  return { degree, outcome: next >= needed ? "success" : "progress", progress: Math.min(next, needed) };
}

/** Замечает ли персонаж ловушку: проверка Внимательности против Скрытности, и ранга хватает. */
export const notices = (total, dc, { rank = 0, need = 0, natural = null } = {}) =>
  (Number(rank) || 0) >= (Number(need) || 0) && degreeOf(total, dc, natural) >= SUCCESS;

/** Что делать, когда персонаж заметил ловушку: сообщить ведущему (по умолчанию) или сразу показать игрокам. */
export const DETECT_MODES = ["gm", "reveal"];
/** Кто бросает обезвреживание, когда ведущий жмёт ключ: игрок (карточкой) или ведущий сразу. */
export const DISARM_ROLLS = ["players", "gm"];
/** Свой ключ у игроков на замеченных ловушках: есть или нет. */
export const PLAYER_DISARM = ["on", "off"];
/**
 * Кто получает тайную проверку Внимательности, подойдя к ловушке: по правилам — те, кто в
 * исследовании выбрал «Поиск» (а ловушку без требования к рангу — любой); или все.
 */
export const SEARCH_MODES = ["activity", "always"];

/** Знает ли персонаж о ловушке: её показали всем или он сам уже замечал её. */
export const knowsTrap = ({ revealed = false, noticedBy = [] } = {}, actorId) =>
  Boolean(revealed) || (Array.isArray(noticedBy) && noticedBy.some((n) => n?.id === actorId));

/** Список заметивших [{ id, name }] с ещё одним — без повторов. */
export function addNoticer(list, who) {
  const clean = Array.isArray(list) ? list.filter((n) => n?.id) : [];
  if (!who?.id || clean.some((n) => n.id === who.id)) return clean;
  return [...clean, { id: who.id, name: String(who.name ?? "") }];
}

/** Ловушка → данные поведения области (плоские поля схемы). */
export function toBehaviorData(trap, { party = 1, flavor = "", text = "" } = {}) {
  const t = scaleTrap(trap, party);
  return {
    trapId: t.id,
    icon: t.icon,
    severity: t.severity,
    level: t.level,
    magical: t.magical,
    affects: t.affects,
    stops: t.stops,
    detectDC: t.detectDC,
    detectRank: t.detectRank,
    detectRange: t.detectRange,
    disarmDC: t.disarmDC,
    disarmSkill: t.disarmSkill,
    disarmRank: t.disarmRank,
    disarmSuccesses: t.disarmSuccesses,
    attackBonus: t.attackBonus,
    saveAbility: t.saveAbility,
    saveDC: t.saveDC,
    onSave: t.onSave,
    damage: t.damage,
    damageType: t.damageType,
    damage2: t.damage2,
    damage2Type: t.damage2 ? t.damage2Type : "",
    damage2Persistent: Boolean(t.damage2 && t.damage2Persistent),
    condition: t.condition,
    conditionValue: t.conditionValue,
    fx: t.fx,
    sound: t.sound,
    rearm: t.rearm,
    device: t.device,
    options: t.options,
    fixedDamage: t.fixedDamage,
    escapeDC: t.escapeDC,
    escapeSkill: t.escapeSkill,
    manual: t.manual,
    activators: t.activators,
    flavor: flavor || t.flavor,
    notes: text || t.text,
    size: t.size,
    width: t.width,
    height: t.height,
  };
}

/** Данные поведения → ловушка для библиотеки (сохранить расставленную как свою). */
export function fromBehaviorData(system, { id, name, size, width, height, party = 1 } = {}) {
  // В библиотеке ловушка хранится для партии 1 уровня: снимаем пересчёт, с которым её ставили.
  const w = width ?? size ?? system.width ?? system.size;
  const h = height ?? size ?? system.height ?? system.size;
  return unscaleTrap({ ...system, id, name, text: system.notes, width: w, height: h }, party);
}

/** Поиск и фильтр библиотеки. entries: [{ trap, name, text }] */
export function filterTraps(entries, { query = "", severity = "", kind = "", damageType = "" } = {}) {
  const q = str(query).toLowerCase();
  return entries.filter(({ trap, name, text }) => {
    if (severity && trap.severity !== severity) return false;
    if (kind === "magical" && !trap.magical) return false;
    if (kind === "mechanical" && trap.magical) return false;
    if (damageType) {
      // Тип урона без самого урона (сонный газ) не считается; окно передаёт только типы — им верим.
      const first = trap.damage === undefined || trap.damage ? trap.damageType : "";
      const second = trap.damage2 === undefined || trap.damage2 ? trap.damage2Type : "";
      if (first !== damageType && second !== damageType) return false;
    }
    if (!q) return true;
    return `${name} ${text}`.toLowerCase().includes(q);
  });
}

/** Новый id для своей ловушки: custom-<время>-<случайное>. */
export const customId = (now = Date.now(), rnd = Math.random()) => `custom-${now.toString(36)}${Math.floor(rnd * 1296).toString(36).padStart(2, "0")}`;

/**
 * Включили или сняли «урон не зависит от уровня» в окне настройки: числа в полях остаются как
 * есть (ведущий видит их под нынешний уровень партии), меняется только то, как ловушка будет
 * подстраиваться под другие уровни.
 */
export const withFixedDamage = (trap, fixed) => ({ ...normalizeTrap(trap), fixedDamage: Boolean(fixed) });
