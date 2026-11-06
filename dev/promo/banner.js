/* Заставка для объявлений: пол подземелья и настоящие рисунки ловушек модуля (core/marker.mjs). */

import { CATALOG } from "/scripts/core/catalog.mjs";
import { glow, mulberry32 } from "/scripts/core/fx/painters.mjs";
import { drawMarker } from "/scripts/core/marker.mjs";
import { seedOf } from "/scripts/core/tells.mjs";

/** Тексты заставки: ?lang=en — английская. */
const TEXT = {
  ru: {
    h1: "Западня",
    sub: "Trap Library",
    tag: "Ловушки для Pathfinder 2e в Foundry VTT",
    lead: "Перетащи ловушку на карту — дальше она сработает сама: анимация, звук, спасброски и урон.",
    meta: ["18 ловушек", "Foundry v13–v14", "бесплатно", "RU · EN"],
  },
  en: {
    h1: "Trap Library",
    sub: "",
    tag: "Traps for Pathfinder 2e in Foundry VTT",
    lead: "Drag a trap onto the map — it does the rest: animation, sound, saving throws and damage.",
    meta: ["18 traps", "Foundry v13–v14", "free", "EN · RU"],
  },
};

const lang = new URLSearchParams(location.search).get("lang") === "en" ? "en" : "ru";
document.documentElement.lang = lang;
document.getElementById("banner").classList.toggle("en", lang === "en");
for (const node of document.querySelectorAll("[data-t]")) {
  const value = TEXT[lang][node.dataset.t];
  if (Array.isArray(value)) node.replaceChildren(...value.map((v) => Object.assign(document.createElement("span"), { textContent: v })));
  else node.textContent = value;
  node.hidden = !String(value ?? "").length;
}

const W = 1600;
const H = 900;
const CELL = 118;
const el = document.getElementById("map");
const ctx = el.getContext("2d");
const byId = Object.fromEntries(CATALOG.map((e) => [(e.trap ?? e).id, e.trap ?? e]));

/** Пол: плиты разного тона, тёмные швы, редкие трещины и пыль. */
function floor() {
  const rand = mulberry32(17);
  ctx.fillStyle = "#16120e";
  ctx.fillRect(0, 0, W, H);
  const ox = -40;
  const oy = -30;
  for (let y = oy; y < H; y += CELL) {
    for (let x = ox; x < W; x += CELL) {
      const v = 44 + rand() * 18;
      const g = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
      g.addColorStop(0, `rgb(${v + 12},${v + 6},${v - 2})`);
      g.addColorStop(1, `rgb(${v - 4},${v - 8},${v - 14})`);
      ctx.fillStyle = g;
      ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
      // фаска сверху-слева
      ctx.fillStyle = "rgba(255,240,210,0.05)";
      ctx.fillRect(x + 3, y + 3, CELL - 6, 2);
      if (rand() < 0.22) {
        ctx.strokeStyle = "rgba(10,8,6,0.55)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        let px = x + 10 + rand() * (CELL - 20);
        let py = y + 10 + rand() * (CELL - 20);
        ctx.moveTo(px, py);
        for (let i = 0; i < 4; i++) {
          px += (rand() - 0.5) * 34;
          py += (rand() - 0.5) * 34;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
  }
}

/** Свет: тёплый факел и холод руны — карта не плоская. */
function light() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  glow(ctx, 1240, 330, 520, [255, 160, 70], 0.16, 0);
  glow(ctx, 1440, 180, 260, [150, 200, 255], 0.12, 0);
  glow(ctx, 1330, 640, 320, [140, 200, 80], 0.08, 0);
  glow(ctx, 900, 560, 260, [255, 130, 50], 0.1, 0);
  ctx.restore();
}

function trap(id, col, row, w, h, state = "armed", extra = {}) {
  const t = { ...byId[id], ...extra };
  drawMarker(ctx, {
    x: col * CELL - 40,
    y: row * CELL - 30,
    width: w * CELL,
    height: h * CELL,
    cell: CELL,
    severity: t.severity,
    state,
    device: t.device,
    options: t.options,
    fx: t.fx,
    damageType: t.damageType,
    seed: seedOf(`${id}${col}${row}`),
  });
}

floor();
light();
// Справа — «комната» с ловушками; слева их закрывает тень под текстом.
trap("spikedPit", 8, 1, 2, 2, "spent", { options: { depth: 40, spikes: "stakes", walls: "rough" } });
trap("frostRune", 11, 1, 2, 2);
trap("fireJet", 7, 4, 2, 2, "spent", { options: { pressure: "strong", nozzles: "ring" } });
trap("poisonGas", 10, 4, 2, 2);
trap("bearTrap", 12, 4, 1, 1);
trap("fallingNet", 11, 6, 2, 1, "armed", { options: { net: "weighted" } });
document.body.dataset.ready = "1";
