import assert from "node:assert/strict";
import { test } from "node:test";
import { EFFECT_NAMES, createEffect } from "../scripts/core/fx/painters.mjs";
import { FX_NAMES, FX_PRESETS, pickJb2a, soundPath } from "../scripts/core/fx/presets.mjs";

/** Холст-заглушка: всё принимает, ничего не рисует; считает вызовы и ловит NaN в координатах. */
function stubContext() {
  let calls = 0;
  const bad = [];
  const gradient = { addColorStop: (o, c) => { if (!Number.isFinite(o) || /NaN/.test(c)) bad.push(["stop", o, c]); } };
  const ctx = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === "calls") return calls;
        if (prop === "bad") return bad;
        if (prop in target) return target[prop];
        if (prop === "createRadialGradient" || prop === "createLinearGradient") {
          return (...args) => {
            if (args.some((a) => !Number.isFinite(a))) bad.push([prop, ...args]);
            return gradient;
          };
        }
        return (...args) => {
          calls++;
          if (args.some((a) => typeof a === "number" && Number.isNaN(a))) bad.push([prop, ...args]);
        };
      },
      set(target, prop, value) {
        if (typeof value === "string" && /NaN/.test(value)) bad.push([prop, value]);
        target[prop] = value;
        return true;
      },
    },
  );
  return ctx;
}

test("у каждой анимации есть пресет и наоборот", () => {
  assert.deepEqual([...EFFECT_NAMES].sort(), Object.keys(FX_PRESETS).sort());
  assert.deepEqual([...FX_NAMES].sort(), [...EFFECT_NAMES].sort());
});

test("каждая анимация рисуется на всём отрезке времени без NaN, для разных размеров", () => {
  for (const name of EFFECT_NAMES) {
    for (const [area, cell] of [[100, 100], [300, 100], [140, 70]]) {
      const fx = createEffect(name, { area, cell, seed: 42 });
      assert.ok(fx.duration > 500 && fx.side >= area, name);
      const ctx = stubContext();
      for (let i = 0; i <= 40; i++) fx.frame(ctx, i / 40);
      assert.equal(ctx.bad.length, 0, `${name} ${area}/${cell}: ${JSON.stringify(ctx.bad.slice(0, 3))}`);
      assert.ok(ctx.calls > 20, `${name}: почти ничего не нарисовано`);
    }
  }
});

test("неизвестная анимация → вспышка", () => {
  assert.equal(createEffect("nope", { area: 100, cell: 100 }).name, "burst");
});

test("звук и JB2A", () => {
  assert.equal(soundPath("thud", "ssl_traps_pf2e"), "modules/ssl_traps_pf2e/sounds/thud.wav");
  assert.equal(soundPath("worlds/x/boom.ogg", "ssl_traps_pf2e"), "worlds/x/boom.ogg");
  assert.equal(soundPath("", "ssl_traps_pf2e"), "");
  assert.equal(soundPath("unknown", "ssl_traps_pf2e"), "");
  const has = (k) => k === "jb2a.fog_cloud";
  assert.equal(pickJb2a("gas", has), "jb2a.fog_cloud");
  assert.equal(pickJb2a("gas", () => false), null);
  assert.equal(pickJb2a("gas", () => { throw new Error("not ready"); }), null);
});

test("JB2A — только там, где у него подходящая анимация; механика всегда своя", () => {
  const all = () => true;
  for (const fx of ["pit", "spikes", "jaws", "darts", "arrows", "net", "boulder", "fire", "blade", "alarm", "burst"]) assert.equal(pickJb2a(fx, all), null, fx);
  for (const fx of ["rocks", "gas", "sleep", "lightning", "frost", "acid", "thunder", "necrotic"]) assert.ok(pickJb2a(fx, all), fx);
});
