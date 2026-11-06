/* Кнопки ведущего в сообщениях о замеченной ловушке:
   - «показать игрокам / скрыть» — в шёпоте «… замечает ловушку» и в сообщении ведущему;
   - «сообщить только игроку» и «на карте» — в сообщении ведущему (режим «сообщить ведущему»).
   Игроки этих кнопок не видят — их убирает собственный клиент игрока при показе сообщения. */

import { noticedBy, setRevealed, tellPlayer, toldTo } from "./actions.mjs";
import { BEHAVIOR_TYPE, MODULE_ID, THEME_ATTR } from "./constants.mjs";
import { skillLabel } from "./pf2e.mjs";
import { esc, t } from "./i18n.mjs";
import { isRevealed, ownerIds, regionBounds } from "./scene.mjs";

const VIS = "data-ssl-traps-vis";
const TELL = "data-ssl-traps-tell";
const PAN = "data-ssl-traps-pan";
const STATE = "data-ssl-traps-state";
const ANY = `[${VIS}], [${TELL}], [${PAN}]`;

const where = (region) => `data-scene="${region.parent.id}" data-region="${region.id}"`;

/** Кнопка «показать игрокам / скрыть» (подпись ставится по текущему состоянию). */
export const visButton = (region) => `<button type="button" class="st-note-btn" ${VIS} ${where(region)}></button>`;

/**
 * Сообщение ведущему: кто и чем заметил ловушку, видят ли её игроки, и кнопки.
 * how — { kind: "approach" | "search", value, dc, degree }: тайная проверка, когда подошёл, или поиск.
 */
export function noticeCard({ region, behavior, token, how }) {
  const text = t("Chat.noticed", { name: `<b>${esc(token.name)}</b>`, trap: esc(behavior.name) });
  const skill = skillLabel("perception");
  const check = how ? t(how.kind === "search" ? "Chat.howSearch" : "Chat.howApproach", { skill, value: how.value, dc: how.dc }) : "";
  const pan = esc(t("Chat.pan"));
  return `<div ${THEME_ATTR} class="ssl-traps-note is-notice">
  <p><i class="fa-solid fa-eye" inert></i> ${text}</p>
  <p class="st-note-meta">${check ? `<span>${esc(check)}</span>` : ""}<span ${STATE} ${where(region)}></span></p>
  <div class="st-note-actions">
    ${visButton(region)}
    <button type="button" class="st-note-btn" ${TELL} ${where(region)} data-token="${token.id}"></button>
    <button type="button" class="st-note-btn is-icon" ${PAN} ${where(region)} aria-label="${pan}" data-tooltip="${pan}"><i class="fa-solid fa-location-crosshairs" inert></i></button>
  </div>
</div>`;
}

function regionOf(el) {
  const sceneId = el.dataset.scene;
  const scene = game.scenes?.get?.(sceneId) ?? (canvas?.scene?.id === sceneId ? canvas.scene : null);
  return scene?.regions.get(el.dataset.region) ?? null;
}

const behaviorOf = (region) => region?.behaviors.find((b) => b.type === BEHAVIOR_TYPE) ?? null;
const tokenOf = (el, region) => region?.parent?.tokens?.get?.(el.dataset.token) ?? null;

function sync(el) {
  const region = regionOf(el);
  if (!region) {
    el.remove(); // ловушку уже убрали со сцены
    return;
  }
  const shown = isRevealed(region);
  if (el.hasAttribute(STATE)) {
    el.textContent = t(shown ? "Chat.seenByAll" : "Chat.hiddenYet");
    el.classList.toggle("is-shown", shown);
  } else if (el.hasAttribute(VIS)) {
    el.innerHTML = `<i class="fa-solid ${shown ? "fa-eye-slash" : "fa-eye"}" inert></i> ${esc(t(shown ? "App.hide" : "App.reveal"))}`;
    el.classList.toggle("is-shown", shown);
    el.setAttribute("aria-pressed", String(shown));
  } else if (el.hasAttribute(TELL)) {
    const token = tokenOf(el, region);
    const actorId = token?.actor?.id ?? token?.id;
    const told = toldTo(region).includes(actorId);
    // Сообщать некому (персонаж без игрока) или незачем (ловушку и так видят все).
    el.hidden = !token || shown || !ownerIds(token.actor).length;
    el.disabled = told;
    el.innerHTML = `<i class="fa-solid ${told ? "fa-check" : "fa-comment-dots"}" inert></i> ${esc(t(told ? "Chat.told" : "Chat.tell"))}`;
  }
}

async function busy(el, fn) {
  el.disabled = true;
  try {
    await fn();
  } finally {
    el.disabled = false;
    syncChatButtons();
  }
}

function onClick(event) {
  const el = event.currentTarget;
  event.preventDefault();
  const region = regionOf(el);
  const behavior = behaviorOf(region);
  if (!region || !behavior) return;
  if (el.hasAttribute(VIS)) return busy(el, () => setRevealed(region, behavior, !isRevealed(region)));
  if (el.hasAttribute(PAN)) {
    if (canvas.scene?.id !== region.parent.id) return ui.notifications.warn(t("Notify.otherScene"));
    const b = regionBounds(region);
    return canvas.animatePan({ x: b.x + b.width / 2, y: b.y + b.height / 2, scale: Math.max(canvas.stage.scale.x, 1) });
  }
  if (el.hasAttribute(TELL)) {
    const token = tokenOf(el, region);
    if (!token) return;
    return busy(el, async () => {
      await tellPlayer(region, behavior, token);
      const id = token.actor?.id ?? token.id;
      await region.update({ [`flags.${MODULE_ID}.toldTo`]: [...new Set([...toldTo(region), id])] });
    });
  }
}

/** Хук renderChatMessageHTML: у ведущего — живые кнопки, у игроков — никаких. */
export function onRenderChatMessage(message, html) {
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root?.querySelectorAll) return;
  for (const el of root.querySelectorAll(`${ANY}, [${STATE}]`)) {
    if (!game.user.isGM) {
      el.remove();
      continue;
    }
    sync(el);
    if (el.matches(ANY) && !el.dataset.bound) {
      el.dataset.bound = "1";
      el.addEventListener("click", onClick);
    }
  }
}

/** Ловушку показали, спрятали или сообщили игроку в другом месте — поправить кнопки в чате. */
export function syncChatButtons() {
  if (!game.user?.isGM) return;
  for (const el of document.querySelectorAll(`${ANY}, [${STATE}]`)) sync(el);
}

/** Имена заметивших — для вкладки сцены и кнопки на карте. */
export const noticedNames = (region) => noticedBy(region).map((n) => n.name).filter(Boolean);
