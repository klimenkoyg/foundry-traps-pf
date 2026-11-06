/* Метка ловушки на карте: так игроки видят ловушку, которую заметили.
   Рисуется на обычном 2D-холсте без Foundry — тот же код на сцене (foundry/markers.mjs),
   на стенде и в тестах.

   У ловушки с устройством метка — её рисунок (core/tells.mjs) в рамке цвета опасности:
   - armed    — замечена и взведена: что заметил персонаж (щели крышки, раскрытый капкан, решётки газа);
   - disarmed — обезврежена: рисунок выцветает, пунктир, зелёная галочка;
   - spent    — одноразовая уже сработала: рисунок того, что осталось (открытая яма, завал).
   У ловушки без устройства — знак: штриховка зоны, скобы и ромб со значком.
   ghost — так ведущий видит ловушку, которую игроки ещё не заметили: бледный рисунок или ромб
   с перечёркнутым глазом (саму область ведущий и так видит заливкой Foundry). */

import { drawTell, hasTell } from "./tells.mjs";

const SEVERITY = { setback: [219, 183, 109], dangerous: [232, 145, 63], deadly: [236, 94, 75] };
const GOLD = [219, 183, 109];
const INK = [244, 236, 222];
const DARK = [21, 18, 14];
const MUTED = [168, 154, 132];
const GOOD = [163, 211, 142];
const GOOD_DARK = [30, 48, 28];

export const MARKER_STATES = ["armed", "disarmed", "spent"];

/** Значки состояния у ромба: класс Font Awesome и запасной знак, если шрифта нет. */
export const BADGES = {
  disarmed: { icon: "fa-solid fa-check", fallback: "✓" },
  spent: { icon: "fa-solid fa-burst", fallback: "✕" },
  ghost: { icon: "fa-solid fa-eye-slash", fallback: "?" },
};

/** Длительность появления метки и смены состояния, мс. */
export const REVEAL_MS = 1100;
export const POP_MS = 450;

/**
 * Что показать игрокам. Ведущий мог выключить ловушку молча — игроки об этом не знают,
 * поэтому «обезврежена» только после удачной проверки, а «сработала» — у одноразовой.
 */
export function markerState({ disabled = false, disarmed = false, triggers = 0, rearm = "auto" } = {}) {
  if (disarmed) return "disarmed";
  if (disabled && triggers > 0 && rearm === "once") return "spent";
  return "armed";
}

/** Сколько места нужно метке вокруг области (ромб и вспышка выходят за край), px. */
export const markerPad = (cell) => Math.ceil(cell * 0.9);

/** Значок состояния для этой метки или null. */
export function badgeFor({ state, ghost, device, ghostBadge = true }) {
  if (ghost) return ghostBadge ? BADGES.ghost : null;
  // У ловушки с рисунком сработавшее состояние видно по самому рисунку.
  if (state === "spent" && hasTell(device)) return null;
  return BADGES[state] ?? null;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const outCubic = (p) => 1 - (1 - p) ** 3;
const outQuart = (p) => 1 - (1 - p) ** 4;
const lerp = (a, b, p) => a + (b - a) * p;
const mix = (c1, c2, p) => [lerp(c1[0], c2[0], p), lerp(c1[1], c2[1], p), lerp(c1[2], c2[2], p)];
const rgba = ([r, g, b], a) => `rgba(${r | 0},${g | 0},${b | 0},${clamp01(a).toFixed(3)})`;

function diamond(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
}

/** Значок шрифтом Font Awesome (glyph = { text, family, weight }) или запасным символом. */
function icon(ctx, glyph, fallback, cx, cy, size, color) {
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (glyph?.text) {
    ctx.font = `${glyph.weight || 900} ${Math.round(size)}px ${glyph.family}`;
    ctx.fillText(glyph.text, cx, cy + size * 0.04);
  } else {
    ctx.font = `700 ${Math.round(size * 1.1)}px Georgia, serif`;
    ctx.fillText(fallback, cx, cy + size * 0.06);
  }
}

/** Зона: лёгкая заливка и штриховка под 45°. */
function hatch(ctx, x, y, w, h, cell, color, a) {
  if (a <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = rgba(color, 0.08 * a);
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = rgba(color, 0.24 * a);
  ctx.lineWidth = Math.max(1.5, cell * 0.022);
  const step = cell * 0.17;
  ctx.beginPath();
  for (let d = -h; d < w; d += step) {
    ctx.moveTo(x + d, y + h);
    ctx.lineTo(x + d + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Скобы по углам зоны; off — насколько они ещё снаружи (при появлении сходятся к краю). */
function brackets(ctx, x, y, w, h, cell, color, a, off) {
  if (a <= 0) return;
  const len = Math.min(cell * 0.3, Math.min(w, h) * 0.32);
  const lw = Math.max(2, cell * 0.045);
  const corners = [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ];
  ctx.save();
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  for (const [shadow, color2, width] of [
    [true, [0, 0, 0], lw + Math.max(2, cell * 0.025)],
    [false, color, lw],
  ]) {
    ctx.strokeStyle = rgba(color2, (shadow ? 0.55 : 1) * a);
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of corners) {
      const px = cx - sx * off + (sx * lw) / 2;
      const py = cy - sy * off + (sy * lw) / 2;
      ctx.moveTo(px + sx * len, py);
      ctx.lineTo(px, py);
      ctx.lineTo(px, py + sy * len);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Нарисовать метку. Область — прямоугольник (x, y, width, height) на холсте; вокруг нужно
 * поле markerPad(cell). reveal — доля анимации появления (1 — метка на месте), pop — смены состояния.
 * glyph / badgeGlyph — { text, family, weight } для значка ловушки и значка состояния.
 * device, options, fx, damageType, seed — для рисунка ловушки (core/tells.mjs).
 */
export function drawMarker(ctx, o) {
  const { x, y, width: w, height: h, cell } = o;
  const state = MARKER_STATES.includes(o.state) ? o.state : "armed";
  const ghost = Boolean(o.ghost);
  const reveal = ghost ? 1 : clamp01(o.reveal ?? 1);
  const pop = clamp01(o.pop ?? 1);
  const sev = SEVERITY[o.severity] ?? SEVERITY.dangerous;
  const live = state === "armed";
  const tone = live ? sev : state === "spent" ? mix(sev, MUTED, 0.55) : MUTED;

  const pFrame = outQuart(seg(reveal, 0, 0.5));
  const pArea = seg(reveal, 0.18, 0.7);

  if (hasTell(o.device)) return drawTellMarker(ctx, o, { x, y, w, h, cell, state, ghost, reveal, pop, sev, live, tone });

  if (!ghost) {
    if (live) hatch(ctx, x, y, w, h, cell, sev, pArea);
    frame(ctx, { x, y, w, h, cell, live, tone, pArea, pFrame });
  }

  // Ромб на углу зоны: на углу он почти не закрывает токен, который стоит в клетке.
  const r = cell * 0.32;
  const mx = x;
  const my = y;

  // Вспышка при появлении: два ромба расходятся от значка — не дальше поля вокруг области.
  if (!ghost && reveal < 1) {
    const reach = markerPad(cell) - Math.max(2, cell * 0.04);
    ctx.save();
    for (const [a, b] of [
      [0.04, 0.7],
      [0.22, 0.92],
    ]) {
      const q = seg(reveal, a, b);
      if (q <= 0 || q >= 1) continue;
      diamond(ctx, mx, my, lerp(r, reach, outCubic(q)));
      ctx.strokeStyle = rgba(sev, (1 - q) * 0.85);
      ctx.lineWidth = Math.max(1.5, cell * 0.03) * (1 - q * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  const scale = ghost ? 0.9 : 0.4 + 0.6 * outQuart(seg(reveal, 0, 0.42));
  ctx.save();
  ctx.globalAlpha = ghost ? 0.62 : seg(reveal, 0, 0.18);
  ctx.translate(mx, my);
  ctx.scale(scale, scale);

  // Тень, чтобы ромб читался на любом полу.
  const shade = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.7);
  shade.addColorStop(0, "rgba(0,0,0,0.55)");
  shade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
  ctx.fill();

  diamond(ctx, 0, 0, r);
  ctx.fillStyle = rgba(DARK, 0.96);
  ctx.fill();
  ctx.strokeStyle = rgba(GOLD, ghost ? 0.7 : 0.95);
  ctx.lineWidth = Math.max(1, cell * 0.014);
  ctx.stroke();
  diamond(ctx, 0, 0, r * 0.8);
  ctx.strokeStyle = rgba(ghost ? MUTED : tone, live && !ghost ? 1 : 0.75);
  ctx.lineWidth = Math.max(1.5, cell * 0.026);
  ctx.stroke();

  icon(ctx, o.glyph, "!", 0, 0, r * 0.8, rgba(INK, live && !ghost ? 1 : 0.6));

  drawBadge(ctx, { x: r * 0.72, y: r * 0.72, r: r * 0.44, cell, state, ghost, sev, glyph: o.badgeGlyph, pop, device: o.device, ghostBadge: o.ghostBadge });
  ctx.restore();
}

/** Кружок состояния: галочка, знак взрыва, перечёркнутый глаз. */
function drawBadge(ctx, { x, y, r, cell, state, ghost, sev, glyph, pop, device, ghostBadge }) {
  const badge = badgeFor({ state, ghost, device, ghostBadge });
  if (!badge) return;
  const rb = r * (0.4 + 0.6 * outQuart(pop));
  const fill = state === "disarmed" && !ghost ? GOOD_DARK : DARK;
  const ring = ghost ? MUTED : state === "disarmed" ? GOOD : sev;
  ctx.save();
  ctx.globalAlpha *= seg(pop, 0, 0.35);
  const shade = ctx.createRadialGradient(x, y, rb * 0.8, x, y, rb * 1.8);
  shade.addColorStop(0, "rgba(0,0,0,0.45)");
  shade.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(x, y, rb * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, rb, 0, Math.PI * 2);
  ctx.fillStyle = rgba(fill, 1);
  ctx.fill();
  ctx.strokeStyle = rgba(ring, 1);
  ctx.lineWidth = Math.max(1, cell * 0.014);
  ctx.stroke();
  icon(ctx, glyph, badge.fallback, x, y, rb * 1.05, rgba(ghost ? INK : ring, ghost ? 0.85 : 1));
  ctx.restore();
}

/** Контур зоны и скобы по углам. */
function frame(ctx, { x, y, w, h, cell, live, tone, pArea, pFrame }) {
  ctx.save();
  ctx.setLineDash(live ? [] : [cell * 0.09, cell * 0.07]);
  ctx.strokeStyle = rgba(tone, (live ? 0.55 : 0.5) * pArea);
  ctx.lineWidth = Math.max(1, cell * 0.016);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
  brackets(ctx, x, y, w, h, cell, tone, (live ? 1 : 0.75) * pFrame, (1 - pFrame) * cell * 0.24);
}

/**
 * Метка-рисунок: сама ловушка (core/tells.mjs) в рамке цвета опасности. Появляется кругом из
 * центра — будто персонаж разглядел её; по краю круга бежит контур.
 */
function drawTellMarker(ctx, o, { x, y, w, h, cell, state, ghost, reveal, pop, sev, live, tone }) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const pFrame = outQuart(seg(reveal, 0.1, 0.6));
  const pArt = outCubic(seg(reveal, 0.04, 0.78));
  // Проявляется эллипсом по форме области: и у квадрата, и у коридора доходит до углов.
  const rx = (w / 2) * 1.42;
  const ry = (h / 2) * 1.42;

  ctx.save();
  if (pArt < 1) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.001, rx * pArt), Math.max(0.001, ry * pArt), 0, 0, Math.PI * 2);
    ctx.clip();
  }
  ctx.globalAlpha = ghost ? 0.42 : state === "disarmed" ? 0.6 : 1;
  if (state === "disarmed" && "filter" in ctx) ctx.filter = "grayscale(0.85)";
  drawTell(ctx, {
    x,
    y,
    width: w,
    height: h,
    cell,
    device: o.device,
    options: o.options,
    fx: o.fx,
    damageType: o.damageType,
    spent: state === "spent",
    seed: o.seed ?? 1,
    ownTrigger: o.ownTrigger !== false,
  });
  ctx.restore();

  if (!ghost && pArt > 0 && pArt < 1) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * pArt, ry * pArt, 0, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(sev, (1 - pArt) * 0.9);
    ctx.lineWidth = Math.max(1.5, cell * 0.03);
    ctx.stroke();
    ctx.restore();
  }
  // outline — бирюзовый контур триггера у ведущего: сразу видно, что это триггер, а не ловушка.
  if (Array.isArray(o.outline)) {
    ctx.save();
    ctx.setLineDash([cell * 0.08, cell * 0.06]);
    ctx.strokeStyle = rgba(o.outline, 0.95);
    ctx.lineWidth = Math.max(1.5, cell * 0.03);
    ctx.strokeRect(x + cell * 0.04, y + cell * 0.04, w - cell * 0.08, h - cell * 0.08);
    ctx.restore();
  }
  // badge: false — метка триггера: рамка опасности и значок состояния — у метки самой ловушки.
  if (!ghost && o.badge !== false) frame(ctx, { x, y, w, h, cell, live, tone, pArea: pFrame, pFrame });
  if (o.badge !== false) drawBadge(ctx, { x, y, r: cell * 0.15, cell, state, ghost, sev, glyph: o.badgeGlyph, pop, device: o.device, ghostBadge: o.ghostBadge });
}
