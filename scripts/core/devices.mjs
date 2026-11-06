/* Устройство ловушки: параметры на языке мира (глубина ямы, число дротиков, вид газа…).
   Устройство переводит свои параметры в поля ловушки — урон, состояние, сложности — для партии
   1 уровня; дальше работает обычный пересчёт под уровень партии (core/trap.mjs). Подписи — в lang/*.json:
   TRAPS.Device.<устройство>.<параметр>.label и .<значение>. */

/**
 * @typedef {object} DeviceParam
 * @property {string} key
 * @property {"choice"|"range"|"toggle"} type
 * @property {string[]} [options]   choice: значения по порядку
 * @property {number} [min]         range
 * @property {number} [max]
 * @property {number} [step]
 * @property {string} [unit]        range: единица (ft) — TRAPS.Unit.<unit>
 * @property {string[]} fields      Какие поля ловушки задаёт параметр (для подсказки под ним)
 */

/** Сила по описанию → во сколько раз больше кубиков, чем у обычной. */
const POWER = { weak: 0.5, normal: 1, strong: 1.5, devastating: 2 };

const dice = (n, die) => `${Math.max(1, Math.round(n))}d${die}`;

/** «3d8» × 1.5 → «5d8» (только число кубиков). */
function times(formula, k) {
  return String(formula || "").replace(/(\d*)d(\d+)/gi, (m, n, d) => dice((Number(n) || 1) * k, d));
}

/** «2d6» + прибавка: dmg(2, 6, 4) → «2d6+4». */
const dmg = (n, die, flat = 0) => `${dice(n, die)}${flat ? `+${flat}` : ""}`;

/*
 * Числа — для ловушки того уровня, что у неё в каталоге (партия 1 уровня), по таблицам GM Core:
 * атака, Сл и урон простой ловушки (core/tables.mjs). Падение — половина высоты дробящим уроном
 * (Player Core), от уровня не зависит. Сл выбраться — простые Сл: обучен 15, эксперт 20, мастер 30.
 */

/** @type {Record<string, { params: DeviceParam[], derive: (o: object) => object }>} */
export const DEVICES = {
  pit: {
    params: [
      { key: "depth", type: "range", min: 10, max: 200, step: 10, unit: "ft", fields: ["damage", "fixedDamage"] },
      { key: "spikes", type: "choice", options: ["none", "stakes", "poisoned"], fields: ["damage2", "condition"] },
      { key: "walls", type: "choice", options: ["rough", "smooth", "slick"], fields: ["escapeDC"] },
    ],
    // Падение: урон — половина высоты в футах, дробящий, и персонаж сбит с ног (Player Core).
    // «Схватиться за край» — спасбросок Рефлекса: успех — не падает.
    derive: ({ depth, spikes, walls }) => ({
      damage: String(Math.floor(depth / 2)),
      damageType: "bludgeoning",
      fixedDamage: true,
      damage2: spikes === "none" ? "" : "2d6",
      damage2Type: spikes === "none" ? "" : "piercing",
      damage2Persistent: false,
      condition: spikes === "poisoned" ? "sickened" : "prone",
      conditionValue: spikes === "poisoned" ? 1 : 0,
      fx: spikes === "none" ? "pit" : "spikes",
      saveAbility: "reflex",
      onSave: "avoid",
      escapeDC: { rough: 15, smooth: 20, slick: 30 }[walls],
      escapeSkill: "athletics",
    }),
  },

  bearTrap: {
    params: [
      { key: "jaws", type: "choice", options: ["small", "bear", "giant"], fields: ["damage", "escapeDC"] },
      { key: "venom", type: "toggle", fields: ["damage2"] },
    ],
    // Челюсти держат: обездвижен, пока не высвободится (Атлетика или Акробатика).
    derive: ({ jaws, venom }) => ({
      damage: { small: "1d6+2", bear: "2d6+5", giant: "2d10+7" }[jaws],
      damageType: "piercing",
      damage2: venom ? "1d6" : "",
      damage2Type: venom ? "poison" : "",
      damage2Persistent: Boolean(venom),
      condition: "immobilized",
      escapeDC: { small: 15, bear: 17, giant: 20 }[jaws],
      escapeSkill: "athletics",
    }),
  },

  darts: {
    params: [
      { key: "count", type: "range", min: 1, max: 4, step: 1, fields: ["damage"] },
      { key: "poison", type: "choice", options: ["none", "venom", "sleep"], fields: ["damage2", "condition"] },
    ],
    derive: ({ count, poison }) => ({
      damage: dmg(count, 4, count),
      damageType: "piercing",
      damage2: poison === "venom" ? "1d6" : "",
      damage2Type: poison === "venom" ? "poison" : "",
      damage2Persistent: poison === "venom",
      condition: { none: "", venom: "", sleep: "slowed" }[poison],
      conditionValue: poison === "sleep" ? 1 : 0,
    }),
  },

  arrows: {
    params: [
      { key: "count", type: "range", min: 1, max: 4, step: 1, fields: ["damage"] },
      { key: "tips", type: "choice", options: ["plain", "fire", "poison"], fields: ["damage2", "condition"] },
    ],
    derive: ({ count, tips }) => ({
      damage: dmg(count, 6, 2 * count),
      damageType: "piercing",
      damage2: { plain: "", fire: dice(count, 4), poison: "1d6" }[tips],
      damage2Type: { plain: "", fire: "fire", poison: "poison" }[tips],
      damage2Persistent: tips === "poison",
      condition: tips === "poison" ? "sickened" : "",
      conditionValue: tips === "poison" ? 1 : 0,
    }),
  },

  blade: {
    params: [
      { key: "height", type: "choice", options: ["low", "waist", "high"], fields: ["damage", "condition"] },
      { key: "speed", type: "choice", options: ["slow", "fast", "blur"], fields: ["attackBonus"] },
    ],
    derive: ({ height, speed }) => ({
      damage: { low: "1d12+4", waist: "2d12+4", high: "3d12+4" }[height],
      damageType: "slashing",
      condition: height === "low" ? "prone" : "",
      attackBonus: { slow: 11, fast: 14, blur: 17 }[speed],
    }),
  },

  net: {
    params: [{ key: "net", type: "choice", options: ["rope", "weighted", "hooked", "chain"], fields: ["damage", "escapeDC"] }],
    derive: ({ net }) => ({
      damage: { rope: "", weighted: "1d6+2", hooked: "1d6+2", chain: "2d6+3" }[net],
      damageType: net === "hooked" ? "piercing" : "bludgeoning",
      condition: "immobilized",
      escapeDC: { rope: 15, weighted: 17, hooked: 18, chain: 20 }[net],
      escapeSkill: "athletics",
    }),
  },

  roof: {
    params: [
      { key: "debris", type: "choice", options: ["gravel", "stones", "slabs"], fields: ["damage"] },
      { key: "buried", type: "toggle", fields: ["condition", "escapeDC"] },
    ],
    derive: ({ debris, buried }) => ({
      damage: { gravel: "2d6+5", stones: "2d10+13", slabs: "4d10+18" }[debris],
      damageType: "bludgeoning",
      condition: buried ? "immobilized" : "",
      escapeDC: buried ? 20 : 0,
      escapeSkill: "athletics",
    }),
  },

  boulder: {
    params: [
      { key: "boulder", type: "choice", options: ["medium", "large", "huge"], fields: ["damage"] },
      { key: "knockdown", type: "toggle", fields: ["condition"] },
    ],
    derive: ({ boulder, knockdown }) => ({
      damage: { medium: "2d10+7", large: "2d10+13", huge: "4d10+18" }[boulder],
      damageType: "bludgeoning",
      condition: knockdown ? "prone" : "",
    }),
  },

  jet: {
    params: [
      { key: "pressure", type: "choice", options: ["weak", "normal", "strong"], fields: ["damage"] },
      { key: "nozzles", type: "choice", options: ["one", "ring"], fields: ["affects"] },
    ],
    derive: ({ pressure, nozzles }) => ({
      damage: { weak: "1d10+4", normal: "2d10+7", strong: "4d10+10" }[pressure],
      affects: nozzles === "ring" ? "area" : "trigger",
    }),
  },

  // Газ: удушливый — базовый спасбросок Стойкости и тошнота; остальные — успех спасает целиком.
  // Безумие — спасбросок Воли.
  gas: {
    params: [
      { key: "toxin", type: "choice", options: ["choking", "sleep", "smoke", "madness"], fields: ["damage", "condition", "onSave"] },
      { key: "density", type: "choice", options: ["thin", "dense", "thick"], fields: ["saveDC"] },
    ],
    derive: ({ toxin, density }) => ({
      damage: toxin === "choking" ? "2d6+5" : "",
      damageType: "poison",
      condition: { choking: "sickened", sleep: "unconscious", smoke: "dazzled", madness: "frightened" }[toxin],
      conditionValue: { choking: 1, sleep: 0, smoke: 0, madness: 2 }[toxin],
      onSave: toxin === "choking" ? "basic" : "avoid",
      fx: toxin === "sleep" ? "sleep" : "gas",
      saveAbility: toxin === "madness" ? "will" : "fortitude",
      saveDC: { thin: 15, dense: 18, thick: 22 }[density],
    }),
  },

  // Руны: «обычная» — урон из описания (скрытый параметр base), остальные — во столько-то раз больше.
  rune: {
    params: [{ key: "power", type: "choice", options: ["weak", "normal", "strong", "devastating"], fields: ["damage"] }],
    derive: ({ power, base }) => ({ damage: times(base || "2d8", POWER[power] ?? 1) }),
  },

  alarm: {
    params: [{ key: "signal", type: "choice", options: ["bell", "gong", "chime"], fields: ["sound"] }],
    derive: ({ signal }) => ({ sound: { bell: "alarm", gong: "boom", chime: "chime" }[signal] }),
  },
};

export const DEVICE_NAMES = Object.keys(DEVICES);

/** Скрытые параметры устройств: хранятся вместе с остальными, но в окне не показываются. */
const HIDDEN = { rune: ["base"] };

/** Значение параметра по умолчанию: середина выбора, начало диапазона, «выключено». */
function fallback(param) {
  if (param.type === "toggle") return false;
  if (param.type === "range") return param.min;
  return param.options[Math.floor((param.options.length - 1) / 2)];
}

/** Привести параметр к допустимому значению. */
export function normalizeParam(param, value) {
  if (param.type === "toggle") return value === true || value === "true" || value === "on" || value === 1;
  if (param.type === "range") {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback(param);
    const stepped = param.min + Math.round((n - param.min) / param.step) * param.step;
    return Math.min(param.max, Math.max(param.min, stepped));
  }
  return param.options.includes(value) ? value : fallback(param);
}

/** Параметры устройства → полный корректный набор. Неизвестное устройство → {}. */
export function normalizeOptions(device, options = {}) {
  const def = DEVICES[device];
  if (!def) return {};
  const src = options && typeof options === "object" ? options : {};
  const out = Object.fromEntries(def.params.map((p) => [p.key, normalizeParam(p, src[p.key])]));
  for (const key of HIDDEN[device] ?? []) if (typeof src[key] === "string" && src[key]) out[key] = src[key];
  return out;
}

/** Поля ловушки, которые задаёт устройство при этих параметрах (для партии 1 уровня). */
export function deriveDevice(device, options) {
  const def = DEVICES[device];
  return def ? def.derive(normalizeOptions(device, options)) : {};
}

/** Все поля, которыми управляет устройство: по ним окно показывает «задано устройством». */
export function deviceFields(device) {
  const def = DEVICES[device];
  if (!def) return [];
  return [...new Set(Object.keys(def.derive(normalizeOptions(device, {}))))];
}
