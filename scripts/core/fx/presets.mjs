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
