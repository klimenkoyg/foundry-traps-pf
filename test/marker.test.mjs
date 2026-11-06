import assert from "node:assert/strict";
import { test } from "node:test";
import { BADGES, MARKER_STATES, badgeFor, drawMarker, markerPad, markerState } from "../scripts/core/marker.mjs";
import { stubContext } from "./stub-context.mjs";

test("состояние метки: игроки не узнают, что ведущий выключил ловушку молча", () => {
  assert.equal(markerState({}), "armed");
  assert.equal(markerState({ disabled: true }), "armed");
  assert.equal(markerState({ disabled: true, disarmed: true }), "disarmed");
  assert.equal(markerState({ disabled: true, triggers: 1, rearm: "once" }), "spent");
  assert.equal(markerState({ disabled: true, triggers: 2, rearm: "auto" }), "armed");
  assert.equal(markerState({ disabled: false, triggers: 3, rearm: "once" }), "armed", "взвели заново — снова опасна");
  assert.equal(markerState({ disabled: true, disarmed: true, triggers: 1, rearm: "once" }), "disarmed");
});

test("значок состояния: у взведённой нет, у остальных свой; у рисунка сработавшей — нет", () => {
  assert.equal(badgeFor({ state: "spent", device: "pit" }), null);
  assert.equal(badgeFor({ state: "disarmed", device: "pit" }), BADGES.disarmed);
  assert.equal(badgeFor({ state: "armed", ghost: true, device: "pit" }), BADGES.ghost);
  assert.equal(badgeFor({ state: "armed", ghost: true, device: "pit", ghostBadge: false }), null, "рядом кнопка-глаз ведущего — значок не нужен");
  assert.equal(badgeFor({ state: "armed", ghost: false }), null);
  assert.equal(badgeFor({ state: "disarmed" }), BADGES.disarmed);
  assert.equal(badgeFor({ state: "spent" }), BADGES.spent);
  assert.equal(badgeFor({ state: "armed", ghost: true }), BADGES.ghost);
  for (const b of Object.values(BADGES)) assert.match(b.icon, /^fa-solid fa-/);
});

test("метка рисуется во всех состояниях и на всех кадрах появления без NaN", () => {
  for (const cell of [50, 100, 140]) {
    for (const size of [1, 2, 3]) {
      for (const state of MARKER_STATES) {
        for (const ghost of [false, true]) {
          for (const severity of ["setback", "dangerous", "deadly", "нет такой"]) {
            for (const reveal of [0, 0.05, 0.3, 0.7, 1]) {
              const ctx = stubContext();
              const pad = markerPad(cell);
              drawMarker(ctx, { x: pad, y: pad, width: size * cell, height: size * cell, cell, state, ghost, severity, reveal, pop: reveal });
              assert.deepEqual(ctx.bad, [], `${state} ${severity} ghost=${ghost} reveal=${reveal}`);
              assert.ok(ctx.calls > 0);
            }
          }
        }
      }
    }
  }
});

test("значок шрифтом и без шрифта; незнакомое состояние — как взведённая", () => {
  const glyph = { text: "", family: '"Font Awesome 6 Free"', weight: "900" };
  const ctx = stubContext();
  drawMarker(ctx, { x: 60, y: 60, width: 100, height: 100, cell: 100, state: "spent", glyph, badgeGlyph: glyph });
  assert.match(ctx.font, /Font Awesome/);
  const plain = stubContext();
  drawMarker(plain, { x: 60, y: 60, width: 100, height: 100, cell: 100, state: "что-то" });
  assert.match(plain.font, /serif/);
  assert.deepEqual(plain.bad, []);
});

test("поле вокруг области вмещает ромб: метка не обрезается краем холста", () => {
  for (const cell of [40, 100, 200]) assert.ok(markerPad(cell) >= cell * 0.32 * 1.7, `cell ${cell}`);
});
