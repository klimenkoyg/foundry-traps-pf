/* Рисунки ловушек для меток на карте. Два вида:
   - spotted — что заметил персонаж: щели крышки ямы и колья в проломе, раскрытый капкан,
     отверстия для дротиков, натянутая растяжка, решётки газа, тлеющая руна;
   - spent   — что осталось после срабатывания: открытая яма, захлопнутый капкан, дротики в полу,
     сеть на полу, завал, валун.
   Рисунок зависит от настроек устройства (глубина, колья, число дротиков, вид газа…) и от
   эффекта ловушки (огонь или кислота, молния или мороз). Неподвижный, в манере анимаций
   (fx/painters.mjs); без Foundry и DOM — рисует в любой 2D-контекст. */

import { between, blobPath, blobPoints, clamp01, drawRune, dust, glow, lerp, makeRune, mix, mulberry32, projectile, rgba, ring, stone } from "./fx/painters.mjs";

const TAU = Math.PI * 2;

/** Устойчивое число из строки (id области): одни и те же трещины при каждой перерисовке. */
export function seedOf(text = "") {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------------------------------------------------------------- кисти */

const STEEL = { shaft: "#5b5a5e", tip: "#d9d9de", fletch: "#a8443a" };
const WOOD = [128, 92, 58];
const IRON = [96, 92, 88];
const BRASS = [196, 150, 72];

function roundRect(ctx, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

function shadow(ctx, x, y, rx, ry, a = 0.35) {
  ctx.fillStyle = rgba([0, 0, 0], a);
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

/** Нажимная плита: каменная плитка со скосом; pressed — утоплена после срабатывания. */
function plate(ctx, x, y, s, pressed = false) {
  const r = s * 0.12;
  ctx.fillStyle = rgba([8, 6, 4], 0.75);
  roundRect(ctx, x - s * 0.56, y - s * 0.56, s * 1.12, s * 1.12, r * 1.3);
  ctx.fill();
  const base = pressed ? [70, 62, 52] : [122, 110, 92];
  const g = ctx.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
  g.addColorStop(0, rgba(mix(base, [255, 255, 255], pressed ? 0.04 : 0.22), 1));
  g.addColorStop(1, rgba(mix(base, [0, 0, 0], 0.38), 1));
  ctx.fillStyle = g;
  const inset = pressed ? s * 0.05 : 0;
  roundRect(ctx, x - s / 2 + inset, y - s / 2 + inset, s - inset * 2, s - inset * 2, r);
  ctx.fill();
  ctx.strokeStyle = rgba([28, 22, 16], 0.85);
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.stroke();
  if (!pressed) {
    ctx.strokeStyle = rgba([255, 240, 210], 0.2);
    ctx.lineWidth = Math.max(1, s * 0.025);
    roundRect(ctx, x - s * 0.4, y - s * 0.4, s * 0.8, s * 0.8, r * 0.7);
    ctx.stroke();
  }
}

/** Отверстие (для дротиков, сопло): тёмная дырка с ободком; tint — подтёк вокруг. */
function hole(ctx, x, y, r, tint = null) {
  if (tint) glow(ctx, x, y, r * 3.2, tint, 0.4, 0.2);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba([0, 0, 0], 0.98));
  g.addColorStop(1, rgba([34, 26, 18], 0.85));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba([170, 152, 124], 0.55);
  ctx.lineWidth = Math.max(1, r * 0.35);
  ctx.beginPath();
  ctx.arc(x, y, r * 1.12, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

/** Решётка вентиляции. */
function grate(ctx, x, y, r) {
  shadow(ctx, x + r * 0.12, y + r * 0.16, r * 1.15, r * 1.15, 0.4);
  ctx.fillStyle = rgba([10, 8, 7], 0.96);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = rgba([118, 112, 104], 1);
  ctx.lineWidth = Math.max(1, r * 0.17);
  ctx.beginPath();
  for (let i = -2; i <= 2; i++) {
    ctx.moveTo(x + i * r * 0.4, y - r);
    ctx.lineTo(x + i * r * 0.4, y + r);
  }
  ctx.stroke();
  ctx.restore();
  ring(ctx, x, y, r, Math.max(1.5, r * 0.22), [128, 122, 114], 1);
  ring(ctx, x, y, r * 0.98, Math.max(1, r * 0.08), [220, 210, 196], 0.3);
}

/** Пятно неровной формы: копоть, кислота, яд. */
function stain(ctx, rand, x, y, r, color, a) {
  const pts = blobPoints(rand, 14, 0.32);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.25);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(0.6, rgba(color, a * 0.65));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  blobPath(ctx, x, y, r, pts);
  ctx.fill();
}

/** Ветвистая трещина. */
function crack(ctx, rand, x, y, a, len, width, depth = 2) {
  const steps = 4;
  const pts = [];
  let px = x;
  let py = y;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(px, py);
  for (let i = 0; i < steps; i++) {
    a += between(rand, -0.55, 0.55);
    px += (Math.cos(a) * len) / steps;
    py += (Math.sin(a) * len) / steps;
    ctx.lineTo(px, py);
    pts.push([px, py, a]);
  }
  ctx.stroke();
  if (depth <= 0) return;
  for (const [bx, by, ba] of pts) {
    if (rand() < 0.38) crack(ctx, rand, bx, by, ba + (rand() < 0.5 ? -1 : 1) * between(rand, 0.5, 1.1), len * 0.5, width * 0.7, depth - 1);
  }
}

/** Кол или шип, вид сверху-сбоку: конус с бликом; poisoned — зелёный наконечник. */
function spike(ctx, x, y, hgt, wid, material, poisoned) {
  shadow(ctx, x + hgt * 0.18, y + wid * 0.12, hgt * 0.32, wid * 0.32, 0.35);
  const base = material === "wood" ? WOOD : [150, 150, 158];
  const g = ctx.createLinearGradient(x - wid / 2, 0, x + wid / 2, 0);
  g.addColorStop(0, rgba(mix(base, [0, 0, 0], 0.45), 1));
  g.addColorStop(0.45, rgba(mix(base, [255, 255, 255], 0.45), 1));
  g.addColorStop(1, rgba(mix(base, [0, 0, 0], 0.55), 1));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - wid / 2, y);
  ctx.lineTo(x, y - hgt);
  ctx.lineTo(x + wid / 2, y);
  ctx.closePath();
  ctx.fill();
  if (poisoned) {
    ctx.fillStyle = rgba([120, 205, 80], 0.95);
    ctx.beginPath();
    ctx.moveTo(x - wid * 0.18, y - hgt * 0.64);
    ctx.lineTo(x, y - hgt);
    ctx.lineTo(x + wid * 0.18, y - hgt * 0.64);
    ctx.closePath();
    ctx.fill();
  }
}

/** Дощатая крышка, присыпанная землёй: тёмные щели между досками, гвозди, комья земли. */
function planks(ctx, rand, x, y, w, h, cell) {
  ctx.fillStyle = rgba([10, 7, 5], 0.95);
  ctx.fillRect(x, y, w, h);
  const n = Math.max(3, Math.round(h / (cell * 0.21)));
  const ph = h / n;
  const gap = Math.max(1, cell * 0.014);
  for (let i = 0; i < n; i++) {
    const py = y + i * ph;
    const tone = between(rand, -12, 12);
    const base = [104 + tone, 78 + tone, 52 + tone * 0.8];
    const g = ctx.createLinearGradient(0, py, 0, py + ph);
    g.addColorStop(0, rgba(mix(base, [255, 255, 255], 0.14), 1));
    g.addColorStop(1, rgba(mix(base, [0, 0, 0], 0.32), 1));
    ctx.fillStyle = g;
    ctx.fillRect(x, py + gap / 2, w, ph - gap);
    ctx.strokeStyle = rgba([46, 30, 18], 0.4);
    ctx.lineWidth = Math.max(1, cell * 0.006);
    ctx.beginPath();
    for (let k = 0; k < 2; k++) {
      const gy = py + ph * (0.35 + k * 0.3);
      ctx.moveTo(x + w * 0.04, gy);
      ctx.bezierCurveTo(x + w * 0.35, gy + between(rand, -1, 1) * ph * 0.12, x + w * 0.65, gy + between(rand, -1, 1) * ph * 0.12, x + w * 0.96, gy);
    }
    ctx.stroke();
    ctx.fillStyle = rgba([30, 26, 22], 0.9);
    for (const nx of [x + cell * 0.06, x + w - cell * 0.06]) {
      ctx.beginPath();
      ctx.arc(nx, py + ph / 2, Math.max(1, cell * 0.012), 0, TAU);
      ctx.fill();
    }
  }
  // Земля, которой присыпали крышку.
  const clods = Math.round(((w * h) / (cell * cell)) * 6);
  for (let i = 0; i < clods; i++) stain(ctx, rand, x + between(rand, 0.05, 0.95) * w, y + between(rand, 0.05, 0.95) * h, cell * between(rand, 0.08, 0.18), [86, 74, 56], 0.6);
}

/** Капкан: close 0 — раскрыт, 1 — захлопнут. */
function jaws(ctx, cx, cy, r, close, cell, venom) {
  const ry = lerp(r * 0.94, r * 0.16, close);
  shadow(ctx, cx + cell * 0.03, cy + cell * 0.04, r * 1.1, ry * 1.1 + cell * 0.04, 0.32);
  // Пружины-рычаги по бокам.
  ctx.strokeStyle = rgba(IRON, 1);
  ctx.lineWidth = Math.max(2, cell * 0.045);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx - r * 1.32, cy);
  ctx.lineTo(cx + r * 1.32, cy);
  ctx.stroke();
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * r * 1.32, cy, cell * 0.05, cell * 0.08, 0, 0, TAU);
    ctx.stroke();
  }
  const iron = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  iron.addColorStop(0, rgba([156, 150, 142], 1));
  iron.addColorStop(0.5, rgba([92, 88, 82], 1));
  iron.addColorStop(1, rgba([46, 43, 40], 1));
  ctx.strokeStyle = iron;
  ctx.lineWidth = Math.max(3, cell * 0.065);
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, ry, 0, 0, TAU);
  ctx.stroke();
  const teeth = 14;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * ry;
    const inward = Math.atan2(cy - y, cx - x);
    const len = cell * 0.1 * (1 - close * 0.5);
    const half = cell * 0.032;
    ctx.fillStyle = rgba([208, 204, 198], 1);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(inward + Math.PI / 2) * half, y + Math.sin(inward + Math.PI / 2) * half);
    ctx.lineTo(x + Math.cos(inward) * len, y + Math.sin(inward) * len);
    ctx.lineTo(x + Math.cos(inward - Math.PI / 2) * half, y + Math.sin(inward - Math.PI / 2) * half);
    ctx.fill();
    if (venom && i % 2 === 0) {
      ctx.fillStyle = rgba([120, 210, 80], 0.95);
      ctx.beginPath();
      ctx.arc(x + Math.cos(inward) * len, y + Math.sin(inward) * len, cell * 0.016, 0, TAU);
      ctx.fill();
    }
  }
  if (close < 0.5) {
    const g = ctx.createRadialGradient(cx - r * 0.08, cy - r * 0.08, 0, cx, cy, r * 0.32);
    g.addColorStop(0, rgba([150, 132, 98], 1));
    g.addColorStop(1, rgba([84, 72, 52], 1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.3, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = rgba([30, 24, 16], 0.8);
    ctx.lineWidth = Math.max(1, cell * 0.012);
    ctx.stroke();
  }
}

/** Цепь от (x1, y1) до (x2, y2) к колышку. */
function chain(ctx, x1, y1, x2, y2, cell) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(2, Math.round(len / (cell * 0.085)));
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = rgba([84, 80, 74], 1);
  ctx.lineWidth = Math.max(1.2, cell * 0.02);
  for (let i = 0; i < n; i++) {
    const p = (i + 0.5) / n;
    ctx.beginPath();
    ctx.ellipse(lerp(x1, x2, p), lerp(y1, y2, p), cell * 0.05, cell * 0.028, a + (i % 2 ? 0 : 0.0), 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = rgba([60, 50, 40], 1);
  ctx.beginPath();
  ctx.arc(x2, y2, cell * 0.05, 0, TAU);
  ctx.fill();
  ring(ctx, x2, y2, cell * 0.05, Math.max(1, cell * 0.014), [160, 150, 136], 0.8);
}

/** Воткнутый в пол снаряд: короткое древко под углом с тенью. */
function stuck(ctx, x, y, angle, len, width, colors) {
  ctx.strokeStyle = rgba([0, 0, 0], 0.35);
  ctx.lineWidth = width * 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle) * len * 0.9 + len * 0.15, y + Math.sin(angle) * len * 0.9 + len * 0.12);
  ctx.stroke();
  projectile(ctx, x, y, angle + Math.PI, len, width, colors, 0);
}

/* ---------------------------------------------------------------- ловушки */

const TOXIN = { choking: [150, 196, 70], sleep: [168, 156, 240], smoke: [160, 156, 150], madness: [206, 96, 196] };
const RUNE = { lightning: [140, 190, 255], frost: [190, 230, 255], thunder: [205, 222, 255], necrotic: [168, 80, 230], fire: [255, 150, 70], acid: [170, 220, 80] };
// Типы урона PF2e — тем же цветом, что и похожие руны.
Object.assign(RUNE, { electricity: RUNE.lightning, cold: RUNE.frost, sonic: RUNE.thunder, void: RUNE.necrotic });

const TELLS = {
  pit(ctx, e) {
    const { x, y, w, h, cell, rand, opt, spent } = e;
    const deep = clamp01((Number(opt.depth) || 20) / 100);
    const spikes = opt.spikes ?? "none";
    const poisoned = spikes === "poisoned";
    const m = Math.min(w, h) * 0.07;
    const ix = x + m;
    const iy = y + m;
    const iw = w - m * 2;
    const ih = h - m * 2;
    if (spent) {
      // Открытая яма: стены сходятся ко дну — чем глубже, тем меньше и темнее дно.
      // Откос одинаковый со всех сторон — и у квадратной ямы, и у вытянутой.
      const ins = Math.min(iw, ih) * lerp(0.14, 0.3, deep);
      const bx = ix + ins;
      const by = iy + ins;
      const bw = iw - ins * 2;
      const bh = ih - ins * 2;
      const rough = opt.walls === "rough" ? 0.05 : opt.walls === "slick" ? 0.012 : 0.028;
      const rim = (px, py) => [px + between(rand, -rough, rough) * cell, py + between(rand, -rough, rough) * cell];
      const outer = [rim(ix, iy), rim(ix + iw, iy), rim(ix + iw, iy + ih), rim(ix, iy + ih)];
      const inner = [[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh]];
      ctx.fillStyle = rgba([4, 3, 2], 1);
      ctx.beginPath();
      outer.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fill();
      const walls = [
        [0, 1, [86, 72, 56]],
        [1, 2, [58, 48, 38]],
        [3, 0, [66, 55, 43]],
        [2, 3, [34, 28, 22]],
      ];
      for (const [a, b, col] of walls) {
        const g = ctx.createLinearGradient(...outer[a], ...inner[a]);
        g.addColorStop(0, rgba(col, 1));
        g.addColorStop(1, rgba(mix(col, [0, 0, 0], lerp(0.6, 0.92, deep)), 1));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(...outer[a]);
        ctx.lineTo(...outer[b]);
        ctx.lineTo(...inner[b]);
        ctx.lineTo(...inner[a]);
        ctx.closePath();
        ctx.fill();
      }
      if (opt.walls === "slick") {
        ctx.strokeStyle = rgba([210, 230, 240], 0.22);
        ctx.lineWidth = Math.max(1, cell * 0.015);
        for (let i = 0; i < 5; i++) {
          const p = between(rand, 0.15, 0.85);
          ctx.beginPath();
          ctx.moveTo(lerp(outer[0][0], outer[1][0], p), lerp(outer[0][1], outer[1][1], p));
          ctx.lineTo(lerp(inner[0][0], inner[1][0], p), lerp(inner[0][1], inner[1][1], p));
          ctx.stroke();
        }
      }
      ctx.fillStyle = rgba(mix([30, 24, 18], [0, 0, 0], deep), 1);
      ctx.fillRect(bx, by, bw, bh);
      if (spikes !== "none") {
        const n = Math.max(3, Math.round((bw / cell) * 5));
        const rows = Math.max(2, Math.round((bh / cell) * 4));
        const sh = cell * lerp(0.2, 0.11, deep);
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < n; i++) {
            spike(ctx, bx + ((i + 0.5 + between(rand, -0.2, 0.2)) / n) * bw, by + ((j + 0.75) / rows) * bh, sh, sh * 0.4, "wood", poisoned);
          }
        }
      }
      // Обломки досок крышки висят с края и лежат на кольях.
      const board = (x1, y1, x2, y2, thick) => {
        const a = Math.atan2(y2 - y1, x2 - x1);
        const nx = -Math.sin(a) * thick * 0.5;
        const ny = Math.cos(a) * thick * 0.5;
        ctx.fillStyle = rgba([0, 0, 0], 0.35);
        ctx.beginPath();
        ctx.moveTo(x1 + nx + cell * 0.03, y1 + ny + cell * 0.04);
        ctx.lineTo(x2 + nx + cell * 0.03, y2 + ny + cell * 0.04);
        ctx.lineTo(x2 - nx + cell * 0.03, y2 - ny + cell * 0.04);
        ctx.lineTo(x1 - nx + cell * 0.03, y1 - ny + cell * 0.04);
        ctx.fill();
        const g = ctx.createLinearGradient(x1 + nx, y1 + ny, x1 - nx, y1 - ny);
        g.addColorStop(0, rgba([142, 108, 70], 1));
        g.addColorStop(1, rgba([72, 52, 32], 1));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x1 + nx, y1 + ny);
        ctx.lineTo(x2 + nx * 0.7, y2 + ny * 0.7);
        ctx.lineTo(x2 - nx * 1.1, y2 - ny * 1.1);
        ctx.lineTo(x1 - nx, y1 - ny);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = rgba([30, 20, 12], 0.8);
        ctx.lineWidth = Math.max(1, cell * 0.01);
        ctx.stroke();
      };
      const thick = cell * 0.16;
      board(ix + iw * 0.1, iy + thick * 0.4, lerp(ix + iw * 0.1, bx + bw * 0.4, 0.75), lerp(iy, by + bh * 0.5, 0.75), thick);
      board(ix + iw * 0.92, iy + ih * 0.18, lerp(ix + iw, bx + bw * 0.6, 0.7), lerp(iy + ih * 0.2, by + bh * 0.3, 0.7), thick * 0.9);
      ctx.strokeStyle = rgba([150, 132, 106], 0.7);
      ctx.lineWidth = Math.max(1.5, cell * 0.022);
      ctx.beginPath();
      outer.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.stroke();
      return;
    }
    // Закрытая крышка из досок, присыпанная землёй; в углу пролом.
    planks(ctx, rand, ix, iy, iw, ih, cell);
    ctx.strokeStyle = rgba([12, 9, 6], 0.85);
    ctx.lineWidth = Math.max(1.5, cell * 0.03);
    ctx.strokeRect(ix, iy, iw, ih);
    // Пролом: зубчатый треугольник в нижнем правом углу, в нём темнота и колья.
    const s = Math.min(iw, ih) * 0.55;
    const cx0 = ix + iw;
    const cy0 = iy + ih;
    const edge = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const jit = i === 0 || i === steps ? 0 : between(rand, -0.09, 0.09) * s;
      edge.push([cx0 - s * (1 - p) + jit, cy0 - s * p + jit]);
    }
    ctx.beginPath();
    ctx.moveTo(cx0, cy0);
    for (const [px, py] of edge) ctx.lineTo(px, py);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx0 - s * 0.5, cy0 - s * 0.5, cx0, cy0);
    g.addColorStop(0, rgba([30, 24, 18], 1));
    g.addColorStop(1, rgba([2, 1, 1], 1));
    ctx.fillStyle = g;
    ctx.fill();
    if (spikes !== "none") {
      ctx.save();
      ctx.clip();
      const sh = cell * 0.17;
      for (const [px, py] of [[0.34, 0.9], [0.62, 0.74], [0.86, 0.94], [0.84, 0.5], [0.58, 1.02]]) spike(ctx, cx0 - s * (1 - px), cy0 - s * (1 - py) + sh * 0.6, sh, sh * 0.42, "wood", poisoned);
      ctx.restore();
    }
    // Расщеплённый край досок.
    ctx.strokeStyle = rgba([184, 146, 98], 0.95);
    ctx.lineWidth = Math.max(1.5, cell * 0.02);
    ctx.lineCap = "round";
    ctx.beginPath();
    edge.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
    ctx.stroke();
    ctx.lineWidth = Math.max(1, cell * 0.012);
    ctx.beginPath();
    for (let i = 1; i < edge.length - 1; i++) {
      const [px, py] = edge[i];
      const a = Math.PI * 1.25 + between(rand, -0.5, 0.5);
      const len = cell * between(rand, 0.05, 0.1);
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a + Math.PI) * len, py + Math.sin(a + Math.PI) * len);
    }
    ctx.stroke();
  },

  bearTrap(ctx, e) {
    const { cx, cy, w, h, x, cell, opt, spent } = e;
    const size = { small: 0.24, bear: 0.31, giant: 0.4 }[opt.jaws] ?? 0.31;
    const r = Math.min(Math.min(w, h) * 0.3, cell * size);
    chain(ctx, cx + r * 1.4, cy + cell * 0.02, Math.min(x + w - cell * 0.12, cx + r * 1.4 + cell * 0.5), cy + cell * 0.22, cell);
    jaws(ctx, cx - cell * 0.05, cy, r, spent ? 1 : 0, cell, Boolean(opt.venom));
  },

  darts(ctx, e) {
    const { x, y, w, h, cx, cy, cell, rand, opt, spent } = e;
    const n = Math.max(1, Math.min(4, Math.round(Number(opt.count) || 1)));
    const tint = { venom: [120, 205, 80], sleep: [170, 150, 235] }[opt.poison] ?? null;
    const m = cell * 0.1;
    for (let i = 0; i < n; i++) {
      const px = x + (w * (i + 1)) / (n + 1);
      hole(ctx, px, y + m, cell * 0.045, tint);
      hole(ctx, px, y + h - m, cell * 0.045, tint);
    }
    // Своя плита в центре — если у ловушки нет отдельного триггера (он рисуется своей меткой).
    if (e.ownTrigger !== false) plate(ctx, cx, cy, Math.min(w, h) * 0.34, spent);
    if (!spent) return;
    for (let i = 0; i < n * 2; i++) {
      const a = between(rand, 0, TAU);
      const d = between(rand, 0.26, 0.4) * Math.min(w, h);
      const colors = tint ? { ...STEEL, fletch: rgba(tint, 1) } : STEEL;
      stuck(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, between(rand, 0, TAU), cell * 0.22, Math.max(1.5, cell * 0.024), colors);
    }
  },

  arrows(ctx, e) {
    const { x, y, w, h, cy, cell, rand, opt, spent } = e;
    const n = Math.max(1, Math.min(4, Math.round(Number(opt.count) || 1)));
    const tips = opt.tips ?? "plain";
    // Бойницы по верхнему краю.
    for (let i = 0; i <= n; i++) {
      const px = x + (w * (i + 0.5)) / (n + 1);
      ctx.fillStyle = rgba([0, 0, 0], 0.35);
      roundRect(ctx, px - cell * 0.17, y + cell * 0.04, cell * 0.34, cell * 0.13, cell * 0.04);
      ctx.fill();
      ctx.fillStyle = rgba([4, 3, 2], 0.95);
      roundRect(ctx, px - cell * 0.15, y + cell * 0.05, cell * 0.3, cell * 0.08, cell * 0.03);
      ctx.fill();
      ctx.strokeStyle = rgba([170, 152, 124], 0.45);
      ctx.lineWidth = Math.max(1, cell * 0.012);
      ctx.stroke();
      if (tips === "fire") glow(ctx, px, y + cell * 0.075, cell * 0.12, [255, 140, 50], 0.35);
      if (tips === "poison") glow(ctx, px, y + cell * 0.075, cell * 0.12, [120, 205, 80], 0.3);
    }
    // Следы прошлых залпов: зарубки в полу.
    ctx.strokeStyle = rgba([12, 9, 6], 0.6);
    ctx.lineWidth = Math.max(1, cell * 0.014);
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < n + 2; i++) {
      const px = x + between(rand, 0.15, 0.85) * w;
      const py = y + between(rand, 0.35, 0.9) * h;
      const a = Math.PI / 2 + between(rand, -0.4, 0.4);
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a) * cell * 0.06, py + Math.sin(a) * cell * 0.06);
    }
    ctx.stroke();
    // Растяжка поперёк зоны — если у ловушки нет отдельного триггера (он рисуется своей меткой).
    const wire = e.ownTrigger !== false;
    const wy = cy + h * 0.12;
    const x1 = x + cell * 0.12;
    const x2 = x + w - cell * 0.12;
    for (const px of wire ? [x1, x2] : []) {
      ctx.fillStyle = rgba([70, 56, 40], 1);
      ctx.beginPath();
      ctx.arc(px, wy, cell * 0.04, 0, TAU);
      ctx.fill();
      ring(ctx, px, wy, cell * 0.04, Math.max(1, cell * 0.012), [180, 160, 130], 0.8);
    }
    ctx.lineCap = "round";
    if (!spent) {
      if (!wire) return;
      ctx.strokeStyle = rgba([0, 0, 0], 0.45);
      ctx.lineWidth = Math.max(1.5, cell * 0.018);
      ctx.beginPath();
      ctx.moveTo(x1 + cell * 0.02, wy + cell * 0.03);
      ctx.lineTo(x2 + cell * 0.02, wy + cell * 0.03);
      ctx.stroke();
      ctx.strokeStyle = rgba([236, 228, 210], 1);
      ctx.lineWidth = Math.max(1.2, cell * 0.016);
      ctx.beginPath();
      ctx.moveTo(x1, wy);
      ctx.lineTo(x2, wy);
      ctx.stroke();
      return;
    }
    // Порванная растяжка и стрелы в полу.
    if (wire) {
      ctx.strokeStyle = rgba([230, 222, 204], 0.9);
      ctx.lineWidth = Math.max(1, cell * 0.012);
      ctx.beginPath();
      ctx.moveTo(x1, wy);
      ctx.quadraticCurveTo(lerp(x1, x2, 0.2), wy + cell * 0.12, lerp(x1, x2, 0.38), wy + cell * 0.16);
      ctx.moveTo(x2, wy);
      ctx.quadraticCurveTo(lerp(x1, x2, 0.8), wy + cell * 0.1, lerp(x1, x2, 0.62), wy + cell * 0.14);
      ctx.stroke();
    }
    for (let i = 0; i < n * 2 + 1; i++) {
      const px = x + between(rand, 0.15, 0.85) * w;
      const py = y + between(rand, 0.35, 0.88) * h;
      if (tips === "fire") glow(ctx, px, py, cell * 0.14, [30, 18, 10], 0.6, 0.1);
      if (tips === "poison") stain(ctx, rand, px, py, cell * 0.08, [110, 190, 70], 0.4);
      stuck(ctx, px, py, -Math.PI / 2 + between(rand, -0.35, 0.35), cell * 0.46, Math.max(2, cell * 0.032), STEEL);
    }
  },

  blade(ctx, e) {
    const { x, y, w, h, cx, cy, cell, opt, spent } = e;
    const marks = { low: 0.5, waist: 0.32, high: 0.18 }[opt.height] ?? 0.32;
    // Следы взмахов: дуги вокруг оси над зоной.
    const px = cx;
    const py = y - h * 0.55;
    const R = cy - py;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - cell * 0.06, y, w + cell * 0.12, h);
    ctx.clip();
    ctx.lineCap = "round";
    for (let i = -1; i <= 1; i++) {
      ctx.strokeStyle = rgba([226, 214, 194], marks * (1 - Math.abs(i) * 0.35));
      ctx.lineWidth = Math.max(1, cell * 0.012);
      ctx.beginPath();
      ctx.arc(px, py, R + i * cell * 0.07, Math.PI / 2 - 0.55 * (w / h), Math.PI / 2 + 0.55 * (w / h));
      ctx.stroke();
    }
    ctx.restore();
    // Прорезь в полу.
    const sx = x + cell * 0.12;
    const sw = w - cell * 0.24;
    ctx.fillStyle = rgba([3, 2, 2], 0.96);
    roundRect(ctx, sx, cy - cell * 0.035, sw, cell * 0.07, cell * 0.03);
    ctx.fill();
    ctx.strokeStyle = rgba([170, 152, 124], 0.5);
    ctx.lineWidth = Math.max(1, cell * 0.012);
    ctx.stroke();
    if (!spent) {
      ctx.strokeStyle = rgba([220, 224, 232], 0.75);
      ctx.lineWidth = Math.max(1, cell * 0.01);
      ctx.beginPath();
      ctx.moveTo(sx + sw * 0.18, cy);
      ctx.lineTo(sx + sw * 0.62, cy);
      ctx.stroke();
      return;
    }
    // Лезвие вышло и замерло поперёк прорези.
    const bw = sw * 0.92;
    const bx = cx - bw / 2;
    shadow(ctx, cx + cell * 0.05, cy + cell * 0.08, bw * 0.5, cell * 0.12, 0.35);
    const g = ctx.createLinearGradient(0, cy - cell * 0.2, 0, cy + cell * 0.1);
    g.addColorStop(0, rgba([235, 238, 244], 1));
    g.addColorStop(1, rgba([92, 96, 104], 1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(bx, cy);
    ctx.quadraticCurveTo(cx, cy - cell * 0.32, bx + bw, cy);
    ctx.quadraticCurveTo(cx, cy - cell * 0.12, bx, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba([30, 30, 36], 0.8);
    ctx.lineWidth = Math.max(1, cell * 0.012);
    ctx.stroke();
  },

  net(ctx, e) {
    const { x, y, w, h, cx, cy, cell, rand, opt, spent } = e;
    const type = opt.net ?? "rope";
    const color = type === "chain" ? [150, 150, 158] : [168, 134, 88];
    const step = cell * (type === "chain" ? 0.24 : 0.2);
    const m = cell * 0.08;
    const width = Math.max(1, cell * (type === "chain" ? 0.024 : 0.017));
    // Ячейки ромбом: решётка повёрнута на 45°. Висящая сеть чуть провисает к центру,
    // упавшая — сбита в кучу и смята.
    const n = Math.ceil(Math.hypot(w, h) / step) + 1;
    const k = Math.SQRT1_2 * step;
    const nodes = new Map();
    for (let i = -n; i <= n + 1; i++) {
      for (let j = -n; j <= n + 1; j++) {
        let px = cx + (i - j) * k;
        let py = cy + (i + j) * k;
        if (spent) {
          px = lerp(px, cx, 0.3) + between(rand, -0.05, 0.05) * cell;
          py = lerp(py, cy, 0.3) + between(rand, -0.05, 0.05) * cell;
        } else {
          const u = (px - cx) / w;
          const v = (py - cy) / h;
          px -= u * cell * 0.1 * Math.max(0, 1 - v * v * 4);
          py -= v * cell * 0.1 * Math.max(0, 1 - u * u * 4);
        }
        nodes.set(`${i},${j}`, [px, py]);
      }
    }
    const blob = blobPoints(rand, 14, 0.18);
    const clip = () => {
      if (spent) blobPath(ctx, cx, cy, (w / 2 - m) * 0.92, blob, (h / 2 - m) * 0.92);
      else {
        ctx.beginPath();
        ctx.rect(x + m, y + m, w - m * 2, h - m * 2);
      }
    };
    const mesh = (dx, dy, col, alpha) => {
      ctx.strokeStyle = rgba(col, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let i = -n; i <= n; i++) {
        for (let j = -n; j <= n; j++) {
          const [px, py] = nodes.get(`${i},${j}`);
          for (const [qx, qy] of [nodes.get(`${i + 1},${j}`), nodes.get(`${i},${j + 1}`)]) {
            ctx.moveTo(px + dx, py + dy);
            ctx.lineTo(qx + dx, qy + dy);
          }
        }
      }
      ctx.stroke();
    };
    ctx.save();
    clip();
    ctx.clip();
    if (!spent) mesh(cell * 0.08, cell * 0.11, [0, 0, 0], 0.35); // тень сети на полу
    mesh(0, 0, color, spent ? 0.95 : 0.75);
    ctx.fillStyle = rgba(mix(color, [0, 0, 0], 0.3), 1);
    for (const [px, py] of nodes.values()) {
      ctx.beginPath();
      ctx.arc(px, py, width * 0.95, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    // Кромка сети.
    ctx.strokeStyle = rgba(mix(color, [0, 0, 0], 0.15), 1);
    ctx.lineWidth = width * 1.6;
    clip();
    ctx.stroke();
    // Грузила, крюки или звенья по углам.
    const corners = spent
      ? [0, 3, 7, 10].map((i) => [cx + Math.cos(blob[i].a) * (w / 2 - m) * 0.92 * blob[i].k, cy + Math.sin(blob[i].a) * (h / 2 - m) * 0.92 * blob[i].k])
      : [[x + m, y + m], [x + w - m, y + m], [x + m, y + h - m], [x + w - m, y + h - m]];
    for (const [px, py] of corners) {
      if (type === "weighted" || type === "chain") {
        shadow(ctx, px + cell * 0.02, py + cell * 0.03, cell * 0.065, cell * 0.055, 0.35);
        const g = ctx.createRadialGradient(px - cell * 0.02, py - cell * 0.02, 0, px, py, cell * 0.06);
        g.addColorStop(0, rgba([150, 150, 156], 1));
        g.addColorStop(1, rgba([52, 52, 58], 1));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, cell * 0.06, 0, TAU);
        ctx.fill();
      } else if (type === "hooked") {
        ctx.strokeStyle = rgba([210, 212, 220], 1);
        ctx.lineWidth = Math.max(1.2, cell * 0.018);
        ctx.beginPath();
        ctx.arc(px, py + cell * 0.035, cell * 0.045, -Math.PI * 0.2, Math.PI * 1.1);
        ctx.stroke();
      }
    }
    if (type === "hooked") {
      // Крючья вплетены и в саму сеть.
      const list = [...nodes.values()].filter(([px, py]) => px > x + m * 2 && px < x + w - m * 2 && py > y + m * 2 && py < y + h - m * 2);
      ctx.strokeStyle = rgba([210, 212, 220], 0.95);
      ctx.lineWidth = Math.max(1, cell * 0.013);
      for (let i = 0; i < Math.min(list.length, Math.round((w * h) / (cell * cell)) * 4); i++) {
        const [px, py] = list[Math.floor(rand() * list.length)];
        ctx.beginPath();
        ctx.arc(px, py + cell * 0.025, cell * 0.028, 0, Math.PI);
        ctx.stroke();
      }
    }
  },

  roof(ctx, e) {
    const { x, y, w, h, cx, cy, cell, rand, opt, spent } = e;
    const debris = opt.debris ?? "stones";
    const sizeOf = { gravel: [0.04, 0.07], stones: [0.08, 0.15], slabs: [0.18, 0.3] }[debris] ?? [0.08, 0.15];
    if (spent) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - cell * 0.1, y - cell * 0.1, w + cell * 0.2, h + cell * 0.2);
      ctx.clip();
      dust(ctx, cx, cy, Math.max(w, h) * 0.62, 0.55, [120, 106, 88]);
      const count = Math.round(((w * h) / (cell * cell)) * (debris === "gravel" ? 26 : debris === "slabs" ? 4 : 11));
      const rocks = Array.from({ length: count }, () => ({
        x: x + between(rand, 0.04, 0.96) * w,
        y: y + between(rand, 0.04, 0.96) * h,
        r: between(rand, ...sizeOf) * cell,
        pts: blobPoints(rand, debris === "slabs" ? 5 : 7, debris === "slabs" ? 0.18 : 0.3),
        rot: between(rand, 0, TAU),
        col: ((v) => [v + 6, v - 4, v - 18])(between(rand, 84, 124)),
      })).sort((a, b) => a.y - b.y);
      for (const r of rocks) {
        shadow(ctx, r.x + r.r * 0.25, r.y + r.r * 0.3, r.r * 1.05, r.r * 0.8, 0.3);
        stone(ctx, r.x, r.y, r.r, r.pts, r.rot, r.col, 1);
      }
      ctx.restore();
      return;
    }
    // Трещины в потолке видны сверху как тёмная сеть, под ними — осыпавшаяся крошка и пыль.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = rgba([10, 8, 6], 0.78);
    const origins = Math.max(2, Math.round((w * h) / (cell * cell)));
    for (let i = 0; i < origins + 1; i++) {
      const ox = x + between(rand, 0.25, 0.75) * w;
      const oy = y + between(rand, 0.25, 0.75) * h;
      for (let k = 0; k < 3; k++) crack(ctx, rand, ox, oy, between(rand, 0, TAU), Math.min(w, h) * between(rand, 0.25, 0.45), Math.max(1, cell * 0.016), 2);
    }
    ctx.restore();
    for (let i = 0; i < origins; i++) dust(ctx, x + between(rand, 0.2, 0.8) * w, y + between(rand, 0.2, 0.8) * h, cell * 0.28, 0.3);
    const pebbles = Math.round((origins + 2) * (debris === "gravel" ? 4 : 2.5));
    for (let i = 0; i < pebbles; i++) {
      const r = between(rand, sizeOf[0] * 0.45, sizeOf[0] * 0.8) * cell;
      stone(ctx, x + between(rand, 0.15, 0.85) * w, y + between(rand, 0.15, 0.85) * h, Math.max(1.5, r), blobPoints(rand, 6, 0.3), between(rand, 0, TAU), [118, 104, 84], 1);
    }
  },

  boulder(ctx, e) {
    const { x, y, w, h, cy, cell, rand, opt, spent } = e;
    const R = Math.min(Math.min(w, h) * 0.42, cell * ({ medium: 0.3, large: 0.4, huge: 0.5 }[opt.boulder] ?? 0.4));
    // Две колеи через всю зону.
    for (const off of [-R * 0.55, R * 0.55]) {
      ctx.strokeStyle = rgba([10, 8, 6], 0.55);
      ctx.lineWidth = Math.max(2, cell * 0.05);
      ctx.beginPath();
      ctx.moveTo(x, cy + off);
      ctx.lineTo(x + w, cy + off);
      ctx.stroke();
      ctx.strokeStyle = rgba([196, 178, 150], 0.25);
      ctx.lineWidth = Math.max(1, cell * 0.014);
      ctx.beginPath();
      ctx.moveTo(x, cy + off + cell * 0.03);
      ctx.lineTo(x + w, cy + off + cell * 0.03);
      ctx.stroke();
    }
    const ball = (bx, by, r) => {
      shadow(ctx, bx + r * 0.25, by + r * 0.3, r * 1.05, r * 0.85, 0.4);
      const g = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.35, r * 0.1, bx, by, r);
      g.addColorStop(0, rgba([168, 154, 132], 1));
      g.addColorStop(0.6, rgba([108, 96, 80], 1));
      g.addColorStop(1, rgba([50, 43, 36], 1));
      ctx.fillStyle = g;
      blobPath(ctx, bx, by, r, blobPoints(rand, 16, 0.05));
      ctx.fill();
      ctx.strokeStyle = rgba([30, 24, 18], 0.55);
      crack(ctx, rand, bx - r * 0.2, by - r * 0.3, 0.6, r * 0.7, Math.max(1, cell * 0.012), 1);
    };
    if (spent) {
      for (let i = 0; i < 6; i++) stone(ctx, x + between(rand, 0.1, 0.6) * w, cy + between(rand, -0.8, 0.8) * R, cell * between(rand, 0.03, 0.06), blobPoints(rand, 6, 0.3), rand() * TAU, [112, 100, 82], 1);
      ball(x + w - R * 1.05, cy, R);
      return;
    }
    // Ниша у левого края: в темноте виден бок валуна.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const g = ctx.createRadialGradient(x, cy, 0, x, cy, R * 1.5);
    g.addColorStop(0, rgba([2, 1, 1], 1));
    g.addColorStop(1, rgba([30, 24, 18], 0.9));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, cy, R * 1.35, -Math.PI / 2, Math.PI / 2);
    ctx.fill();
    ball(x - R * 0.35, cy, R);
    ctx.restore();
  },

  jet(ctx, e) {
    const { x, y, w, h, cx, cy, cell, rand, opt, fx, spent } = e;
    const acid = fx === "acid" || e.damageType === "acid";
    const power = { weak: 0.65, normal: 1, strong: 1.4 }[opt.pressure] ?? 1;
    const nozzles = [];
    if (opt.nozzles === "ring") {
      const m = cell * 0.16;
      for (const [px, py] of [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]]) nozzles.push([x + m + (w - m * 2) * px, y + m + (h - m * 2) * py]);
    } else nozzles.push([cx, cy]);
    const r0 = cell * 0.3 * power * (opt.nozzles === "ring" ? 0.6 : 1);
    if (spent) stain(ctx, rand, cx, cy, Math.min(w, h) * 0.5, acid ? [120, 160, 40] : [16, 11, 8], acid ? 0.45 : 0.7);
    for (const [px, py] of nozzles) {
      if (acid) {
        stain(ctx, rand, px, py, r0, [130, 175, 45], 0.5);
        for (let i = 0; i < 4; i++) {
          const a = rand() * TAU;
          const d = between(rand, 0.4, 1) * r0;
          ctx.fillStyle = rgba([190, 230, 90], 0.75);
          ctx.beginPath();
          ctx.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, cell * between(rand, 0.012, 0.025), 0, TAU);
          ctx.fill();
        }
      } else {
        stain(ctx, rand, px, py, r0, [18, 12, 8], 0.75);
        glow(ctx, px, py, r0 * 0.5, [255, 130, 40], spent ? 0.15 : 0.3, 0.2);
      }
      // Сопло: металлический ободок с дыркой.
      ring(ctx, px, py, cell * 0.065, Math.max(2, cell * 0.03), [128, 122, 114], 1);
      hole(ctx, px, py, cell * 0.045);
    }
  },

  gas(ctx, e) {
    const { x, y, w, h, cell, rand, opt, spent } = e;
    const color = TOXIN[opt.toxin] ?? TOXIN.choking;
    const dense = { thin: 0.55, dense: 0.8, thick: 1 }[opt.density] ?? 0.8;
    const cells = Math.max(1, Math.round(Math.min(w, h) / cell));
    // Решётки сеткой: примерно через полторы клетки и по ширине, и по длине (коридор — в ряд).
    const nx = Math.max(1, Math.round(w / cell / 1.5));
    const ny = Math.max(1, Math.round(h / cell / 1.5));
    const vents = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) vents.push([(i + 0.5 + (ny > 1 && nx > 1 ? (j % 2 ? 0.06 : -0.06) : 0)) / nx, (j + 0.5) / ny]);
    if (spent) {
      for (let i = 0; i < 4 + cells * 2; i++) glow(ctx, x + between(rand, 0.15, 0.85) * w, y + between(rand, 0.15, 0.85) * h, cell * between(rand, 0.5, 0.9), color, 0.16 * dense, 0.1);
    }
    for (const [vx, vy] of vents) {
      const px = x + vx * w;
      const py = y + vy * h;
      glow(ctx, px, py, cell * 0.6, color, (spent ? 0.18 : 0.3) * dense, 0.1);
      // Струйки дыма.
      ctx.lineCap = "round";
      for (let k = 0; k < 3; k++) {
        const a = -Math.PI / 2 + (k - 1) * 0.7 + between(rand, -0.2, 0.2);
        const len = cell * between(rand, 0.28, 0.42);
        ctx.strokeStyle = rgba(color, 0.5 * dense * (spent ? 0.5 : 1));
        ctx.lineWidth = Math.max(1.5, cell * 0.03);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.bezierCurveTo(
          px + Math.cos(a - 0.6) * len * 0.4,
          py + Math.sin(a - 0.6) * len * 0.4,
          px + Math.cos(a + 0.6) * len * 0.7,
          py + Math.sin(a + 0.6) * len * 0.7,
          px + Math.cos(a) * len,
          py + Math.sin(a) * len,
        );
        ctx.stroke();
      }
      grate(ctx, px, py, cell * 0.11);
    }
  },

  rune(ctx, e) {
    // Вытянутая область — ряд знаков, по одному на каждый квадрат вдоль длинной стороны.
    const side = Math.min(e.w, e.h);
    const n = Math.max(1, Math.round(Math.max(e.w, e.h) / side));
    if (n > 1 && !e.tile) {
      for (let i = 0; i < n; i++) {
        const along = e.w >= e.h;
        const tx = along ? e.x + (e.w / n) * i : e.x;
        const ty = along ? e.y : e.y + (e.h / n) * i;
        const tw = along ? e.w / n : e.w;
        const th = along ? e.h : e.h / n;
        TELLS.rune(ctx, { ...e, x: tx, y: ty, w: tw, h: th, cx: tx + tw / 2, cy: ty + th / 2, tile: true });
      }
      return;
    }
    const { cx, cy, w, h, cell, rand, opt, fx, spent } = e;
    const color = RUNE[fx] ?? RUNE[e.damageType] ?? [219, 183, 109];
    const power = { weak: 0.45, normal: 0.65, strong: 0.85, devastating: 1 }[opt.power] ?? 0.65;
    const R = Math.min(w, h) / 2;
    const env = { cx, cy, R: R * 0.86, cell };
    const glyphs = makeRune(rand);
    // Громовая плита — каменная плита, на которой вырезан знак.
    if (fx === "thunder") plate(ctx, cx, cy, Math.min(w, h) * 0.9, spent);
    // Резьба по камню под свечением — читается и на светлом полу.
    const r = Math.max(env.R * 0.92, cell * 0.45);
    ring(ctx, cx, cy, r, Math.max(2, cell * 0.04), [12, 9, 7], 0.55);
    ring(ctx, cx, cy, r * 0.74, Math.max(1.5, cell * 0.03), [12, 9, 7], 0.45);
    if (spent) {
      stain(ctx, rand, cx, cy, r * 0.95, [14, 10, 8], 0.55);
      drawRune(ctx, env, glyphs, 0.12, mix(color, [80, 70, 60], 0.5), 0.28);
      ctx.strokeStyle = rgba([10, 8, 6], 0.8);
      for (let i = 0; i < 3; i++) crack(ctx, rand, cx, cy, rand() * TAU, r * 0.9, Math.max(1, cell * 0.014), 1);
      return;
    }
    drawRune(ctx, env, glyphs, 0.12, color, power);
  },

  alarm(ctx, e) {
    const { y, cx, cy, w, h, cell, opt, spent } = e;
    const s = Math.min(w, h) * 0.36;
    // Проволока от плиты к сигналу у края зоны.
    const sy = y + cell * 0.2;
    ctx.strokeStyle = rgba([196, 186, 166], 0.85);
    ctx.lineWidth = Math.max(1, cell * 0.012);
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.3, cy - s * 0.5);
    ctx.quadraticCurveTo(cx + s * 0.7, lerp(cy, sy, 0.5), cx + s * 0.55, sy + cell * 0.05);
    ctx.stroke();
    plate(ctx, cx, cy, s, spent);
    const bx = cx + s * 0.55;
    const signal = opt.signal ?? "bell";
    if (signal === "chime") {
      glow(ctx, bx, sy, cell * 0.16, [219, 183, 109], 0.5, 0.2);
      ring(ctx, bx, sy, cell * 0.07, Math.max(1, cell * 0.016), [255, 226, 150], 0.95);
      ring(ctx, bx, sy, cell * 0.035, Math.max(1, cell * 0.012), [255, 226, 150], 0.8);
      return;
    }
    shadow(ctx, bx + cell * 0.03, sy + cell * 0.06, cell * 0.12, cell * 0.07, 0.4);
    const g = ctx.createRadialGradient(bx - cell * 0.04, sy - cell * 0.04, 0, bx, sy, cell * 0.13);
    g.addColorStop(0, rgba(mix(BRASS, [255, 255, 255], 0.4), 1));
    g.addColorStop(1, rgba(mix(BRASS, [0, 0, 0], 0.45), 1));
    ctx.fillStyle = g;
    ctx.beginPath();
    if (signal === "gong") ctx.arc(bx, sy, cell * 0.12, 0, TAU);
    else {
      // Колокольчик: купол и юбка.
      ctx.moveTo(bx - cell * 0.11, sy + cell * 0.07);
      ctx.quadraticCurveTo(bx - cell * 0.1, sy - cell * 0.11, bx, sy - cell * 0.11);
      ctx.quadraticCurveTo(bx + cell * 0.1, sy - cell * 0.11, bx + cell * 0.11, sy + cell * 0.07);
      ctx.closePath();
    }
    ctx.fill();
    ctx.strokeStyle = rgba([50, 36, 16], 0.8);
    ctx.lineWidth = Math.max(1, cell * 0.012);
    ctx.stroke();
    if (signal === "gong") ring(ctx, bx, sy, cell * 0.07, Math.max(1, cell * 0.012), [80, 56, 20], 0.7);
    else {
      ctx.fillStyle = rgba([60, 42, 18], 1);
      ctx.beginPath();
      ctx.arc(bx, sy + cell * 0.08, cell * 0.025, 0, TAU);
      ctx.fill();
    }
  },
};

/** Рисунок триггера ловушки: не устройство, а отдельная метка на области-триггере. */
export const ACTIVATOR_TELL = "activator";

/** Колышек растяжки. */
function peg(ctx, px, py, cell) {
  ctx.fillStyle = rgba([70, 56, 40], 1);
  ctx.beginPath();
  ctx.arc(px, py, cell * 0.045, 0, TAU);
  ctx.fill();
  ring(ctx, px, py, cell * 0.045, Math.max(1, cell * 0.012), [180, 160, 130], 0.8);
}

/**
 * Триггер: plate — плита, чуть приподнятая над полом (сработала — вдавлена); wire — растяжка
 * вдоль длинной стороны области между двумя колышками (сработала — порвана и провисла).
 */
TELLS[ACTIVATOR_TELL] = function activator(ctx, e) {
  const { x, y, w, h, cx, cy, cell, opt, spent } = e;
  if (opt.kind !== "wire") {
    const s = Math.min(w, h) * 0.6;
    // Пыль не ложится на край плиты: тонкая светлая щель вокруг.
    ctx.strokeStyle = rgba([196, 180, 150], spent ? 0.12 : 0.22);
    ctx.lineWidth = Math.max(1, cell * 0.012);
    roundRect(ctx, cx - s * 0.62, cy - s * 0.62, s * 1.24, s * 1.24, s * 0.18);
    ctx.stroke();
    plate(ctx, cx, cy, s, spent);
    return;
  }
  const vertical = h > w;
  const m = cell * 0.14;
  const [x1, y1, x2, y2] = vertical ? [cx, y + m, cx, y + h - m] : [x + m, cy, x + w - m, cy];
  // Поперёк провиса — от проволоки «вниз» по экрану или вбок.
  const [nx, ny] = vertical ? [1, 0] : [0, 1];
  ctx.lineCap = "round";
  if (!spent) {
    ctx.strokeStyle = rgba([0, 0, 0], 0.45);
    ctx.lineWidth = Math.max(1.5, cell * 0.018);
    ctx.beginPath();
    ctx.moveTo(x1 + cell * 0.02, y1 + cell * 0.03);
    ctx.lineTo(x2 + cell * 0.02, y2 + cell * 0.03);
    ctx.stroke();
    ctx.strokeStyle = rgba([236, 228, 210], 1);
    ctx.lineWidth = Math.max(1.2, cell * 0.016);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  } else {
    const at = (k, sag) => [lerp(x1, x2, k) + nx * sag, lerp(y1, y2, k) + ny * sag];
    ctx.strokeStyle = rgba([230, 222, 204], 0.9);
    ctx.lineWidth = Math.max(1, cell * 0.012);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(...at(0.2, cell * 0.12), ...at(0.4, cell * 0.16));
    ctx.moveTo(x2, y2);
    ctx.quadraticCurveTo(...at(0.8, cell * 0.1), ...at(0.6, cell * 0.14));
    ctx.stroke();
  }
  peg(ctx, x1, y1, cell);
  peg(ctx, x2, y2, cell);
};

export const TELL_DEVICES = Object.keys(TELLS);

/** Есть ли у устройства свой рисунок. */
export const hasTell = (device) => Object.hasOwn(TELLS, device);

/**
 * Нарисовать ловушку в области (x, y, width, height).
 * spent — после срабатывания; options — настройки устройства; fx, damageType — для цвета;
 * ownTrigger: false — у ловушки отдельный триггер, своя растяжка или плита в рисунке не нужна.
 */
/**
 * Вдоль какой оси рисунок «смотрит» (y — путь сверху вниз: растяжка и щель поперёк, бойницы в торце;
 * x — колея валуна и стены с дротиками вдоль). В вытянутой области рисунок поворачивается так,
 * чтобы эта ось шла вдоль коридора.
 */
const ORIENT = { arrows: "y", blade: "y", boulder: "x", darts: "x" };

/** Поворачивать ли рисунок на 90°: длинная сторона области не совпадает с осью рисунка. */
export function turnsTell(device, w, h) {
  const axis = ORIENT[device];
  if (!axis || Math.abs(w - h) < 1e-6) return false;
  return (w > h ? "x" : "y") !== axis;
}

export function drawTell(ctx, { x, y, width: w, height: h, cell, device, options = {}, fx = "", damageType = "", spent = false, seed = 1, ownTrigger = true }) {
  const paint = TELLS[device];
  if (!paint) return false;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const turn = turnsTell(device, w, h);
  // Повёрнутый рисунок рисуем в рамке со сторонами наоборот и поворачиваем вокруг центра.
  const fw = turn ? h : w;
  const fh = turn ? w : h;
  const env = { x: cx - fw / 2, y: cy - fh / 2, w: fw, h: fh, cx, cy, cell, rand: mulberry32(seed), opt: options ?? {}, fx, damageType, spent, ownTrigger };
  ctx.save();
  if (turn) {
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-cx, -cy);
  }
  paint(ctx, env);
  ctx.restore();
  return true;
}
