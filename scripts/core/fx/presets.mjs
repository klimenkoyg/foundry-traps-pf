/* Анимации ловушек: встроенный эффект, звук по умолчанию и записи JB2A для Sequencer.
   JB2A заменяет встроенный эффект только там, где у него есть подходящая анимация: облака газа,
   стихии рун и печатей, кислота, обвал. Механика — ямы, колья, капкан, дротики, стрелы, сеть,
   валун, коса, струя огня, сигнал — всегда своя: JB2A показал бы не то устройство (у валуна —
   брошенный камень, у струи — взрыв). Если Sequencer и JB2A стоят, берётся первая запись, которая
   есть в базе Sequencer (бесплатная и Patreon-версии называют файлы по-разному). */

import { EFFECT_NAMES } from "./painters.mjs";

export const FX_PRESETS = {
  pit: { sound: "thud", jb2a: [] },
  spikes: { sound: "thud", jb2a: [] },
  jaws: { sound: "snap", jb2a: [] },
  darts: { sound: "whoosh", jb2a: [] },
  arrows: { sound: "whoosh", jb2a: [] },
  net: { sound: "whoosh", jb2a: [] },
  rocks: { sound: "rumble", jb2a: ["jb2a.falling_rocks.top.1x1.grey.0", "jb2a.falling_rocks"] },
  boulder: { sound: "rumble", jb2a: [] },
  fire: { sound: "fire", jb2a: [] },
  gas: { sound: "hiss", jb2a: ["jb2a.fog_cloud.02.green", "jb2a.fog_cloud.2.green", "jb2a.stinking_cloud", "jb2a.fog_cloud"] },
  sleep: { sound: "hiss", jb2a: ["jb2a.fog_cloud.02.pinkpurple", "jb2a.sleep.cloud.01.pink", "jb2a.fog_cloud"] },
  lightning: { sound: "zap", jb2a: ["jb2a.static_electricity.03.blue", "jb2a.static_electricity.01.blue", "jb2a.chain_lightning.primary.blue"] },
  frost: { sound: "crack", jb2a: ["jb2a.impact_themed.ice_shard.blue", "jb2a.ice_spikes.radial.burst.white", "jb2a.impact.frost"] },
  acid: { sound: "sizzle", jb2a: ["jb2a.liquid.splash.green", "jb2a.liquid.splash", "jb2a.impact.green"] },
  thunder: { sound: "boom", jb2a: ["jb2a.thunderwave.center.blue", "jb2a.thunderwave.center", "jb2a.shatter.blue"] },
  necrotic: { sound: "drone", jb2a: ["jb2a.toll_the_dead.purple.skull_smoke", "jb2a.toll_the_dead.purple", "jb2a.divine_smite.target.purplepink"] },
  blade: { sound: "slash", jb2a: [] },
  alarm: { sound: "alarm", jb2a: [] },
  burst: { sound: "click", jb2a: [] },
};

export const FX_NAMES = EFFECT_NAMES.filter((name) => name in FX_PRESETS);

export const SOUND_NAMES = [
  "click", "thud", "whoosh", "hiss", "fire", "zap", "crack", "boom",
  "slash", "rumble", "alarm", "sizzle", "snap", "drone", "chime",
];

/** Встроенный звук → путь в модуле; свой путь (с «/» или точкой) — как есть; пусто — без звука. */
export function soundPath(sound, moduleId) {
  if (!sound) return "";
  if (SOUND_NAMES.includes(sound)) return `modules/${moduleId}/sounds/${sound}.wav`;
  return /[/.]/.test(sound) ? sound : "";
}

/** Разделы JB2A, которые годятся для ловушек и опасностей (второе слово записи: jb2a.<раздел>.…). */
const JB2A_TOPICS = /fire|flame|burn|explo|fog|cloud|smoke|gas|poison|stink|acid|liquid|splash|slime|ice|frost|snow|cold|sleet|lightning|static|electric|spark|thunder|shatter|wave|dark|necro|toll|skull|web|entangle|vine|thorn|plant|rock|stone|boulder|ground|crack|earth|impact|spike|blade|dagger|arrow|bolt|dart|rune|sign|glyph|magic_circle|grease|blast|burst|trap|chain|spirit|swirl|energy/i;
/** Совпали по слову, но к ловушкам не относятся (камни иоун, светлячки, духовное оружие…). */
const JB2A_SKIP = /ioun|fireflies|firework|spiritual_weapon|snowball/i;
/** Куски одной анимации: ловушка играет её целиком, кусок сам по себе не нужен. */
const JB2A_PARTS = /\.(intro|outro|still_frame)(\.|$)/;
/** Сколько вариантов одного раздела показывать: у Patreon-версии их сотни (цвета). */
export const JB2A_PER_TOPIC = 40;

/**
 * Записи JB2A из базы Sequencer → разделы для выбора: [{ label, options: [{ value, label }] }].
 * Варианты одной анимации (…grey.0, …grey.1) и длины полёта (…05ft, …30ft) сливаются в одну запись —
 * Sequencer берёт случайный вариант и нужную длину; петля (…loop…) пропускается, если есть та же
 * анимация целиком (…complete…).
 */
export function jb2aGroups(entries, { perTopic = JB2A_PER_TOPIC } = {}) {
  const keys = new Set();
  for (const full of entries ?? []) {
    if (typeof full !== "string" || !full.startsWith("jb2a.")) continue;
    // …01.30ft — полёт на 30 футов: длину Sequencer подбирает сам по расстоянию (см. flightPath).
    const key = full.replace(/(\.\d+)+$/, "").replace(/\.\d+ft$/, "");
    if (!JB2A_PARTS.test(key)) keys.add(key);
  }
  const groups = new Map();
  for (const key of keys) {
    if (/\.loop(\.|$)/.test(key) && keys.has(key.replace(/\.loop(\.|$)/, ".complete$1"))) continue;
    const [, topic, ...rest] = key.split(".");
    if (!topic || !JB2A_TOPICS.test(topic) || JB2A_SKIP.test(topic)) continue;
    const list = groups.get(topic) ?? groups.set(topic, new Map()).get(topic);
    if (list.size < perTopic) list.set(key, (rest.join(" · ") || topic).replace(/_/g, " "));
  }
  const nice = (s) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([topic, list]) => ({ label: nice(topic), options: [...list.entries()].map(([value, label]) => ({ value, label })) }));
}

/**
 * Полёт через область (стрела, болт, луч JB2A): вдоль длинной стороны, с полклетки запаса по краям,
 * чтобы снаряд пересёк всю область. at — центр, width/height — стороны в px.
 */
export function flightPath(at, width, height, cell = 0) {
  const pad = cell / 2;
  if (width >= height) return { from: { x: at.x - width / 2 - pad, y: at.y }, to: { x: at.x + width / 2 + pad, y: at.y } };
  return { from: { x: at.x, y: at.y - height / 2 - pad }, to: { x: at.x, y: at.y + height / 2 + pad } };
}

/** Первая запись JB2A, которая есть в базе. has(key) — проверка Sequencer.Database. */
export function pickJb2a(fx, has) {
  for (const key of FX_PRESETS[fx]?.jb2a ?? []) {
    try {
      if (has(key)) return key;
    } catch {
      /* база Sequencer ещё не готова */
    }
  }
  return null;
}
