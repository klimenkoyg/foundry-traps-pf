/* Метки ловушек на карте. Замеченную ловушку игроки видят рисунком (core/marker.mjs), а не цветной
   заливкой области: область остаётся видна только ведущему. Каждый клиент рисует метки сам по данным
   сцены, поэтому сокет не нужен — хватает обновления документов. Метка лежит на уровне карты
   (foundry/layers.mjs): её закрывает туман войны, токены рисуются поверх. */

import { POP_MS, REVEAL_MS, badgeFor, drawMarker, markerPad, markerState } from "../core/marker.mjs";
import { ACTIVATOR_TELL, seedOf } from "../core/tells.mjs";
import { MODULE_ID } from "./constants.mjs";
import { mapButtonsOn } from "./gm-hud.mjs";
import { regionElevation, sceneSprite } from "./layers.mjs";
import { activatorLook } from "../core/geometry.mjs";
import { activatorsOf, isRevealed, regionBounds, sceneTraps } from "./scene.mjs";

/** Бирюзовый контур триггера у ведущего (как цвет области-триггера). */
const TRIGGER_RGB = [47, 184, 200];

/** Сторона холста метки не больше этого числа пикселей: дальше растягиваем спрайт. */
const MAX_SIDE = 1024;

const markers = new Map(); // id области → { el, ctx, texture, sprite, key, view, spec, k, pad, anim }
let ticking = false;
let timer = null;

const reduceMotion = () => Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

/* ---------------------------------------------------------------- значки Font Awesome */

const glyphs = new Map();
const pendingFonts = new Set();

/** Символ и шрифт значка по классу Font Awesome: берём у настоящего <i> из CSS. */
function iconGlyph(iconClass) {
  if (!iconClass) return null;
  if (glyphs.has(iconClass)) return glyphs.get(iconClass);
  let glyph = null;
  try {
    const el = document.createElement("i");
    el.className = iconClass;
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden";
    document.body.append(el);
    const css = getComputedStyle(el, "::before");
    const text = String(css.content ?? "").replace(/^["']|["']$/g, "");
    if (text && text !== "none" && text !== "normal") glyph = { text, family: css.fontFamily, weight: css.fontWeight || "900" };
    el.remove();
  } catch {
    /* без DOM — нарисуем запасной знак */
  }
  // Пустой ответ не запоминаем: стили могли ещё не прийти — спросим при следующей перерисовке.
  if (glyph) glyphs.set(iconClass, glyph);
  return glyph;
}

const unquote = (s) => String(s).trim().replace(/^["']|["']$/g, "");

/**
 * Значок, если его шрифт уже загружен; иначе запросить шрифт и перерисовать, когда придёт.
 * fonts.check() не годится: он отвечает «да», если такого шрифта вообще нет, — и вместо значка
 * был бы пустой квадрат. Поэтому ищем сам шрифт среди загруженных.
 */
function readyGlyph(iconClass) {
  const glyph = iconGlyph(iconClass);
  const fonts = globalThis.document?.fonts;
  if (!glyph || !fonts) return glyph;
  const family = unquote(String(glyph.family).split(",")[0]);
  const weight = String(glyph.weight);
  const faces = [...fonts].filter((f) => unquote(f.family) === family);
  const exact = faces.filter((f) => String(f.weight) === weight);
  const pool = exact.length ? exact : faces;
  if (pool.some((f) => f.status === "loaded")) return glyph;
  const face = pool.find((f) => f.status !== "error") ?? null;
  if (pool.length && !face) return null; // шрифт не загрузился совсем — рисуем запасной знак
  const key = `${family}|${weight}`;
  if (!pendingFonts.has(key)) {
    pendingFonts.add(key);
    const retry = () => {
      pendingFonts.delete(key);
      scheduleMarkers({ animate: false });
    };
    // Шрифт объявлен — грузим; не объявлен (стили ещё не пришли) — ждём, пока что-нибудь догрузится.
    if (face) face.load().then(retry, () => {});
    else fonts.addEventListener?.("loadingdone", retry, { once: true });
  }
  return null;
}

/* ---------------------------------------------------------------- что видит этот пользователь */

/** Вид метки для текущего пользователя или null (игрок ещё не заметил ловушку). */
function viewOf(region, behavior) {
  const revealed = isRevealed(region);
  if (!revealed && !game.user.isGM) return null;
  const s = behavior.system;
  const state = markerState({ disabled: behavior.disabled, disarmed: s.disarmed, triggers: s.triggers, rearm: s.rearm });
  const options = s.options && typeof s.options === "object" ? s.options : {};
  return {
    severity: s.severity,
    icon: s.icon,
    state,
    ghost: !revealed,
    device: s.device || "",
    options,
    fx: s.fx,
    damageType: s.damageType,
    seed: seedOf(region.id),
    // Перечёркнутый глаз на бледной метке не нужен, если рядом кнопка-глаз ведущего.
    ghostBadge: !revealed && !mapButtonsOn(),
    // Отдельный триггер рисуется своей меткой — своя растяжка или плита в рисунке ловушки не нужна.
    ownTrigger: activatorsOf(region).length === 0,
  };
}

/* ---------------------------------------------------------------- рисование */

function render(entry, now = performance.now()) {
  const { ctx, el, k, pad, spec, anim } = entry;
  let reveal = 1;
  let pop = 1;
  if (anim) {
    const p = Math.min(1, (now - anim.start) / (anim.kind === "reveal" ? REVEAL_MS : POP_MS));
    if (anim.kind === "reveal") reveal = p;
    else pop = p;
    if (p >= 1) entry.anim = null;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, el.width, el.height);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  drawMarker(ctx, {
    x: pad,
    y: pad,
    width: spec.bounds.width,
    height: spec.bounds.height,
    cell: spec.cell,
    severity: spec.view.severity,
    state: spec.view.state,
    ghost: spec.view.ghost,
    glyph: spec.glyph,
    badgeGlyph: spec.badgeGlyph,
    device: spec.view.device,
    options: spec.view.options,
    fx: spec.view.fx,
    damageType: spec.view.damageType,
    seed: spec.view.seed,
    ownTrigger: spec.view.ownTrigger,
    ghostBadge: spec.view.ghostBadge,
    badge: spec.view.badge,
    outline: spec.view.outline,
    reveal,
    pop,
  });
  (entry.texture.source ?? entry.texture.baseTexture)?.update?.();
}

function destroy(entry) {
  if (!entry.sprite.destroyed) entry.sprite.destroy({ texture: true, baseTexture: true });
}

/** Кадр анимации метки не чаще этого: холст перерисовывается и заново уходит в видеокарту. */
const FRAME_MS = 32;

function step() {
  const now = performance.now();
  let busy = false;
  for (const entry of markers.values()) {
    if (!entry.anim) continue;
    if (now - (entry.drawnAt ?? 0) >= FRAME_MS) {
      render(entry, now);
      entry.drawnAt = now;
    }
    if (entry.anim) busy = true;
  }
  if (!busy) stopTicker();
}

function startTicker() {
  if (ticking || !canvas?.app?.ticker) return;
  ticking = true;
  canvas.app.ticker.add(step);
}

function stopTicker() {
  if (!ticking) return;
  ticking = false;
  canvas?.app?.ticker?.remove(step);
}

function paint(id, spec, prev, anim) {
  const pad = markerPad(spec.cell);
  const W = spec.bounds.width + pad * 2;
  const H = spec.bounds.height + pad * 2;
  const k = Math.min(1, MAX_SIDE / Math.max(W, H));
  const cw = Math.ceil(W * k);
  const ch = Math.ceil(H * k);

  let entry = prev;
  if (!entry || entry.el.width !== cw || entry.el.height !== ch) {
    if (entry) destroy(entry);
    const el = document.createElement("canvas");
    el.width = cw;
    el.height = ch;
    const texture = PIXI.Texture.from(el);
    const sprite = sceneSprite(texture, { elevation: spec.elevation });
    entry = { el, ctx: el.getContext("2d"), texture, sprite };
  } else if (entry.sprite.elevation !== undefined && entry.sprite.elevation !== spec.elevation) {
    entry.sprite.elevation = spec.elevation;
  }
  entry.sprite.position.set(spec.bounds.x - pad, spec.bounds.y - pad);
  entry.sprite.scale.set(1 / k);
  Object.assign(entry, { key: spec.key, view: spec.view, spec, k, pad, anim });
  markers.set(id, entry);
  render(entry);
  if (entry.anim) startTicker();
}

/**
 * Перерисовать метки текущей сцены. animate: false — без анимации (сцена только открылась).
 * Метка, которая у этого пользователя только что появилась, разворачивается со вспышкой;
 * смена состояния (обезвредили, сработала) — коротким «щелчком» значка.
 */
export function refreshMarkers({ animate = true } = {}) {
  const scene = canvas?.ready ? canvas.scene : null;
  if (!scene || !canvas.interface) return clearMarkers();
  const cell = scene.grid?.size || canvas.grid?.size || 100;
  const motion = animate && !reduceMotion();
  const alive = new Set();

  /** Метка одной области: ловушки или её триггера. */
  const place = (region, view) => {
    const bounds = regionBounds(region);
    if (!(bounds.width > 0 && bounds.height > 0)) return;
    const glyph = readyGlyph(view.icon);
    const badge = view.badge === false ? null : badgeFor({ ...view, ghost: view.ghost && view.ghostBadge });
    const badgeGlyph = badge ? readyGlyph(badge.icon) : null;
    const key = JSON.stringify([bounds.x, bounds.y, bounds.width, bounds.height, cell, regionElevation(region), view.severity, view.icon, view.state, view.ghost, view.device, view.options, view.fx, view.damageType, view.ghostBadge, view.badge, view.outline, view.ownTrigger, Boolean(glyph), Boolean(badgeGlyph)]);
    const prev = markers.get(region.id);
    if (prev?.key === key) return;

    const now = performance.now();
    let anim = null;
    if (motion && !view.ghost && (!prev || prev.view.ghost)) anim = { kind: "reveal", start: now };
    else if (motion && prev && prev.view.state !== view.state) anim = { kind: "pop", start: now };
    else if (prev?.anim) anim = prev.anim; // шрифт догрузился посреди анимации — досмотреть её
    paint(region.id, { bounds, cell, view, key, glyph, badgeGlyph, elevation: regionElevation(region) }, prev, anim);
  };

  for (const { region, behavior } of sceneTraps(scene)) {
    if (alive.has(region.id)) continue; // одна метка на область
    const view = viewOf(region, behavior);
    if (!view) continue;
    alive.add(region.id);
    place(region, view);
    // Триггеры видны вместе с ловушкой: плита (клетка) или растяжка (полоса), в том же состоянии,
    // без значка; у ведущего — с бирюзовым контуром.
    for (const part of activatorsOf(region)) {
      if (alive.has(part.id)) continue;
      alive.add(part.id);
      const kind = activatorLook(regionBounds(part));
      const outline = game.user.isGM ? TRIGGER_RGB : null;
      place(part, { ...view, device: ACTIVATOR_TELL, options: { kind }, icon: "", seed: seedOf(part.id), ghostBadge: false, badge: false, outline });
    }
  }

  for (const [id, entry] of markers) {
    if (alive.has(id)) continue;
    destroy(entry);
    markers.delete(id);
  }
}

/** Убрать все метки (сцену закрывают). */
export function clearMarkers() {
  stopTicker();
  for (const entry of markers.values()) destroy(entry);
  markers.clear();
}

/** Перерисовать чуть позже: одно обновление документа часто тянет за собой ещё несколько. */
export function scheduleMarkers({ animate = true } = {}) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      refreshMarkers({ animate });
    } catch (err) {
      console.warn(`${MODULE_ID} | метки ловушек`, err);
    }
  }, 0);
}
