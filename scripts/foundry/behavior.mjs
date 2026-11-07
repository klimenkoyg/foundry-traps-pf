/* Поведения областей модуля.
   «Ловушка» — все параметры ловушки; срабатывает, когда в область заходит токен, если у ловушки
   нет триггеров и она не «только вручную». С «каждый ход» (природные опасности) — ещё и в бою,
   в начале хода каждого, кто стоит в области.
   «Триггер ловушки» — отдельная область (плита, растяжка): наступили на неё — срабатывает ловушка,
   на которую она ссылается, и бьёт всех в своей области. Триггеров у ловушки может быть несколько.
   Окно настройки поведения Foundry строит само по схеме — так любую расставленную ловушку
   можно поправить в обычном окне области. */

import { FX_NAMES } from "../core/fx/presets.mjs";
import { rectCenter, rectContains } from "../core/geometry.mjs";
import { MAX_ACTIVATORS, SEVERITIES } from "../core/trap.mjs";
import { MAX_LEVEL, MIN_LEVEL } from "../core/tables.mjs";
import { ACTIVATOR_TYPE, BEHAVIOR_TYPE, SETTINGS } from "./constants.mjs";
import { choices } from "./pf2e.mjs";
import { t } from "./i18n.mjs";
import { activatorsOf, regionBounds, trapOfActivator } from "./scene.mjs";
import { setting } from "./settings.mjs";
import { fireTrap } from "./trigger.mjs";

const { RegionBehaviorType } = foundry.data.regionBehaviors;
const f = foundry.data.fields;

const labelled = (prefix, keys) => () => Object.fromEntries(keys.map((k) => [k, t(`${prefix}.${k}`)]));

/** Срабатывает ли ловушка на этот токен (настройка «на кого»). */
function canTrigger(token) {
  if (!token?.actor) return false;
  if (setting(SETTINGS.triggerBy) === "all") return true;
  return Boolean(token.actor.hasPlayerOwner);
}

export class TrapBehavior extends RegionBehaviorType {
  static LOCALIZATION_PREFIXES = ["TRAPS.Behavior"];

  static defineSchema() {
    const dc = (initial) => new f.NumberField({ required: true, nullable: false, integer: true, min: 0, max: 70, initial });
    const rank = (initial) => new f.NumberField({ required: true, nullable: false, integer: true, min: 0, max: 4, initial, choices: choices.ranks });
    const formula = () => new f.StringField({ required: true, blank: true, initial: "" });
    return {
      trapId: new f.StringField({ required: true, blank: true, initial: "" }),
      icon: new f.StringField({ required: true, blank: false, initial: "fa-solid fa-triangle-exclamation" }),
      severity: new f.StringField({ required: true, initial: "dangerous", choices: labelled("TRAPS.Severity", SEVERITIES) }),
      level: new f.NumberField({ required: true, nullable: false, integer: true, min: MIN_LEVEL, max: MAX_LEVEL, initial: 1 }),
      magical: new f.BooleanField({ initial: false }),
      natural: new f.BooleanField({ initial: false }),
      everyTurn: new f.BooleanField({ initial: false }),
      visible: new f.BooleanField({ initial: false }),
      image: new f.StringField({ required: true, blank: true, initial: "" }),
      jb2a: new f.StringField({ required: true, blank: true, initial: "" }),
      affects: new f.StringField({ required: true, initial: "trigger", choices: labelled("TRAPS.Affects", ["trigger", "area"]) }),
      stops: new f.BooleanField({ initial: false }),
      detectDC: dc(17),
      detectRank: rank(0),
      detectRange: new f.NumberField({ required: true, nullable: false, integer: true, min: 5, max: 120, initial: 10 }),
      disarmDC: dc(17),
      disarmSkill: new f.StringField({ required: true, initial: "thievery", choices: choices.skills }),
      disarmRank: rank(1),
      disarmSuccesses: new f.NumberField({ required: true, nullable: false, integer: true, min: 1, max: 5, initial: 1 }),
      attackBonus: new f.NumberField({ required: false, nullable: true, integer: true, min: -5, max: 60, initial: null }),
      saveAbility: new f.StringField({ required: true, blank: true, initial: "", choices: choices.saves }),
      saveDC: dc(17),
      onSave: new f.StringField({ required: true, initial: "basic", choices: labelled("TRAPS.OnSave", ["basic", "avoid"]) }),
      damage: formula(),
      damageType: new f.StringField({ required: true, initial: "bludgeoning", choices: choices.damageTypes }),
      damage2: formula(),
      damage2Type: new f.StringField({ required: true, blank: true, initial: "", choices: choices.damageTypesOptional }),
      damage2Persistent: new f.BooleanField({ initial: false }),
      condition: new f.StringField({ required: true, blank: true, initial: "", choices: choices.conditions }),
      conditionValue: new f.NumberField({ required: true, nullable: false, integer: true, min: 0, max: 4, initial: 0 }),
      fx: new f.StringField({ required: true, initial: "burst", choices: labelled("TRAPS.Fx", FX_NAMES) }),
      sound: new f.StringField({ required: true, blank: true, initial: "" }),
      rearm: new f.StringField({ required: true, initial: "auto", choices: labelled("TRAPS.Rearm", ["auto", "once"]) }),
      device: new f.StringField({ required: true, blank: true, initial: "" }),
      options: new f.ObjectField({ required: true, initial: {} }),
      fixedDamage: new f.BooleanField({ initial: false }),
      escapeDC: dc(0),
      escapeSkill: new f.StringField({ required: true, initial: "athletics", choices: choices.escapeSkills }),
      manual: new f.BooleanField({ initial: false }),
      activators: new f.NumberField({ required: true, nullable: false, integer: true, min: 0, max: MAX_ACTIVATORS, initial: 0 }),
      flavor: new f.StringField({ required: true, blank: true, initial: "" }),
      notes: new f.StringField({ required: true, blank: true, initial: "" }),
      size: new f.NumberField({ required: true, nullable: false, integer: true, min: 1, max: 12, initial: 1 }),
      width: new f.NumberField({ required: true, nullable: false, integer: true, min: 1, max: 12, initial: 1 }),
      height: new f.NumberField({ required: true, nullable: false, integer: true, min: 1, max: 12, initial: 1 }),
      detected: new f.BooleanField({ initial: false }),
      disarmed: new f.BooleanField({ initial: false }),
      triggers: new f.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
    };
  }

  static events = {
    [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: TrapBehavior.#onMoveIn,
    ...(CONST.REGION_EVENTS.TOKEN_TURN_START ? { [CONST.REGION_EVENTS.TOKEN_TURN_START]: TrapBehavior.#onTurnStart } : {}),
  };

  /** Токен вошёл в область ловушки: срабатывает, если у неё нет триггеров и она не «вручную». */
  static async #onMoveIn(event) {
    if (this.manual) return;
    const region = this.parent.region ?? this.parent.parent;
    if (activatorsOf(region).length) return;
    await stepOn(event, this.parent, {});
  }

  /**
   * Бой: ход начался у токена, который стоит в области. «Каждый ход» — бьёт только его (у остальных
   * будет свой ход). Триггеры тут ни при чём: опасность действует, пока стоишь внутри.
   */
  static async #onTurnStart(event) {
    if (!this.everyTurn || this.manual) return;
    const token = event.data?.token;
    if (!canTrigger(token) || !game.user.isActiveGM) return;
    await fireTrap(this.parent, { trigger: token, targets: [token], cause: "turn" });
  }
}

/**
 * Область-триггер: ссылается на область ловушки (её id на той же сцене). Ставит её модуль —
 * вместе с ловушкой или кнопкой «Добавить триггер»; ведущий двигает и меняет её как обычную область.
 */
export class ActivatorBehavior extends RegionBehaviorType {
  static LOCALIZATION_PREFIXES = ["TRAPS.ActivatorBehavior"];

  static defineSchema() {
    return {
      trap: new f.StringField({ required: true, blank: true, initial: "" }),
    };
  }

  static events = {
    [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: ActivatorBehavior.#onMoveIn,
  };

  /** Наступили на триггер: срабатывает его ловушка — по всем в её области. */
  static async #onMoveIn(event) {
    const region = this.parent.region ?? this.parent.parent;
    const found = trapOfActivator(region);
    if (!found || found.behavior.disabled || found.behavior.system.manual) return;
    // Триггер внутри области ловушки — наступивший тоже под ударом; снаружи — нет.
    const stepperInside = rectContains(regionBounds(found.region), rectCenter(regionBounds(region)));
    await stepOn(event, found.behavior, { viaActivator: true, stepperInside });
  }
}

/**
 * Токен наступил на область (саму ловушку или её триггер). Событие приходит всем клиентам.
 * Ловушку не пройти: тот, кто двигал токен, останавливает его на ней — остаток пути отменяется.
 * Foundry сообщает о входе в область уже в начале хода, если путь проходит через неё, а токен ещё
 * идёт; поэтому ведущий ждёт, пока токен у него на экране дойдёт до ловушки, и только тогда
 * разыгрывает её (так же делает пример нажимной плиты в самом Foundry).
 */
async function stepOn(event, trapBehavior, options) {
  const token = event.data?.token;
  const movement = event.data?.movement;
  // Токен сдвинули принудительно (ведущий перетащил без хода) — не считается.
  if (movement?.passed?.waypoints?.at(-1)?.action === "displace") return;
  if (!canTrigger(token)) return;

  if (event.user?.isSelf && movement && game.users.activeGM) {
    try {
      token.stopMovement();
    } catch (err) {
      console.warn("ssl_traps_pf2e | не удалось остановить движение", err);
    }
  }
  if (!game.user.isActiveGM) return;
  await arrival(token);
  await intoCell(token);
  await fireTrap(trapBehavior, { trigger: token, ...options });
}

/**
 * Foundry останавливает токен ровно на краю области — между клетками. Ставим его в клетку ловушки:
 * мгновенно («displace» — так ловушка не сработает второй раз). Только на квадратной сетке.
 */
async function intoCell(token) {
  const grid = token?.parent?.grid;
  if (!grid || typeof token.move !== "function" || grid.type !== CONST.GRID_TYPES?.SQUARE) return;
  const size = grid.size || 100;
  const x = Math.round(token.x / size) * size;
  const y = Math.round(token.y / size) * size;
  if (x === token.x && y === token.y) return;
  try {
    await token.move({ x, y, action: "displace" });
  } catch (err) {
    console.warn("ssl_traps_pf2e | не удалось поставить токен в клетку", err);
  }
}

/** Дождаться, пока токен дойдёт до места по анимации (не дольше 10 с: вдруг анимация не закончится). */
async function arrival(token) {
  const walking = token?.rendered ? token.object?.movementAnimationPromise : null;
  if (!walking) return;
  try {
    await Promise.race([walking, new Promise((resolve) => setTimeout(resolve, 10000))]);
  } catch {
    /* анимацию прервали — разыгрываем сразу */
  }
}

export function registerBehavior() {
  CONFIG.RegionBehavior.dataModels[BEHAVIOR_TYPE] = TrapBehavior;
  CONFIG.RegionBehavior.typeIcons[BEHAVIOR_TYPE] = "fa-solid fa-skull-crossbones";
  CONFIG.RegionBehavior.dataModels[ACTIVATOR_TYPE] = ActivatorBehavior;
  CONFIG.RegionBehavior.typeIcons[ACTIVATOR_TYPE] = "fa-solid fa-shoe-prints";
  if (CONFIG.RegionBehavior.typeLabels) {
    CONFIG.RegionBehavior.typeLabels[BEHAVIOR_TYPE] = "TRAPS.Behavior.label";
    CONFIG.RegionBehavior.typeLabels[ACTIVATOR_TYPE] = "TRAPS.ActivatorBehavior.label";
  }
}

