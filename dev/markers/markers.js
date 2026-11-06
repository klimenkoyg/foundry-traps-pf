/* Витрина меток: те же рисунки, что на сцене (scripts/core/marker.mjs, tells.mjs), поверх пола. */

import { CATALOG } from "/scripts/core/catalog.mjs";
import { mulberry32 } from "/scripts/core/fx/painters.mjs";
import { REVEAL_MS, badgeFor, drawMarker } from "/scripts/core/marker.mjs";
import { seedOf } from "/scripts/core/tells.mjs";

const params = new URLSearchParams(location.search);
/** Клетка в px; ?cell=200 — крупнее, ?only=pit,bearTrap — только эти ловушки. */
const CELL = Math.max(40, Math.min(300, Number(params.get("cell")) || 90));
const ONLY = params.get("only")?.split(",") ?? null;
/** ?reveal=0.4 — показать кадр появления (для снимков). */
const FRAME = params.has("reveal") ? Number(params.get("reveal")) : 1;
if (ONLY) document.body.classList.add("is-zoom");
const tiles = [];
const lang = await (await fetch("/lang/ru.json")).json();
const T = lang.TRAPS;

/** Символ значка Font Awesome — как в foundry/markers.mjs (стиль читаем до удаления элемента). */
function glyph(iconClass) {
  const el = document.createElement("i");
  el.className = iconClass;
  el.style.cssText = "position:absolute;left:-9999px;visibility:hidden";
  document.body.append(el);
  const css = getComputedStyle(el, "::before");
  const text = String(css.content ?? "").replace(/^["']|["']$/g, "");
  const out = text && text !== "none" ? { text, family: css.fontFamily, weight: css.fontWeight || "900" } : null;
  el.remove();
  return out;
}

function floor(ctx, w, h, seed) {
  const rand = mulberry32(seed);
  ctx.fillStyle = "#2f2a25";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += CELL) {
    for (let x = 0; x < w; x += CELL) {
      const v = 52 + rand() * 14;
      ctx.fillStyle = `rgb(${v + 8},${v + 3},${v - 3})`;
      ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
    }
  }
}

/** Картинка: пол (size + 2 клетки) и метка ловушки посередине. */
function canvasFor(trap, { state = "armed", ghost = false, seedText = trap.id }) {
  const tw = Math.max(1, trap.width ?? trap.size);
  const th = Math.max(1, trap.height ?? trap.size);
  const cols = tw + 2;
  const rows = th + 2;
  const el = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  el.width = cols * CELL * dpr;
  el.height = rows * CELL * dpr;
  const ctx = el.getContext("2d");
  const badge = badgeFor({ state, ghost, device: trap.device });
  const icon = glyph(trap.icon);
  const badgeGlyph = badge ? glyph(badge.icon) : null;
  const paint = (reveal = 1) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    floor(ctx, cols * CELL, rows * CELL, seedOf(seedText) % 97);
    if (ghost) {
      ctx.fillStyle = "rgba(224,112,46,0.2)";
      ctx.fillRect(CELL, CELL, tw * CELL, th * CELL);
      ctx.strokeStyle = "rgba(224,112,46,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeRect(CELL + 1, CELL + 1, tw * CELL - 2, th * CELL - 2);
    }
    drawMarker(ctx, {
      x: CELL,
      y: CELL,
      width: tw * CELL,
      height: th * CELL,
      cell: CELL,
      severity: trap.severity,
      state,
      ghost,
      glyph: icon,
      badgeGlyph,
      device: trap.device,
      options: trap.options,
      fx: trap.fx,
      damageType: trap.damageType,
      seed: seedOf(seedText),
      reveal,
    });
  };
  paint(FRAME);
  const tile = { el, paint };
  el.addEventListener("click", () => play([tile]));
  tiles.push(tile);
  return el;
}

function play(list) {
  const start = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - start) / REVEAL_MS);
    for (const t of list) t.paint(p);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const name = (trap) => T.Trap[trap.id]?.name ?? trap.id;
const sev = (trap) => T.Severity[trap.severity] ?? trap.severity;

if (document.readyState !== "complete") await new Promise((r) => addEventListener("load", r, { once: true }));
await document.fonts.load('900 32px "Font Awesome 6 Free"', "").catch(() => {});

const catalog = document.querySelector("#catalog");
for (const entry of CATALOG) {
  const trap = entry.trap ?? entry;
  if (ONLY && !ONLY.includes(trap.id)) continue;
  const fig = document.createElement("figure");
  const pair = document.createElement("div");
  pair.className = "pair";
  for (const [state, label] of [["armed", "Замечена"], ["spent", "Сработала"]]) {
    const cell = document.createElement("div");
    cell.append(canvasFor(trap, { state }));
    const tag = document.createElement("span");
    tag.textContent = label;
    cell.append(tag);
    pair.append(cell);
  }
  fig.append(pair);
  const cap = document.createElement("figcaption");
  cap.innerHTML = `<b>${name(trap)}</b>${sev(trap)} · ${trap.size}×${trap.size}`;
  fig.append(cap);
  catalog.append(fig);
}

const byId = Object.fromEntries(CATALOG.map((e) => [(e.trap ?? e).id, e.trap ?? e]));
const variant = (id, options, label, state = "armed", extra = {}) => ({ trap: { ...byId[id], ...extra, options: { ...byId[id].options, ...options } }, label, state });
const D = T.Device;
const variants = [
  variant("pit", { depth: 10, spikes: "none" }, "Яма 10 фт, пустая — сработала", "spent"),
  variant("pit", { depth: 120, spikes: "poisoned", walls: "slick" }, "Яма 120 фт, отравленные колья, скользкие стены — сработала", "spent"),
  variant("pit", { spikes: "poisoned" }, "Яма с отравленными кольями — замечена"),
  variant("bearTrap", { jaws: "small" }, `Капкан: ${D.bearTrap.jaws.small}`),
  variant("bearTrap", { jaws: "giant", venom: true }, `Капкан: ${D.bearTrap.jaws.giant}, с ядом`),
  variant("poisonDarts", { count: 4, poison: "sleep" }, "Дротики: 4, сонное зелье"),
  variant("arrowVolley", { count: 4, tips: "fire" }, "Стрелы: 4, горящие — сработала", "spent"),
  variant("fallingNet", { net: "hooked" }, `Сеть: ${D.net.net.hooked}`),
  variant("fallingNet", { net: "chain" }, `Сеть: ${D.net.net.chain}`),
  variant("collapsingRoof", { debris: "slabs" }, `Обвал: ${D.roof.debris.slabs} — сработала`, "spent"),
  variant("collapsingRoof", { debris: "gravel" }, `Обвал: ${D.roof.debris.gravel} — сработала`, "spent"),
  variant("fireJet", { nozzles: "ring", pressure: "strong" }, "Огонь: кольцо сопел, сильный напор", "armed", { size: 2 }),
  variant("poisonGas", { toxin: "madness", density: "thick" }, `Газ: ${D.gas.toxin.madness}, ${D.gas.density.thick}`),
  variant("sleepGas", { toxin: "smoke" }, `Газ: ${D.gas.toxin.smoke}`),
  variant("lightningRune", { power: "weak" }, `Руна: ${D.rune.power.weak}`),
  variant("lightningRune", { power: "devastating" }, `Руна: ${D.rune.power.devastating}`),
  variant("alarmPlate", { signal: "gong" }, `Сигнал: ${D.alarm.signal.gong}`),
  variant("alarmPlate", { signal: "chime" }, `Сигнал: ${D.alarm.signal.chime}`),
];
const box = document.querySelector("#variants");
for (const v of variants) {
  if (ONLY && !ONLY.includes(v.trap.id)) continue;
  const fig = document.createElement("figure");
  fig.append(canvasFor(v.trap, { state: v.state, seedText: v.label }));
  const cap = document.createElement("figcaption");
  cap.innerHTML = `<b>${v.label}</b>`;
  fig.append(cap);
  box.append(fig);
}

const rects = document.querySelector("#rects");
for (const [id, w, h, state, label] of [
  ["scythingBlade", 1, 3, "armed", "Маятник 1×3: щель поперёк коридора"],
  ["scythingBlade", 3, 1, "spent", "Маятник 3×1 — сработал"],
  ["rollingBoulder", 1, 4, "armed", "Валун 1×4: колея вдоль коридора"],
  ["rollingBoulder", 4, 1, "spent", "Валун 4×1 — скатился"],
  ["arrowVolley", 3, 1, "armed", "Залп 3×1: бойницы в торце"],
  ["poisonDarts", 1, 3, "armed", "Дротики 1×3: отверстия по стенам"],
  ["poisonGas", 1, 4, "armed", "Газ 1×4: решётки в ряд"],
  ["frostRune", 1, 3, "armed", "Руна 1×3: ряд знаков"],
  ["spikedPit", 1, 2, "spent", "Яма 1×2 — открыта"],
  ["fallingNet", 2, 3, "armed", "Сеть 2×3"],
]) {
  if (ONLY && !ONLY.includes(id)) continue;
  const fig = document.createElement("figure");
  fig.append(canvasFor({ ...byId[id], width: w, height: h }, { state, seedText: label }));
  const cap = document.createElement("figcaption");
  cap.innerHTML = `<b>${label}</b>`;
  fig.append(cap);
  rects.append(fig);
}

const states = document.querySelector("#states");
for (const [id, state, ghost, label] of [
  ["spikedPit", "disarmed", false, "Яма с кольями — обезврежена"],
  ["bearTrap", "disarmed", false, "Капкан — обезврежен"],
  ["poisonDarts", "armed", true, "Ведущий: дротики ещё не замечены"],
  ["frostRune", "armed", true, "Ведущий: руна мороза ещё не замечена"],
]) {
  if (ONLY && !ONLY.includes(id)) continue;
  const fig = document.createElement("figure");
  fig.append(canvasFor(byId[id], { state, ghost, seedText: label }));
  const cap = document.createElement("figcaption");
  cap.innerHTML = `<b>${label}</b>`;
  fig.append(cap);
  states.append(fig);
}

document.querySelector("#replay").addEventListener("click", () => play(tiles));
