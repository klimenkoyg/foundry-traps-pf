/* Кнопки ведущего прямо на карте. У правого верхнего угла каждой ловушки — два столбика:
   - «глаз» — показать ловушку игрокам или спрятать; «ключ» (у взведённой) — попробовать обезвредить
     выделенным токеном; «▶» (у взведённой) — сработать сейчас по всем в её области;
   - «✥» — перетащить ловушку (триггеры внутри неё едут вместе с ней); «↻» — повернуть на 90°
     (вместе с триггерами внутри); «⚙» — окно её настройки; «+» — добавить триггер (до трёх).
   У каждого триггера посередине — «✥» (перетащить) и «×» (убрать); от триггера к ловушке — пунктир.
   Двигать ловушки и триггеры можно, не уходя в «Регионы»: тянешь ручку — бежит рамка по клеткам,
   отпустил — область переехала. Кнопки живут в #hud Foundry — HTML-слое поверх холста, который
   двигается и масштабируется вместе с картой (там же кнопки токенов). Видны только ведущему. */

import { snapDelta } from "../core/geometry.mjs";
import { moveRegion, noticedBy, playerKnows, rotateTrap90, setRevealed, triggerNow } from "./actions.mjs";
import { nearTrap, playerDisarm, playersDisarm, requestDisarm } from "./disarm.mjs";
import { addTriggerNotified } from "./activators.mjs";
import { TrapEditor } from "./apps/trap-editor.mjs";
import { skillLabel } from "./pf2e.mjs";
import { SETTINGS, THEME } from "./constants.mjs";
import { esc, t } from "./i18n.mjs";
import { activatorsOf, isRevealed, regionBounds, sceneTraps, trapOfActivator } from "./scene.mjs";
import { setting } from "./settings.mjs";

const ROOT_ID = "ssl-traps-hud";
let timer = null;
/** Ловушки, которые уже были замечены, когда сцена открылась или при прошлой перерисовке. */
const seenNoticed = new Set();
let primed = false;
/** Идёт перетаскивание: перерисовку кнопок откладываем, чтобы не потерять ручку под пальцем. */
let dragging = null;

/** Включены ли кнопки на карте у этого пользователя. */
export const mapButtonsOn = () => Boolean(game.user?.isGM && setting(SETTINGS.mapButtons) !== false);

function container() {
  const hud = document.getElementById("hud");
  if (!hud) return null;
  let el = document.getElementById(ROOT_ID);
  if (el && el.parentElement !== hud) {
    el.remove();
    el = null;
  }
  if (!el) {
    el = document.createElement("div");
    el.id = ROOT_ID;
    el.className = "ssl-traps st-map-hud";
    el.dataset.stTheme = THEME;
    el.addEventListener("click", onClick);
    el.addEventListener("pointerdown", onPointerDown);
    // Не отдавать щелчок холсту под кнопкой (иначе снимется выделение токенов).
    el.addEventListener("mousedown", (event) => event.target.closest(".st-map-btn") && event.stopPropagation());
    hud.append(el);
  }
  return el;
}

/** Кнопки сохраняют размер на экране при любом масштабе карты. */
export function syncHudZoom() {
  const el = document.getElementById(ROOT_ID);
  const scale = Number(canvas?.stage?.scale?.x) || 1;
  el?.style.setProperty("--st-inv", String(1 / scale));
}

const btn = (act, cls, ids, tip, icon, extra = "") =>
  `<button type="button" class="st-map-btn ${cls}" data-act="${act}" ${ids} aria-label="${tip}" data-tooltip="${tip}" ${extra}><i class="fa-solid ${icon}" inert></i></button>`;

function trapButtons(region, behavior) {
  const b = regionBounds(region);
  const shown = isRevealed(region);
  const label = behavior.name || region.name;
  // Заметили, но игрокам ещё не показана: ведущий должен решить. Свежая отметка — с пульсом.
  const who = shown ? [] : noticedBy(region).map((n) => n.name).filter(Boolean);
  const fresh = who.length && primed && !seenNoticed.has(region.id);
  if (who.length) seenNoticed.add(region.id);
  else seenNoticed.delete(region.id);
  const eyeTip = esc(who.length ? t("Hud.noticed", { name: label, who: who.join(", ") }) : t(shown ? "Hud.hide" : "Hud.reveal", { name: label }));
  const state = `${shown ? "is-shown" : "is-hidden"}${who.length ? " is-noticed" : ""}${fresh ? " is-new" : ""}`;
  const ids = `data-region="${region.id}" data-behavior="${behavior.id}"`;
  const s = behavior.system;
  const armed = !behavior.disabled;
  const play = [
    btn("vis", state, ids, eyeTip, shown ? "fa-eye" : "fa-eye-slash", `aria-pressed="${shown}" data-name="${esc(label)}"`),
    armed ? btn("disarm", "is-disarm", ids, esc(t("Hud.disarm", { name: label, skill: skillLabel(s.disarmSkill), dc: s.disarmDC })), "fa-screwdriver-wrench") : "",
    armed ? btn("fire", `is-fire${s.manual ? " is-manual" : ""}`, ids, esc(t(s.manual ? "Hud.fireManual" : "Hud.fire", { name: label })), "fa-play") : "",
  ].join("");
  const setup = [
    btn("move", "is-move", ids, esc(t("Hud.move", { name: label })), "fa-up-down-left-right"),
    btn("rotate", "is-rotate", ids, esc(t("Hud.rotate", { name: label })), "fa-rotate-right"),
    btn("config", "is-config", ids, esc(t("Hud.config", { name: label })), "fa-sliders"),
    btn("addTrigger", "is-add", ids, esc(t("Hud.addTrigger", { name: label })), "fa-shoe-prints"),
  ].join("");
  return `<div class="st-map-trap" style="left:${b.x + b.width}px;top:${b.y}px"><div class="st-map-col">${play}</div><div class="st-map-col is-setup">${setup}</div></div>`;
}

/** Ручки триггера — посередине него: «взять плиту» — и кнопки ловушки их не закрывают. */
function triggerButtons(part, trapName) {
  const a = regionBounds(part);
  const ids = `data-region="${part.id}" data-trigger="1"`;
  return `<div class="st-map-trap is-trigger" style="left:${a.x + a.width / 2}px;top:${a.y + a.height / 2}px">
    ${btn("move", "is-move is-trigger", ids, esc(t("Hud.moveTrigger", { name: trapName })), "fa-up-down-left-right")}
    ${btn("removeTrigger", "is-remove is-trigger", ids, esc(t("Hud.removeTrigger", { name: trapName })), "fa-xmark")}
  </div>`;
}

/** Пунктир от середины каждого триггера к середине его ловушки (в пикселях сцены). */
function links(traps) {
  const lines = [];
  for (const { region } of traps) {
    const b = regionBounds(region);
    const to = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    for (const part of activatorsOf(region)) {
      const a = regionBounds(part);
      const from = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
      lines.push(`<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"/><circle cx="${from.x}" cy="${from.y}"/>`);
    }
  }
  return lines.length ? `<svg class="st-map-links" width="1" height="1" aria-hidden="true">${lines.join("")}</svg>` : "";
}

/**
 * Ключ игрока: у взведённой ловушки, про которую он знает (показали всем или ведущий сообщил ему),
 * если его выделенный токен стоит рядом. Ничего другого игроку на карте не показываем.
 */
function playerKeys(scene) {
  if (!playersDisarm()) return "";
  const mine = (canvas.tokens?.controlled ?? []).map((tk) => tk.document ?? tk).filter((d) => d?.actor?.isOwner);
  if (!mine.length) return "";
  const out = [];
  for (const { region, behavior } of sceneTraps(scene)) {
    if (behavior.disabled) continue;
    const token = mine.find((d) => playerKnows(region, d.actor.id) && nearTrap(d, region));
    if (!token) continue;
    const b = regionBounds(region);
    const tip = esc(t("Hud.playerDisarm", { name: behavior.name || region.name, skill: skillLabel(behavior.system.disarmSkill) }));
    const ids = `data-region="${region.id}" data-behavior="${behavior.id}" data-token="${token.id}"`;
    out.push(`<div class="st-map-trap" style="left:${b.x + b.width}px;top:${b.y}px">${btn("playerDisarm", "is-disarm", ids, tip, "fa-screwdriver-wrench")}</div>`);
  }
  return out.join("");
}

/** Перерисовать кнопки текущей сцены. */
export function refreshHud() {
  if (dragging) return void (dragging.stale = true);
  // У игрока — только его ключи у ловушек, которые он может обезвредить сам.
  if (!game.user?.isGM) {
    const el = canvas?.ready && canvas.scene ? container() : null;
    if (!el) return;
    el.innerHTML = playerKeys(canvas.scene);
    syncHudZoom();
    return;
  }
  // В «Регионах» у области свои ручки (поворот у правого верхнего угла, размер) — не закрываем их.
  const on = mapButtonsOn() && canvas?.ready && canvas.scene && !canvas.regions?.active;
  if (!on) {
    document.getElementById(ROOT_ID)?.replaceChildren();
    return;
  }
  const el = container();
  if (!el) return;
  const seen = new Set();
  const traps = [];
  for (const found of sceneTraps(canvas.scene)) {
    if (seen.has(found.region.id)) continue;
    seen.add(found.region.id);
    traps.push(found);
  }
  const parts = traps.flatMap(({ region, behavior }) => activatorsOf(region).map((part) => triggerButtons(part, behavior.name || region.name)));
  el.innerHTML = links(traps) + parts.join("") + traps.map(({ region, behavior }) => trapButtons(region, behavior)).join("");
  primed = true;
  syncHudZoom();
}

export function scheduleHud() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      refreshHud();
    } catch (err) {
      console.warn("ssl_traps_pf2e | кнопки на карте", err);
    }
  }, 0);
}

export function clearHud() {
  document.getElementById(ROOT_ID)?.replaceChildren();
  seenNoticed.clear();
  primed = false;
  dragging = null;
}

/* ---------------------------------------------------------------- перетаскивание */

/**
 * Взялись за «✥»: рамка области бежит за указателем по клеткам; отпустили — область переехала.
 * Ловушка едет вместе с триггерами, которые внутри неё.
 */
function onPointerDown(event) {
  const handle = event.target.closest(".st-map-btn");
  if (!handle) return;
  // Не отдавать нажатие холсту под кнопкой (иначе снимется выделение токенов).
  event.stopPropagation();
  if (handle.dataset.act !== "move" || event.button !== 0 || !game.user.isGM) return;
  const region = canvas.scene?.regions.get(handle.dataset.region);
  if (!region) return;
  event.preventDefault();
  const root = document.getElementById(ROOT_ID);
  const b = regionBounds(region);
  const ghost = document.createElement("div");
  ghost.className = `st-map-ghost${handle.dataset.trigger ? " is-trigger" : ""}`;
  Object.assign(ghost.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px` });
  root?.append(ghost);
  try {
    handle.setPointerCapture?.(event.pointerId);
  } catch {
    /* указатель уже отпущен — дотянем без захвата */
  }
  const grid = canvas.scene.grid.size || 100;
  dragging = { region, trap: !handle.dataset.trigger, startX: event.clientX, startY: event.clientY, dx: 0, dy: 0, ghost, b, stale: false };

  const move = (e) => {
    const scale = Number(canvas?.stage?.scale?.x) || 1;
    dragging.dx = snapDelta((e.clientX - dragging.startX) / scale, grid);
    dragging.dy = snapDelta((e.clientY - dragging.startY) / scale, grid);
    ghost.style.left = `${b.x + dragging.dx}px`;
    ghost.style.top = `${b.y + dragging.dy}px`;
  };
  const up = async () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", up);
    handle.removeEventListener("pointercancel", up);
    const { dx, dy, trap } = dragging;
    ghost.remove();
    dragging = null;
    try {
      await moveRegion(region, dx, dy, { withInside: trap });
    } catch (err) {
      console.warn("ssl_traps_pf2e | не удалось передвинуть область", err);
    }
    scheduleHud();
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", up);
  handle.addEventListener("pointercancel", up);
}

/* ---------------------------------------------------------------- щелчки */

async function onClick(event) {
  const button = event.target.closest(".st-map-btn");
  if (!button) return;
  if (!game.user.isGM) return onPlayerClick(event, button);
  event.preventDefault();
  event.stopPropagation();
  const act = button.dataset.act;
  if (act === "move") return; // ручка — только тянуть
  const region = canvas.scene?.regions.get(button.dataset.region);
  if (!region) return;
  if (act === "removeTrigger") return removeTrigger(button, region);
  const behavior = region.behaviors.get(button.dataset.behavior);
  if (!behavior) return;
  if (act === "disarm") return disarm(button, region, behavior);
  if (act === "fire") return fire(button, behavior);
  if (act === "config") return TrapEditor.openPlaced(region, behavior);
  if (act === "rotate") {
    return busy(button, async () => {
      if (!(await rotateTrap90(region))) ui.notifications.warn(t("Notify.rotateShape", { name: behavior.name || region.name }));
    });
  }
  if (act === "addTrigger") return busy(button, () => addTriggerNotified(region, behavior));
  return busy(button, () => setRevealed(region, behavior, !isRevealed(region)));
}

async function busy(button, fn) {
  button.disabled = true;
  try {
    return await fn();
  } finally {
    button.disabled = false;
  }
}

/** Убрать триггер; у ловушки — новое число триггеров. Не осталось — срабатывает её область. */
function removeTrigger(button, part) {
  const found = trapOfActivator(part);
  return busy(button, async () => {
    await part.delete();
    if (found) await found.behavior.update({ "system.activators": activatorsOf(found.region).length });
  });
}

/** Сработать сейчас — по всем в области ловушки. Разыгрывает активный ведущий. */
function fire(button, behavior) {
  if (!game.users.activeGM?.isSelf) return ui.notifications.warn(t("Notify.noGM"));
  return busy(button, () => triggerNow(behavior, []));
}

/** Попытка обезвредить выделенным токеном: бросок навыка (обычно Воровства) против Сл. */
function disarm(button, region, behavior) {
  const [token] = (canvas.tokens?.controlled ?? []).map((tk) => tk.document ?? tk).filter((d) => d?.actor);
  if (!token) return ui.notifications.warn(t("Notify.selectToken"));
  return busy(button, () => requestDisarm(region, behavior, token));
}

/** Игрок жмёт свой ключ: бросок с окном модификаторов pf2e, итог — ведущему. */
function onPlayerClick(event, button) {
  event.preventDefault();
  event.stopPropagation();
  if (button.dataset.act !== "playerDisarm") return;
  const region = canvas.scene?.regions.get(button.dataset.region);
  const behavior = region?.behaviors.get(button.dataset.behavior);
  const token = canvas.scene?.tokens.get(button.dataset.token);
  if (!region || !behavior || !token) return;
  return busy(button, () => playerDisarm(region, behavior, token));
}
