/* Всё, что зависит от системы Pathfinder 2e (pf2e 7.x на Foundry v13, 8.x на v14): броски,
   урон с иммунитетами, слабостями и сопротивлениями, состояния, подписи. API одинаков в обеих
   версиях, кроме видимости броска: rollMode в 7.x, messageMode в 8.x — передаём оба. */

import { CONDITIONS, DAMAGE_TYPES, DISARM_SKILLS, ESCAPE_SKILLS, isValued, SAVES } from "../core/trap.mjs";
import { RANK_KEYS } from "../core/degrees.mjs";
import { t } from "./i18n.mjs";

export const isPf2e = () => game.system.id === "pf2e";

const cfg = () => globalThis.CONFIG?.PF2E ?? {};
const loc = (s) => (s ? game.i18n.localize(s) : "");
/** Подпись из модуля, если перевод есть, иначе — из системы, иначе — ключ. */
const own = (key) => (game.i18n.has?.(`TRAPS.${key}`) ? t(key) : "");

/**
 * Опции броска «против ловушки»: по ним срабатывают «Поиск ловушек» (Trap Finder), «Чутьё на
 * опасности» и похожие черты. «trap» — только при обезвреживании: на неё завязана
 * «Осторожное обезвреживание» (Wary Disarmament).
 */
export const TRAP_OPTIONS = ["origin:trait:trap", "origin:type:hazard", "hazard"];
const DISARM_OPTIONS = [...TRAP_OPTIONS, "trap"];

/* ---------- подписи ---------- */

export function saveLabel(key) {
  return own(`Save.${key}`) || loc(cfg().saves?.[key]) || key;
}

/** «спасбросок Рефлекса» — название спасброска после слова «спасбросок» (по-русски — в родительном падеже). */
export function saveOf(key) {
  return own(`SaveOf.${key}`) || saveLabel(key);
}

export function saveAbbr(key) {
  return own(`SaveShort.${key}`) || saveLabel(key);
}

export function damageLabel(key) {
  return own(`Damage.${key}`) || loc(cfg().damageTypes?.[key]) || key;
}

export function skillLabel(key) {
  if (key === "perception") return own("Skill.perception") || loc("PF2E.PerceptionLabel") || "Perception";
  const entry = cfg().skills?.[key];
  return own(`Skill.${key}`) || loc(entry?.label ?? entry) || key;
}

export function rankLabel(rank) {
  const r = Math.max(0, Math.min(4, Number(rank) || 0));
  return own(`Rank.${RANK_KEYS[r]}`) || loc(cfg().proficiencyLevels?.[r]) || RANK_KEYS[r];
}

export function conditionLabel(id, value = 0) {
  if (!id) return "";
  const name =
    own(`Condition.${id}`) ||
    game.pf2e?.ConditionManager?.getCondition?.(id)?.name ||
    loc(cfg().conditionTypes?.[id]) ||
    id;
  return isValued(id) && value ? `${name} ${value}` : name;
}

/** Списки для выпадающих меню схемы поведения и окна настройки. */
export const choices = {
  saves: () => ({ "": "—", ...Object.fromEntries(SAVES.map((k) => [k, saveLabel(k)])) }),
  damageTypes: () => Object.fromEntries(DAMAGE_TYPES.map((k) => [k, damageLabel(k)])),
  damageTypesOptional: () => ({ "": "—", ...choices.damageTypes() }),
  skills: () => Object.fromEntries(DISARM_SKILLS.map((k) => [k, skillLabel(k)])),
  escapeSkills: () => Object.fromEntries(ESCAPE_SKILLS.map((k) => [k, skillLabel(k)])),
  conditions: () => ({ "": "—", ...Object.fromEntries(CONDITIONS.map((k) => [k, conditionLabel(k)])) }),
  ranks: () => Object.fromEntries(RANK_KEYS.map((k, i) => [String(i), rankLabel(i)])),
};

/* ---------- характеристики ---------- */

/** Навык, Внимательность или спасбросок персонажа (Statistic системы) или null. */
function statistic(actor, slug) {
  try {
    if (slug === "perception") return actor?.perception ?? actor?.getStatistic?.("perception") ?? null;
    if (SAVES.includes(slug)) return actor?.saves?.[slug] ?? actor?.getStatistic?.(slug) ?? null;
    return actor?.skills?.[slug] ?? actor?.getStatistic?.(slug) ?? null;
  } catch {
    return null;
  }
}

/** Ранг мастерства: 0 — не обучен … 4 — легенда. У чудовищ ранга нет — считаем, что хватает. */
export function rankOf(actor, slug) {
  const rank = statistic(actor, slug)?.rank;
  if (rank === null || rank === undefined) return actor?.type === "character" ? 0 : 4;
  return Number(rank) || 0;
}

/** КБ персонажа против ловушки (с бонусами вроде «Поиска ловушек»). */
export function armorClass(actor) {
  try {
    const parent = actor?.armorClass?.parent;
    const value = parent?.withRollOptions?.({ extraRollOptions: TRAP_OPTIONS })?.dc?.value;
    if (Number.isFinite(value)) return value;
  } catch {
    /* ниже — без бонусов против ловушек */
  }
  return Number(actor?.armorClass?.value ?? actor?.system?.attributes?.ac?.value ?? 10);
}

/** Выбрал ли персонаж в исследовании «Поиск». */
export function isSearching(actor) {
  const ids = actor?.system?.exploration;
  if (!Array.isArray(ids)) return false;
  return ids.some((id) => {
    const item = actor.items?.get?.(id);
    return item && (item.slug === "search" || item.system?.slug === "search" || item.sourceId === SEARCH_UUID || item._stats?.compendiumSource === SEARCH_UUID);
  });
}
const SEARCH_UUID = "Compendium.pf2e.actionspf2e.Item.TiNDYUGlMmxzxBYU";

function hitPoints(actor) {
  const hp = actor?.hitPoints ?? actor?.system?.attributes?.hp;
  return hp ? Number(hp.value ?? 0) + Number(hp.temp ?? 0) : null;
}

/* ---------- броски ---------- */

/** Видимость броска для обеих версий системы: public, blind (видит только ведущий). */
const visibility = (kind) =>
  kind === "blind" ? { messageMode: "blind", rollMode: "blindroll" } : kind === "gm" ? { messageMode: "gm", rollMode: "gmroll" } : {};

/** Итог броска системы → { total, natural, degree, roll }. */
const checkOf = (roll) =>
  roll ? { total: Number(roll.total) || 0, natural: roll.dice?.[0]?.total ?? null, degree: roll.degreeOfSuccess ?? roll.options?.degreeOfSuccess ?? null, roll } : null;

/** Запасной бросок, если система не смогла: d20 + модификатор. */
async function fallback(actor, slug, dc, { message = false, flavor = "" } = {}) {
  const mod = Number(statistic(actor, slug)?.mod ?? 0);
  const roll = await new Roll("1d20 + @mod", { mod }).evaluate();
  if (message) await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor });
  return checkOf(roll);
}

/** Спасбросок без окна и без сообщения — итог сразу в карточку. → { total, natural, degree, roll }. */
export async function rollSave(actor, save, dc, { disarming = false } = {}) {
  try {
    const roll = await statistic(actor, save)?.roll({
      dc: { value: dc },
      skipDialog: true,
      createMessage: false,
      extraRollOptions: disarming ? DISARM_OPTIONS : TRAP_OPTIONS,
      identifier: "ssl-traps",
    });
    if (roll) return checkOf(roll);
  } catch (err) {
    console.warn("ssl_traps_pf2e | спасбросок pf2e не удался, бросаю сам", err);
  }
  return fallback(actor, save, dc);
}

/**
 * Спасбросок, который бросает сам игрок (или ведущий за него): с окном модификаторов системы и
 * её сообщением в чате — кубики видят все. → { total, natural, degree, roll } или null (окно закрыли).
 */
export async function rollSaveVisible(actor, save, dc, { disarming = false } = {}) {
  try {
    const stat = statistic(actor, save);
    if (stat) {
      const roll = await stat.roll({
        dc: { value: dc },
        extraRollOptions: disarming ? DISARM_OPTIONS : TRAP_OPTIONS,
          identifier: "ssl-traps",
      });
      return checkOf(roll);
    }
  } catch (err) {
    console.warn("ssl_traps_pf2e | спасбросок pf2e не удался, бросаю сам", err);
  }
  return fallback(actor, save, dc, { message: true, flavor: t("Chat.saveFlavor", { save: saveOf(save), dc }) });
}

/** Атака ловушки → { roll, natural }. */
export async function rollAttack(bonus) {
  const roll = await new Roll("1d20 + @bonus", { bonus }).evaluate();
  const natural = roll.dice[0]?.total ?? 0;
  return { roll, natural };
}

/**
 * Проверка навыка или Внимательности против Сл. С сообщением в чате.
 * configure — с окном модификаторов (так бросает сам игрок); secret — тайно: итог видит только
 * ведущий (поиск ловушек). → { total, natural, degree, roll } или null (окно закрыли).
 */
export async function rollCheck(actor, slug, dc, { configure = false, secret = false, disarming = false } = {}) {
  const stat = statistic(actor, slug);
  try {
    if (stat) {
      const roll = await stat.roll({
        ...(Number.isFinite(dc) ? { dc: { value: dc } } : {}),
        skipDialog: !configure,
        extraRollOptions: [...(disarming ? DISARM_OPTIONS : TRAP_OPTIONS), ...(slug === "perception" ? ["trap-finder"] : [])],
        ...(secret ? { traits: ["secret"], ...visibility("blind") } : {}),
        identifier: "ssl-traps",
      });
      if (roll) return checkOf(roll);
      if (configure) return null; // окно закрыли
    }
  } catch (err) {
    console.warn("ssl_traps_pf2e | проверка pf2e не удалась, бросаю сам", err);
  }
  const check = await fallback(actor, slug, dc, { message: !secret, flavor: skillLabel(slug) });
  return check;
}

/* ---------- урон и состояния ---------- */

const damageRollClass = () => globalThis.CONFIG?.Dice?.rolls?.find?.((r) => r.name === "DamageRoll") ?? null;

/** Исход для сообщения системы о нанесённом уроне. */
const OUTCOMES = ["criticalFailure", "failure", "success", "criticalSuccess"];

/**
 * Нанести урон ловушки с иммунитетами, слабостями и сопротивлениями.
 * parts: [{ value, type, formula, persistent }] — урон уже брошен (продолжительный — формулой);
 * multiplier — 2 (крит. провал или крит), 1, 0.5 (успех базового спасбросока), 0.
 * withPersistent — вешать ли продолжительный урон. → сколько хитов реально снято (или null).
 */
export async function applyDamage(actor, token, parts, multiplier, { withPersistent = multiplier >= 1, degree = null } = {}) {
  const instant = parts.filter((p) => !p.persistent && p.value > 0);
  const lasting = withPersistent ? parts.filter((p) => p.persistent && p.formula) : [];
  if ((!instant.length || multiplier <= 0) && !lasting.length) return 0;
  const before = hitPoints(actor);
  const DamageRoll = damageRollClass();
  const instances = [
    ...(multiplier > 0 ? instant.map((p) => `(${p.value})[${p.type}]`) : []),
    ...lasting.map((p) => `(${p.formula})[persistent,${p.type}]`),
  ];
  const outcome = degree === null || degree === undefined ? null : OUTCOMES[degree] ?? null;
  const rollOptions = new Set(TRAP_OPTIONS);
  if (DamageRoll && instances.length) {
    let roll = await new DamageRoll(`{${instances.join(",")}}`).evaluate();
    // Вдвое и половину делает сама система — как её кнопки в чате (половина — с округлением вниз).
    if (multiplier !== 1 && multiplier > 0) roll = roll.alter(multiplier, 0);
    await actor.applyDamage({ damage: roll, token, rollOptions, outcome });
  } else {
    // Нет класса броска урона (система не загрузилась?) — числом, без сопротивлений.
    const total = Math.floor(instant.reduce((s, p) => s + p.value, 0) * multiplier);
    if (total > 0) await actor.applyDamage({ damage: total, token, rollOptions, outcome });
  }
  const after = hitPoints(actor);
  return before === null || after === null ? null : Math.max(0, before - after);
}

/** Наложить состояние: со значением — «не меньше value» (напуган 1 не станет 3 от второй ловушки). */
export async function applyCondition(actor, id, value = 0) {
  if (!id || !actor) return false;
  try {
    if (isValued(id)) {
      const want = Math.max(1, Number(value) || 1);
      const have = actor.getCondition?.(id);
      if (have) {
        if ((have.value ?? 0) < want) await game.pf2e.ConditionManager.updateConditionValue(have.id, actor, want);
      } else await actor.increaseCondition(id, { value: want });
      return true;
    }
    if (actor.hasCondition?.(id)) return true;
    if (actor.toggleCondition) await actor.toggleCondition(id, { active: true });
    else await actor.increaseCondition(id);
    return true;
  } catch (err) {
    console.warn(`ssl_traps_pf2e | состояние ${id} не наложено`, err);
    return false;
  }
}
