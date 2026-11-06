import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG } from "../scripts/core/catalog.mjs";
import { DEVICES } from "../scripts/core/devices.mjs";
import { MARKER_STATES, drawMarker, markerPad } from "../scripts/core/marker.mjs";
import { ACTIVATOR_TELL, TELL_DEVICES, drawTell, hasTell, seedOf } from "../scripts/core/tells.mjs";
import { stubContext } from "./stub-context.mjs";

const trapOf = (e) => e.trap ?? e;

test("у каждого устройства есть рисунок, у каждой ловушки библиотеки — устройство с рисунком", () => {
  // Рисунки: у каждого устройства свой, и ещё один — у триггера ловушки.
  assert.deepEqual([...TELL_DEVICES].sort(), [...Object.keys(DEVICES), ACTIVATOR_TELL].sort());
  for (const e of CATALOG) assert.ok(hasTell(trapOf(e).device), trapOf(e).id);
  assert.equal(hasTell(""), false);
  assert.equal(hasTell("toString"), false, "не ловится на свойства прототипа");
});

test("seedOf: одна область — одни и те же трещины", () => {
  assert.equal(seedOf("abc123"), seedOf("abc123"));
  assert.notEqual(seedOf("abc123"), seedOf("abc124"));
  assert.ok(Number.isInteger(seedOf("")));
});

/** Все значения каждого параметра устройства: для choice — варианты, для range — края и середина. */
function* optionSets(device) {
  if (device === ACTIVATOR_TELL) {
    yield* [{ kind: "plate" }, { kind: "wire" }, {}, { kind: "мусор" }];
    return;
  }
  const params = DEVICES[device].params;
  for (const p of params) {
    const values = p.type === "choice" ? p.options : p.type === "toggle" ? [false, true] : [p.min, Math.round((p.min + p.max) / 2), p.max];
    for (const v of values) yield { [p.key]: v };
  }
  yield {};
  yield { junk: "что-то", depth: "не число" };
}

test("рисунки всех ловушек и всех настроек рисуются без NaN — замечена и сработала", () => {
  for (const device of TELL_DEVICES) {
    for (const options of optionSets(device)) {
      for (const spent of [false, true]) {
        for (const [size, cell] of [[1, 50], [2, 100], [3, 140]]) {
          for (const fx of ["", "fire", "acid", "lightning", "frost", "thunder", "necrotic"]) {
            const ctx = stubContext();
            const ok = drawTell(ctx, { x: 10, y: 10, width: size * cell, height: size * cell, cell, device, options, fx, spent, seed: 7 });
            assert.equal(ok, true);
            assert.deepEqual(ctx.bad, [], `${device} ${JSON.stringify(options)} spent=${spent} fx=${fx} size=${size}`);
            assert.ok(ctx.calls > 10, `${device}: рисунок не пустой`);
          }
        }
      }
    }
  }
});

test("метка-рисунок: все ловушки библиотеки во всех состояниях и на кадрах появления", () => {
  for (const e of CATALOG) {
    const t = trapOf(e);
    for (const state of MARKER_STATES) {
      for (const ghost of [false, true]) {
        for (const reveal of [0, 0.2, 0.6, 1]) {
          const ctx = stubContext();
          const cell = 100;
          const pad = markerPad(cell);
          drawMarker(ctx, { x: pad, y: pad, width: t.size * cell, height: t.size * cell, cell, severity: t.severity, state, ghost, device: t.device, options: t.options, fx: t.fx, damageType: t.damageType, seed: 3, reveal, pop: reveal });
          assert.deepEqual(ctx.bad, [], `${t.id} ${state} ghost=${ghost} reveal=${reveal}`);
        }
      }
    }
  }
});

test("неизвестное устройство — рисунка нет, метка рисует знак", () => {
  assert.equal(drawTell(stubContext(), { x: 0, y: 0, width: 100, height: 100, cell: 100, device: "нет такого" }), false);
  const ctx = stubContext();
  drawMarker(ctx, { x: 90, y: 90, width: 100, height: 100, cell: 100, device: "нет такого" });
  assert.deepEqual(ctx.bad, []);
  assert.ok(ctx.calls > 0);
});

test("коридор: рисунки поворачиваются по оси и рисуются без NaN", async () => {
  const { turnsTell } = await import("../scripts/core/tells.mjs");
  assert.equal(turnsTell("blade", 100, 300), false, "щель поперёк вертикального коридора — как нарисовано");
  assert.equal(turnsTell("blade", 300, 100), true);
  assert.equal(turnsTell("boulder", 100, 400), true, "колея вдоль вертикального коридора");
  assert.equal(turnsTell("boulder", 400, 100), false);
  assert.equal(turnsTell("pit", 100, 300), false, "у ямы направления нет");
  assert.equal(turnsTell("blade", 200, 200), false, "квадрат не поворачиваем");
  for (const device of TELL_DEVICES) {
    for (const [w, h] of [[1, 3], [3, 1], [1, 4], [2, 5], [6, 1]]) {
      for (const spent of [false, true]) {
        const ctx = stubContext();
        drawTell(ctx, { x: 0, y: 0, width: w * 100, height: h * 100, cell: 100, device, spent, seed: 5 });
        assert.deepEqual(ctx.bad, [], `${device} ${w}×${h} spent=${spent}`);
      }
    }
  }
});

test("триггер: растяжка вдоль полосы любой формы, плита — в любой клетке, без NaN", () => {
  for (const kind of ["plate", "wire"]) {
    for (const spent of [false, true]) {
      for (const [w, h] of [[1, 1], [1, 3], [3, 1], [2, 2]]) {
        const ctx = stubContext();
        assert.equal(drawTell(ctx, { x: 0, y: 0, width: w * 100, height: h * 100, cell: 100, device: ACTIVATOR_TELL, options: { kind }, spent }), true);
        assert.deepEqual(ctx.bad, [], `${kind} ${w}×${h} spent=${spent}`);
      }
    }
  }
});

test("у ловушки с отдельным триггером своя растяжка и плита в рисунке не рисуются", () => {
  for (const device of ["arrows", "darts"]) {
    for (const spent of [false, true]) {
      const own = stubContext();
      const sep = stubContext();
      drawTell(own, { x: 0, y: 0, width: 200, height: 200, cell: 100, device, spent, seed: 3 });
      drawTell(sep, { x: 0, y: 0, width: 200, height: 200, cell: 100, device, spent, seed: 3, ownTrigger: false });
      assert.deepEqual(sep.bad, [], `${device} spent=${spent}`);
      assert.ok(sep.calls < own.calls, `${device} spent=${spent}: без своей растяжки или плиты`);
    }
  }
});
