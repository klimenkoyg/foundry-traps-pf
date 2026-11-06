/* Степени успеха PF2e (Player Core, «Checks»): критический провал, провал, успех, критический
   успех. Без Foundry — всё здесь покрыто тестами. */

export const CRIT_FAILURE = 0;
export const FAILURE = 1;
export const SUCCESS = 2;
export const CRIT_SUCCESS = 3;

/** Ключи степеней по порядку — для подписей (TRAPS.Degree.<ключ>). */
export const DEGREE_KEYS = ["critFailure", "failure", "success", "critSuccess"];

const clamp = (n) => Math.min(CRIT_SUCCESS, Math.max(CRIT_FAILURE, n));

/**
 * Степень успеха проверки: на 10 и больше выше Сл — критический успех, не ниже Сл — успех,
 * на 10 и больше ниже — критический провал. Естественная 20 поднимает исход на ступень,
 * естественная 1 — опускает.
 */
export function degreeOf(total, dc, natural = null) {
  const t = Number(total) || 0;
  const d = Number(dc) || 0;
  let degree = t >= d + 10 ? CRIT_SUCCESS : t >= d ? SUCCESS : t <= d - 10 ? CRIT_FAILURE : FAILURE;
  if (natural === 20) degree += 1;
  else if (natural === 1) degree -= 1;
  return clamp(degree);
}

/** Степень, которую прислала система (0–3), или null, если её нет. */
export function validDegree(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= CRIT_FAILURE && n <= CRIT_SUCCESS && value !== null && value !== "" ? n : null;
}

/**
 * Итог проверки: степень от системы (она учитывает «Увёртливость» и прочие особенности),
 * иначе — посчитанная по итогу и Сл.
 */
export const degreeFor = (check, dc) => validDegree(check?.degree) ?? degreeOf(check?.total, dc, check?.natural ?? null);

/** Доля урона по базовому спасброску: крит. успех — 0, успех — половина, провал — весь, крит. провал — вдвое. */
export const BASIC_MULTIPLIER = [2, 1, 0.5, 0];

/** Ранги мастерства: 0 — не обучен … 4 — легенда. */
export const RANKS = [0, 1, 2, 3, 4];
export const RANK_KEYS = ["untrained", "trained", "expert", "master", "legendary"];

/** Хватает ли ранга: need 0 — может любой. */
export const hasRank = (rank, need = 0) => (Number(rank) || 0) >= (Number(need) || 0);
