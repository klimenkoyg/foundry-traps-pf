/* Карточка срабатывания в чате и всё, что с ней делают.
   Состояние розыгрыша (core/resolve.mjs) лежит во флаге сообщения: у каждой цели видно, почему она
   под ударом, чем проверялась и что получит. Игрок бросает свой спасбросок кнопкой в карточке,
   ведущий бросает за отсутствующих и наносит урон. Менять сообщение может только ведущий, поэтому
   броски игроков приходят ему по сокету модуля, а он дописывает их в карточку. */

import { allChecked, anyHit, counts, damageDue, instantParts, needsDamageRoll, newTarget, nominal, persistentParts, setDamage, settle, stage, takesPersistent, trapSnapshot } from "../core/resolve.mjs";
import { DEGREE_KEYS } from "../core/degrees.mjs";
import { MODULE_ID, SETTINGS, SOCKET, THEME_ATTR } from "./constants.mjs";
import {
  applyCondition,
  applyDamage,
  armorClass,
  conditionLabel,
  damageLabel,
  rollAttack,
  rollSave,
  rollSaveVisible,
  saveLabel,
  saveOf,
  skillLabel,
} from "./pf2e.mjs";
import { rollMessageId, waitForDice } from "./dice.mjs";
import { esc, t } from "./i18n.mjs";
import { ownerIds, postMessage } from "./scene.mjs";
import { setting } from "./settings.mjs";

const FLAG = "resolution";

/* ---------------------------------------------------------------- данные */

const read = (message) => {
  const state = message?.getFlag?.(MODULE_ID, FLAG) ?? message?.flags?.[MODULE_ID]?.[FLAG];
  return state ? foundry.utils.deepClone(state) : null;
};

function tokenDoc(state, id) {
  const scene = game.scenes?.get?.(state.sceneId) ?? (canvas?.scene?.id === state.sceneId ? canvas.scene : null);
  return scene?.tokens?.get?.(id) ?? null;
}

const actorOf = (state, target) => tokenDoc(state, target.id)?.actor ?? game.actors?.get?.(target.actorId) ?? null;

/** Может ли пользователь бросать за эту цель: ведущий или владелец персонажа. */
function canRoll(state, target, user = game.user) {
  if (user.isGM) return true;
  return Boolean(actorOf(state, target)?.testUserPermission?.(user, "OWNER"));
}

/* ---------------------------------------------------------------- карточка */

/** «базовый спасбросок Рефлекса, Сл 18» */
const saveName = (trap) => t(trap.onSave === "basic" ? "Chat.basicSave" : "Chat.plainSave", { save: saveOf(trap.saveAbility) });

function checkLine(trap) {
  if (trap.mode === "attack") return t("Chat.attack", { bonus: trap.attackBonus });
  if (trap.mode === "save") return t("Chat.save", { save: saveName(trap), dc: trap.saveDC });
  return t("Chat.noCheck");
}

/** Степень успеха словами: «крит. провал», «успех»… */
const degreeText = (degree) => (degree === null || degree === undefined ? "" : t(`Degree.${DEGREE_KEYS[degree]}`));

/** «Почему»: под ударом ли и чем закончилась проверка. */
function why(state, tg) {
  const { trap } = state;
  const cause = t(`Chat.cause.${tg.cause}`);
  if (!tg.res) return `${cause} · ${t("Chat.waitSave", { save: saveLabel(trap.saveAbility), dc: trap.saveDC })}`;
  const nat = tg.check?.natural === 20 ? ` (${t("Chat.nat20")})` : tg.check?.natural === 1 ? ` (${t("Chat.nat1")})` : "";
  if (trap.mode === "attack") {
    const outcome = t(tg.res.crit ? "Chat.crit" : tg.res.hit ? "Chat.hit" : "Chat.miss");
    return `${cause} · ${t("Chat.whyAttack", { total: tg.check?.total ?? 0, ac: tg.check?.ac ?? 10, outcome })}${nat}`;
  }
  if (trap.mode === "save") {
    const m = tg.res.multiplier;
    const effect = m >= 2 ? t("Chat.doubleDamage") : m >= 1 ? t("Chat.fullDamage") : m > 0 ? t("Chat.halfDamage") : t("Chat.noDamage");
    const outcome = `${degreeText(tg.res.degree)}${instantParts(state.parts).length ? `, ${effect}` : ""}`;
    return `${cause} · ${t("Chat.whySave", { save: saveOf(trap.saveAbility), total: tg.check?.total ?? 0, dc: trap.saveDC, outcome })}${nat}`;
  }
  return `${cause} · ${t("Chat.noCheckWhy")}`;
}

/** Что цель получит или получила. */
function effects(state, tg, st) {
  const bits = [];
  if (st === "roll") return `<span class="st-chip is-wait"><i class="fa-solid fa-dice-d20" inert></i> ${esc(t("Chat.waiting"))}</span>`;
  if (st === "clear") return `<span class="st-chip is-good">${esc(t("Chat.tookNone"))}</span>`;
  const done = st === "applied";
  if (st === "damage") {
    const m = tg.res.multiplier;
    const half = m > 0 && m < 1 ? ` · ${t("Chat.halfDamage")}` : m >= 2 ? ` · ${t("Chat.doubleDamage")}` : "";
    bits.push(`<span class="st-chip is-wait"><i class="fa-solid fa-hourglass-half" inert></i> ${esc(t("Chat.damageWait"))}${esc(half)}</span>`);
  } else if (instantParts(state.parts).length && tg.res.multiplier > 0) {
    const n = nominal(state, tg);
    const dealt = done && Number.isFinite(tg.dealt) ? tg.dealt : n;
    const types = [...new Set(instantParts(state.parts).map((p) => damageLabel(p.type)))].join(", ");
    const text = done ? t("Chat.takes", { n: dealt }) : t("Chat.willTake", { n });
    const less = done && Number.isFinite(tg.dealt) && tg.dealt < n ? ` <small>${esc(t("Chat.ofNominal", { n }))}</small>` : "";
    bits.push(`<span class="st-chip st-dmg${done ? " is-done" : ""}" data-tooltip="${esc(types)}"><b>${esc(text)}</b>${less}</span>`);
  }
  if (takesPersistent(state, tg)) {
    const list = persistentParts(state.parts)
      .map((p) => `${tg.res.multiplier >= 2 ? `2×(${p.formula})` : p.formula} ${damageLabel(p.type).toLowerCase()}`)
      .join(", ");
    bits.push(`<span class="st-chip st-cond${done ? " is-done" : ""}">${esc(t("Chat.persistent", { damage: list }))}</span>`);
  }
  if (state.trap.condition && tg.res.condition) {
    const text = t(done ? "Chat.condition" : "Chat.willCondition", { condition: conditionLabel(state.trap.condition, tg.res.conditionValue) });
    bits.push(`<span class="st-chip st-cond${done ? " is-done" : ""}">${esc(text)}</span>`);
  }
  if (done) bits.push(`<span class="st-chip is-applied"><i class="fa-solid fa-check" inert></i> ${esc(t("Chat.applied"))}</span>`);
  return bits.join("");
}

function targetHtml(state, tg, i) {
  const st = stage(state, tg);
  const img = tg.img ? `<img src="${esc(tg.img)}" alt="">` : "";
  const actions = [];
  if (st === "roll") {
    actions.push(`<button type="button" class="st-card-btn is-roll" data-ssl-traps-roll="${i}"><i class="fa-solid fa-dice-d20" inert></i> ${esc(t("Chat.rollSave", { save: saveLabel(state.trap.saveAbility) }))}</button>`);
  }
  if (st === "ready") {
    const label = (instantParts(state.parts).length && tg.res.multiplier > 0) || takesPersistent(state, tg) ? t("Chat.apply") : t("Chat.applyCondition");
    actions.push(`<button type="button" class="st-card-btn is-apply" data-ssl-traps-apply="${i}"><i class="fa-solid fa-heart-crack" inert></i> ${esc(label)}</button>`);
  }
  return `<li class="is-${st}">${img}<div class="st-target"><b>${esc(tg.name)}</b><small class="st-why">${esc(why(state, tg))}</small></div>
    <div class="st-chips">${effects(state, tg, st)}${actions.length ? `<span class="st-target-actions">${actions.join("")}</span>` : ""}</div></li>`;
}

export function cardHtml(state) {
  const { trap } = state;
  const sev = t(`Severity.${trap.severity}`);
  const instant = instantParts(state.parts);
  const lasting = persistentParts(state.parts).map((p) => `<span>${esc(t("Chat.persistentShort", { formula: p.formula, type: damageLabel(p.type).toLowerCase() }))}</span>`);
  const dmg = [
    ...(needsDamageRoll(state)
      ? [`${instant.map((p) => `<span>${esc(p.formula)} ${esc(damageLabel(p.type))}</span>`).join(" + ")} <small>· ${esc(t("Chat.damageLater"))}</small>`]
      : instant.map((p) => `<span><b>${p.value}</b> ${esc(damageLabel(p.type))} <small>${esc(p.formula)}</small></span>`)),
    ...lasting,
  ].join(" + ");
  const escape = trap.escapeDC && anyHit(state) ? t("Chat.escape", { skill: skillLabel(trap.escapeSkill), dc: trap.escapeDC }) : "";
  const list = state.targets.length
    ? `<ul class="st-targets">${state.targets.map((tg, i) => targetHtml(state, tg, i)).join("")}</ul>`
    : `<p class="st-empty">${t("Chat.noTargets")}</p>`;
  const c = counts(state);
  const footer = [];
  if (c.roll > 0) footer.push(`<button type="button" class="st-card-btn" data-ssl-traps-roll-all><i class="fa-solid fa-dice" inert></i> ${esc(t("Chat.rollAll"))}</button>`);
  if (needsDamageRoll(state)) footer.push(`<button type="button" class="st-card-btn is-damage" data-ssl-traps-damage data-tooltip="${esc(t("Chat.rollDamageHint"))}"><i class="fa-solid fa-burst" inert></i> ${esc(t("Chat.rollDamage"))}</button>`);
  if (c.ready > 1 || (c.ready === 1 && c.roll > 0)) footer.push(`<button type="button" class="st-card-btn is-apply" data-ssl-traps-apply-all><i class="fa-solid fa-heart-crack" inert></i> ${esc(t("Chat.applyAll"))}</button>`);
  return `<div class="ssl-traps-card" ${THEME_ATTR} data-severity="${trap.severity}">
  <header><i class="${esc(trap.icon)}" inert></i><div><h3>${esc(state.name)}</h3><small>${esc(t("Chat.levelLine", { level: trap.level ?? 1, severity: sev }))}</small></div></header>
  ${trap.flavor ? `<p class="st-flavor">${esc(trap.flavor)}</p>` : ""}
  <div class="st-meta"><span>${esc(checkLine(trap))}</span>${dmg ? `<span class="st-damage">${dmg}</span>` : ""}</div>
  ${escape ? `<p class="st-escape"><i class="fa-solid fa-person-arrow-up-from-line" inert></i> ${esc(escape)}</p>` : ""}
  ${list}
  ${footer.length ? `<div class="st-card-actions">${footer.join("")}</div>` : ""}
</div>`;
}

/* ---------------------------------------------------------------- ведущий: броски и урон */

/** Нанести урон и наложить состояние одной цели (мутирует state). */
async function applyTarget(state, i) {
  const tg = state.targets[i];
  if (stage(state, tg) !== "ready") return;
  const actor = actorOf(state, tg);
  if (!actor) return;
  if ((instantParts(state.parts).length && tg.res.multiplier > 0) || takesPersistent(state, tg)) {
    try {
      tg.dealt = await applyDamage(actor, tokenDoc(state, tg.id), state.parts, tg.res.multiplier, {
        withPersistent: takesPersistent(state, tg),
        degree: tg.res.degree,
      });
    } catch (err) {
      console.warn("ssl_traps_pf2e | урон не нанесён", err);
    }
  }
  if (state.trap.condition && tg.res.condition) {
    try {
      tg.conditioned = await applyCondition(actor, state.trap.condition, tg.res.conditionValue);
    } catch (err) {
      console.warn("ssl_traps_pf2e | состояние не наложено", err);
    }
  }
  tg.applied = true;
}

/** Бросить урон один раз на всех (мутирует state). → броски. */
async function rollDamage(state) {
  const rolls = [];
  const values = [];
  for (const p of instantParts(state.parts)) {
    try {
      const roll = await new Roll(p.formula).evaluate();
      rolls.push(roll);
      values.push(roll.total);
    } catch (err) {
      console.warn(`ssl_traps_pf2e | неверная формула урона «${p.formula}»`, err);
      values.push(0);
    }
  }
  setDamage(state, values);
  return rolls;
}

/** Урон, брошенный позже карточки, — отдельным сообщением: кубики видят все, кто видит карточку. */
async function postDamage(state, rolls) {
  const parts = instantParts(state.parts).map((p) => `<b>${p.value}</b> ${esc(damageLabel(p.type))} <small>${esc(p.formula)}</small>`).join(" + ");
  const message = await postMessage({
    alias: state.name,
    rolls,
    audience: state.audience ?? "auto",
    content: `<p ${THEME_ATTR} class="ssl-traps-note"><i class="fa-solid fa-burst" inert></i> ${t("Chat.damageRolled", { trap: esc(state.name) })} ${parts}</p>`,
  });
  // С Dice So Nice числа в карточке появляются, когда кубики урона докатились.
  await waitForDice(message);
}

/** Все проверки пришли — бросить урон сам. force — ведущий нажал «Бросить урон», не дожидаясь. */
async function settleDamage(state, force = false) {
  if (!(force ? needsDamageRoll(state) : damageDue(state))) return;
  await postDamage(state, await rollDamage(state));
}

/** Урон «сразу»: применить всем, у кого итог уже есть. */
async function autoApply(state) {
  if (state.damage !== "auto") return;
  for (let i = 0; i < state.targets.length; i++) await applyTarget(state, i);
}

/** Спасбросок за цель без окна и сообщения — итог сразу в карточке (модуль или «бросить за всех»). */
async function quietSave(state, i, by) {
  const tg = state.targets[i];
  const actor = actorOf(state, tg);
  const check = actor ? await rollSave(actor, state.trap.saveAbility, state.trap.saveDC, { disarming: tg.cause === "disarm" }) : null;
  state.targets[i] = settle(state.trap, tg, check ? { total: check.total, natural: check.natural, degree: check.degree } : { total: 0 }, by);
  return check?.roll ?? null;
}

/** Изменения одного сообщения — по очереди: два броска игроков одновременно не затирают друг друга. */
const queues = new Map();
function mutate(messageId, fn) {
  const prev = queues.get(messageId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const message = game.messages.get(messageId);
      const state = read(message);
      if (!state) return;
      if ((await fn(state)) === false) return;
      await message.update({ content: cardHtml(state), [`flags.${MODULE_ID}.${FLAG}`]: state });
    });
  queues.set(messageId, next);
  return next;
}

/**
 * Начать розыгрыш (активный ведущий): цели, атаки и спасброски модуля, карточка в чате.
 * tokens — кто под ударом; trigger — кто наступил; manual — ловушку запустил ведущий.
 */
export async function startCard({ scene, trap, name, tokens, trigger, manual, cause: forced = null, parts, rolls = [] }) {
  const saves = setting(SETTINGS.saveRolls) === "module" ? "module" : "players";
  const damage = setting(SETTINGS.damageMode) === "auto" ? "auto" : "button";
  const snapshot = trapSnapshot(trap);
  const state = {
    v: 1,
    sceneId: scene.id,
    name,
    trap: snapshot,
    parts: parts.map(({ type, formula, persistent }) => ({ value: null, type, formula, persistent: Boolean(persistent) })),
    rolled: false,
    targets: [],
    saves,
    damage,
  };
  const allRolls = [...rolls];
  for (const token of tokens) {
    // forced — особая причина для того, кто запустил ловушку (например, «ошибается, обезвреживая»).
    const own = trigger && token.id === trigger.id;
    const cause = own && forced ? forced : manual ? "manual" : own ? "trigger" : "area";
    let tg = newTarget({ id: token.id, actorId: token.actor?.id, name: token.name, img: token.texture?.src ?? "", cause });
    if (snapshot.mode === "attack") {
      const { roll, natural } = await rollAttack(trap.attackBonus);
      allRolls.push(roll);
      tg = settle(snapshot, tg, { total: roll.total, natural, ac: armorClass(token.actor) }, "module");
    } else if (snapshot.mode === "save") {
      // Персонажа без игрока (чудовище) всегда бросает модуль.
      const playerRolls = saves === "players" && ownerIds(token.actor).length > 0;
      if (!playerRolls) {
        state.targets.push(tg);
        const roll = await quietSave(state, state.targets.length - 1, "module");
        if (roll) allRolls.push(roll);
        continue;
      }
    } else {
      tg = settle(snapshot, tg);
    }
    state.targets.push(tg);
  }
  // Ждать нечего (атака, без проверки, спасброски модуля, никого нет) — урон сразу, кубики в карточке.
  if (needsDamageRoll(state) && (allChecked(state) || !state.targets.length)) allRolls.push(...(await rollDamage(state)));
  await autoApply(state);

  // Карточка видна всем или только ведущим; бросать свои спасброски — владельцам целей.
  let audience = "auto";
  if (setting(SETTINGS.chatMode) === "gm") {
    const owners = state.targets.filter((tg) => !tg.res).flatMap((tg) => ownerIds(actorOf(state, tg)));
    audience = owners.length ? [...new Set(owners)] : "gm";
  }
  state.audience = audience;
  return postMessage({ alias: name, rolls: allRolls, content: cardHtml(state), audience, flags: { [FLAG]: state } });
}

/** Игрок прислал свой спасбросок. Принимает только активный ведущий. */
async function receiveSave({ messageId, index, total, natural = null, degree = null, userId }) {
  if (!game.user.isActiveGM) return;
  const user = game.users.get(userId);
  await mutate(messageId, async (state) => {
    const tg = state.targets[index];
    if (!tg || stage(state, tg) !== "roll" || !user || !canRoll(state, tg, user)) return false;
    state.targets[index] = settle(state.trap, tg, { total: Number(total) || 0, natural, degree }, user.isGM ? "gm" : "player");
    await settleDamage(state);
    await autoApply(state);
  });
}

export function registerCardSocket() {
  game.socket.on(SOCKET, (payload) => {
    if (payload?.action === "trapSave") receiveSave(payload).catch((err) => console.warn("ssl_traps_pf2e | спасбросок игрока", err));
  });
}

/* ---------------------------------------------------------------- кнопки в карточке */

async function onRoll(message, index) {
  const state = read(message);
  const tg = state?.targets[index];
  if (!tg || stage(state, tg) !== "roll" || !canRoll(state, tg)) return;
  const actor = actorOf(state, tg);
  if (!actor) return;
  const check = await rollSaveVisible(actor, state.trap.saveAbility, state.trap.saveDC, { disarming: tg.cause === "disarm" });
  if (!check) return;
  await waitForDice(rollMessageId(check));
  const result = { total: check.total, natural: check.natural, degree: check.degree };
  if (game.user.isGM) {
    await mutate(message.id, async (s) => {
      if (stage(s, s.targets[index]) !== "roll") return false;
      s.targets[index] = settle(s.trap, s.targets[index], result, "gm");
      await settleDamage(s);
      await autoApply(s);
    });
  } else {
    game.socket.emit(SOCKET, { action: "trapSave", messageId: message.id, index, ...result, userId: game.user.id });
  }
}

function onRollAll(message) {
  return mutate(message.id, async (state) => {
    let any = false;
    for (let i = 0; i < state.targets.length; i++) {
      if (stage(state, state.targets[i]) !== "roll") continue;
      await quietSave(state, i, "gm");
      any = true;
    }
    if (!any) return false;
    await settleDamage(state);
    await autoApply(state);
  });
}

/** «Бросить урон» — не дожидаясь отстающих спасбросков. */
function onRollDamage(message) {
  return mutate(message.id, async (state) => {
    if (!needsDamageRoll(state)) return false;
    await settleDamage(state, true);
    await autoApply(state);
  });
}

function onApply(message, index) {
  return mutate(message.id, async (state) => {
    if (stage(state, state.targets[index]) !== "ready") return false;
    await applyTarget(state, index);
  });
}

function onApplyAll(message) {
  return mutate(message.id, async (state) => {
    let any = false;
    for (let i = 0; i < state.targets.length; i++) {
      if (stage(state, state.targets[i]) !== "ready") continue;
      await applyTarget(state, i);
      any = true;
    }
    return any ? undefined : false;
  });
}

function bind(el, fn) {
  if (el.dataset.bound) return;
  el.dataset.bound = "1";
  el.addEventListener("click", async (event) => {
    event.preventDefault();
    el.disabled = true;
    try {
      await fn();
    } catch (err) {
      console.error("ssl_traps_pf2e | кнопка карточки", err);
    } finally {
      el.disabled = false;
    }
  });
}

/** Хук renderChatMessageHTML: кнопки — только тем, кому они нужны. */
export function onRenderCard(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const state = read(message);
  if (!root?.querySelectorAll || !state) return;
  for (const el of root.querySelectorAll("[data-ssl-traps-roll]")) {
    const index = Number(el.dataset.sslTrapsRoll);
    if (!canRoll(state, state.targets[index] ?? {})) el.remove();
    else bind(el, () => onRoll(message, index));
  }
  for (const el of root.querySelectorAll("[data-ssl-traps-apply], [data-ssl-traps-apply-all], [data-ssl-traps-roll-all], [data-ssl-traps-damage]")) {
    if (!game.user.isGM) {
      el.remove();
      continue;
    }
    if (el.hasAttribute("data-ssl-traps-apply")) bind(el, () => onApply(message, Number(el.dataset.sslTrapsApply)));
    else if (el.hasAttribute("data-ssl-traps-apply-all")) bind(el, () => onApplyAll(message));
    else if (el.hasAttribute("data-ssl-traps-damage")) bind(el, () => onRollDamage(message));
    else bind(el, () => onRollAll(message));
  }
  // Пустые ряды кнопок (у игрока) не оставляем.
  for (const box of root.querySelectorAll(".st-target-actions, .st-card-actions")) if (!box.children.length) box.remove();
}

