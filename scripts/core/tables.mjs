/* Таблицы GM Core (Pathfinder 2e Remaster, «Building Hazards», с. 109–111; опыт — с. 99).
   Источник чисел: Archives of Nethys, https://2e.aonprd.com/Rules.aspx?ID=2868, 2869, 2870, 2857.
   Механика — по лицензии ORC. Таблицы книги покрывают уровни −1…24. */

export const MIN_LEVEL = -1;
export const MAX_LEVEL = 24;

export const clampLevel = (level) => Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(Number(level) || 0)));

/** Таблица 2–13: Скрытность и Сл обезвреживания — [экстремальная, высокая, низкая (верх)]. */
const STEALTH_DISABLE = {
  "-1": [18, 15, 12], 0: [19, 16, 13], 1: [20, 17, 14], 2: [21, 18, 15], 3: [23, 20, 17], 4: [25, 22, 18],
  5: [26, 23, 20], 6: [28, 25, 21], 7: [30, 27, 23], 8: [31, 28, 24], 9: [33, 30, 26], 10: [35, 32, 27],
  11: [36, 33, 29], 12: [38, 35, 30], 13: [40, 37, 32], 14: [41, 38, 33], 15: [43, 40, 35], 16: [45, 42, 36],
  17: [46, 43, 38], 18: [48, 45, 39], 19: [50, 47, 41], 20: [51, 48, 42], 21: [53, 50, 44], 22: [55, 52, 45],
  23: [56, 53, 46], 24: [58, 55, 48],
};

/**
 * Таблица 2–16: нападение — [атака простой ловушки, урон простой ловушки, средний урон,
 * Сл эффекта экстремальная, высокая].
 */
const OFFENSE = {
  "-1": [10, "2d4+1", 6, 19, 16], 0: [11, "2d6+3", 10, 19, 16], 1: [13, "2d6+5", 12, 20, 17],
  2: [14, "2d10+7", 18, 22, 18], 3: [16, "2d10+13", 24, 23, 20], 4: [17, "4d8+10", 28, 25, 21],
  5: [19, "4d8+14", 32, 26, 22], 6: [20, "4d8+18", 36, 27, 24], 7: [22, "4d10+18", 40, 29, 25],
  8: [23, "4d10+22", 44, 30, 26], 9: [25, "4d10+26", 48, 32, 28], 10: [26, "4d12+26", 52, 33, 29],
  11: [28, "4d12+30", 56, 34, 30], 12: [29, "6d10+27", 60, 36, 32], 13: [31, "6d10+31", 64, 37, 33],
  14: [32, "6d10+35", 68, 39, 34], 15: [34, "6d12+33", 72, 40, 36], 16: [35, "6d12+35", 74, 41, 37],
  17: [37, "6d12+37", 76, 43, 38], 18: [38, "6d12+41", 80, 44, 40], 19: [40, "8d10+40", 84, 46, 41],
  20: [41, "8d10+44", 88, 47, 42], 21: [43, "8d10+48", 92, 48, 44], 22: [44, "8d10+52", 96, 50, 45],
  23: [46, "8d12+48", 100, 51, 46], 24: [47, "8d12+52", 104, 52, 48],
};

/** Таблица 10–14: опыт за простую ловушку по разнице «уровень ловушки − уровень партии». */
const SIMPLE_XP = { "-4": 2, "-3": 3, "-2": 4, "-1": 6, 0: 8, 1: 12, 2: 16, 3: 24, 4: 30 };

/**
 * Таблица 2–14: минимальный ранг для обнаружения и обезвреживания, столбец «умеренный»:
 * 0 и ниже — без ранга, 1–8 — обучен, 9–18 — эксперт, 19+ — мастер.
 */
export function moderateRank(level) {
  const l = clampLevel(level);
  if (l <= 0) return 0;
  if (l <= 8) return 1;
  if (l <= 18) return 2;
  return 3;
}

/** Столбец «высокий»: 1–4 — обучен (эксперт для Внимательности), 5–8 — эксперт, 9–18 — мастер, 19+ — легенда. */
export function highRank(level, perception = false) {
  const l = clampLevel(level);
  if (l <= 0) return 0;
  if (l <= 4) return perception ? 2 : 1;
  if (l <= 8) return 2;
  if (l <= 18) return 3;
  return 4;
}

const row = (table, level) => table[clampLevel(level)];

/** Скрытность / Сл обезвреживания по уровню: kind — "extreme" | "high" | "low". */
export const stealthDC = (level, kind = "high") => row(STEALTH_DISABLE, level)[{ extreme: 0, high: 1, low: 2 }[kind] ?? 1];
/** Сл эффекта (спасброска) по уровню: kind — "extreme" | "high". */
export const effectDC = (level, kind = "high") => row(OFFENSE, level)[kind === "extreme" ? 3 : 4];
/** Атака простой ловушки по уровню. */
export const hazardAttack = (level) => row(OFFENSE, level)[0];
/** Урон простой ловушки по уровню: формула и среднее. */
export const hazardDamage = (level) => ({ formula: row(OFFENSE, level)[1], average: row(OFFENSE, level)[2] });

/** На сколько вырастают Сл обнаружения и обезвреживания с уровня from до to. */
export const dcShift = (from, to) => stealthDC(to) - stealthDC(from);
/** На сколько вырастает Сл спасброска. */
export const saveShift = (from, to) => effectDC(to) - effectDC(from);
/** На сколько вырастает атака. */
export const attackShift = (from, to) => hazardAttack(to) - hazardAttack(from);
/** Во сколько раз больше урона. */
export const damageFactor = (from, to) => hazardDamage(to).average / hazardDamage(from).average;
/** На сколько растёт нужный ранг (умеренный столбец). */
export const rankShift = (from, to) => moderateRank(to) - moderateRank(from);

/** Опыт за простую ловушку уровня level для партии уровня party (ниже party − 4 — 0). */
export function hazardXp(level, party) {
  const diff = Math.round(Number(level) || 0) - Math.round(Number(party) || 1);
  if (diff < -4) return 0;
  return SIMPLE_XP[Math.min(4, diff)];
}
