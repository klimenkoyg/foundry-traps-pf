import assert from "node:assert/strict";
import { test } from "node:test";
import { EFFECT_NAMES, createEffect } from "../scripts/core/fx/painters.mjs";
import { FX_NAMES, FX_PRESETS, JB2A_PER_TOPIC, flightPath, jb2aGroups, pickJb2a, soundPath } from "../scripts/core/fx/presets.mjs";

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

test("список JB2A: разделы для ловушек, без кусков анимации и лишних петель", () => {
  const groups = jb2aGroups([
    "jb2a.spike_trap.05x05ft.top.holes.normal",
    "jb2a.spike_trap.05x05ft.top.holes.still_frame.deployed",
    "jb2a.fog_cloud.01.white.0",
    "jb2a.fog_cloud.01.white.1",
    "jb2a.magic_signs.circle.02.evocation.complete.red",
    "jb2a.magic_signs.circle.02.evocation.loop.red",
    "jb2a.magic_signs.circle.02.evocation.intro.red",
    "jb2a.magic_signs.circle.02.evocation.outro.red",
    "jb2a.magic_signs.circle.02.necromancy.loop.green",
    "jb2a.web.01",
    "jb2a.ioun_stones.01.blue",
    "jb2a.healing_generic.200px.blue",
    "sequencer.ping",
    42,
  ]);
  const map = Object.fromEntries(groups.map((g) => [g.label, g.options.map((o) => o.value)]));
  assert.deepEqual(Object.keys(map), ["Fog cloud", "Magic signs", "Spike trap", "Web"]);
  assert.deepEqual(map["Fog cloud"], ["jb2a.fog_cloud.01.white"], "номера вариантов в конце сливаются в одну запись");
  assert.deepEqual(map["Spike trap"], ["jb2a.spike_trap.05x05ft.top.holes.normal"], "стоп-кадр не нужен");
  assert.deepEqual(map["Magic signs"], [
    "jb2a.magic_signs.circle.02.evocation.complete.red",
    "jb2a.magic_signs.circle.02.necromancy.loop.green",
  ], "петля остаётся, только если нет целой анимации");
  assert.equal(groups.find((g) => g.label === "Web").options[0].label, "web");
  assert.equal(groups.find((g) => g.label === "Spike trap").options[0].label, "05x05ft · top · holes · normal");
});

test("список JB2A: длины полёта (…05ft, …30ft) — одна запись, длину подберёт Sequencer", () => {
  const groups = jb2aGroups([
    "jb2a.arrow.physical.white.01.05ft",
    "jb2a.arrow.physical.white.01.30ft",
    "jb2a.arrow.physical.white.01.90ft",
    "jb2a.fire_bolt.orange.15ft",
    "jb2a.fire_bolt.orange.30ft",
  ]);
  assert.deepEqual(groups.map((g) => [g.label, g.options.map((o) => o.value)]), [
    ["Arrow", ["jb2a.arrow.physical.white.01"]],
    ["Fire bolt", ["jb2a.fire_bolt.orange"]],
  ]);
});

test("полёт через область: вдоль длинной стороны, с запасом по краям", () => {
  assert.deepEqual(flightPath({ x: 500, y: 300 }, 400, 100, 100), { from: { x: 250, y: 300 }, to: { x: 750, y: 300 } });
  assert.deepEqual(flightPath({ x: 500, y: 300 }, 100, 300, 100), { from: { x: 500, y: 100 }, to: { x: 500, y: 500 } });
  assert.deepEqual(flightPath({ x: 0, y: 0 }, 100, 100), { from: { x: -50, y: 0 }, to: { x: 50, y: 0 } }, "квадрат — слева направо");
});

test("список JB2A: не больше JB2A_PER_TOPIC вариантов в разделе; пусто — пустой список", () => {
  const many = Array.from({ length: JB2A_PER_TOPIC + 30 }, (_, i) => `jb2a.impact.fire.c${i}`);
  assert.equal(jb2aGroups(many)[0].options.length, JB2A_PER_TOPIC);
  assert.deepEqual(jb2aGroups([]), []);
  assert.deepEqual(jb2aGroups(null), []);
});

test("JB2A — только там, где у него подходящая анимация; механика всегда своя", () => {
  const all = () => true;
  for (const fx of ["pit", "spikes", "jaws", "darts", "arrows", "net", "boulder", "fire", "blade", "alarm", "burst"]) assert.equal(pickJb2a(fx, all), null, fx);
  for (const fx of ["rocks", "gas", "sleep", "lightning", "frost", "acid", "thunder", "necrotic"]) assert.ok(pickJb2a(fx, all), fx);
});
