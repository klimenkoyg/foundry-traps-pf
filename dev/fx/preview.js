/* Стенд анимаций: настоящий код эффектов (scripts/core/fx/painters.mjs) поверх нарисованного пола. */

import { EFFECT_NAMES, createEffect, mulberry32 } from "/scripts/core/fx/painters.mjs";

const $ = (s) => document.querySelector(s);
const VIEW_CELLS = 6; // сколько клеток помещается в картинку
const tiles = [];

function drawFloor(ctx, side, cell, seed) {
  const rand = mulberry32(seed);
  ctx.fillStyle = "#3b3530";
  ctx.fillRect(0, 0, side, side);
  for (let y = 0; y < side; y += cell) {
    for (let x = 0; x < side; x += cell) {
      const v = 48 + rand() * 16;
      ctx.fillStyle = `rgb(${v + 8},${v + 2},${v - 4})`;
      ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(x + 2 + rand() * cell * 0.6, y + 2 + rand() * cell * 0.6, cell * 0.25, cell * 0.04);
    }
  }
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= side; i += cell) {
    ctx.moveTo(i + 0.5, 0);
    ctx.lineTo(i + 0.5, side);
    ctx.moveTo(0, i + 0.5);
    ctx.lineTo(side, i + 0.5);
  }
  ctx.stroke();
}

function drawToken(ctx, x, y, r) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.arc(x + 3, y + 4, r, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, "#7d9ccc");
  g.addColorStop(1, "#2f4469");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d9a441";
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.stroke();
}

function makeTile(name) {
  const fig = document.createElement("figure");
  const canvas = document.createElement("canvas");
  const cap = document.createElement("figcaption");
  cap.innerHTML = `<b>${name}</b><span></span>`;
  fig.append(canvas, cap);
  $("#grid").append(fig);
  const tile = { name, canvas, info: cap.querySelector("span"), start: performance.now(), seed: 1 };
  canvas.addEventListener("click", () => restart(tile));
  return tile;
}

function setup(tile) {
  const cell = Number($("#cell").value);
  const areaCells = Number($("#area").value);
  const side = cell * VIEW_CELLS;
  tile.canvas.width = side;
  tile.canvas.height = side;
  tile.cell = cell;
  tile.area = areaCells * cell;
  // Область привязана к клеткам: центр картинки — центр области
  tile.cx = side / 2 + (areaCells % 2 ? cell / 2 : 0);
  tile.cy = tile.cx;
  tile.floor = document.createElement("canvas");
  tile.floor.width = side;
  tile.floor.height = side;
  drawFloor(tile.floor.getContext("2d"), side, cell, 7);
  restart(tile);
}

function restart(tile) {
  tile.seed = (tile.seed * 7919 + 17) % 100000;
  tile.fx = createEffect(tile.name, { area: tile.area, cell: tile.cell, seed: tile.seed });
  tile.layer = document.createElement("canvas");
  tile.layer.width = tile.fx.side;
  tile.layer.height = tile.fx.side;
  tile.start = performance.now();
  tile.info.textContent = `${tile.fx.duration} мс · холст ${tile.fx.side}px`;
}

function frame(now) {
  for (const tile of tiles) {
    const ctx = tile.canvas.getContext("2d");
    const side = tile.canvas.width;
    ctx.clearRect(0, 0, side, side);
    ctx.drawImage(tile.floor, 0, 0);
    // Подсветка области ловушки
    ctx.strokeStyle = "rgba(217,164,65,0.35)";
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(tile.cx - tile.area / 2, tile.cy - tile.area / 2, tile.area, tile.area);
    ctx.setLineDash([]);
    drawToken(ctx, tile.cx, tile.cy, tile.cell * 0.38);
    let t = window.__freeze ?? (now - tile.start) / tile.fx.duration;
    if (t > 1.25 && $("#loop").checked) {
      restart(tile);
      t = 0;
    }
    if (t <= 1) {
      const lctx = tile.layer.getContext("2d");
      lctx.clearRect(0, 0, tile.layer.width, tile.layer.height);
      tile.fx.frame(lctx, t);
      ctx.drawImage(tile.layer, tile.cx - tile.fx.side / 2, tile.cy - tile.fx.side / 2);
    }
  }
  requestAnimationFrame(frame);
}

for (const name of EFFECT_NAMES) tiles.push(makeTile(name));
const all = () => tiles.forEach(setup);
$("#area").addEventListener("change", all);
$("#cell").addEventListener("change", all);
$("#all").addEventListener("click", () => tiles.forEach(restart));
all();
requestAnimationFrame(frame);

// Для снимков: ?t=0.4 — заморозить все эффекты в этой доле времени.
const freeze = new URLSearchParams(location.search).get("t");
if (freeze !== null) {
  $("#loop").checked = false;
  window.__freeze = Number(freeze);
}
window.__tiles = tiles;
