import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG } from "../scripts/core/catalog.mjs";
import { DEVICES, deriveDevice, deviceFields, normalizeOptions, normalizeParam } from "../scripts/core/devices.mjs";
import {
  byPartyLevel,
  fromBehaviorData,
  normalizeTrap,
  scaleTrap,
  toBehaviorData,
  unscaleTrap,
  withDevice,
  withFixedDamage,
} from "../scripts/core/trap.mjs";
import { FX_PRESETS, SOUND_NAMES } from "../scripts/core/fx/presets.mjs";

test("у каждой встроенной ловушки есть устройство, и его числа совпадают с описанием", () => {
  for (const raw of CATALOG) {
    assert.ok(raw.device in DEVICES, `${raw.id}: нет устройства`);
    assert.deepEqual(normalizeOptions(raw.device, raw.options), raw.options, `${raw.id}: параметры не в норме`);
    const plain = normalizeTrap(raw);
    const derived = normalizeTrap({ ...raw, ...deriveDevice(raw.device, raw.options) });
    assert.deepEqual(derived, plain, `${raw.id}: устройство даёт другие числа`);
  }
});

test("любые значения параметров дают корректную ловушку", () => {
  for (const [name, def] of Object.entries(DEVICES)) {
    for (const p of def.params) {
      const values = p.type === "choice" ? p.options : p.type === "toggle" ? [false, true] : [p.min, p.max];
      for (const v of values) {
        const trap = normalizeTrap({ device: name, options: { [p.key]: v }, ...deriveDevice(name, { [p.key]: v }) });
        assert.equal(trap.options[p.key], v, `${name}.${p.key}=${v}`);
        assert.ok(trap.fx in FX_PRESETS, `${name}: анимация ${trap.fx}`);
        if (trap.sound) assert.ok(SOUND_NAMES.includes(trap.sound), `${name}: звук ${trap.sound}`);
      }
      assert.ok(p.fields.length, `${name}.${p.key}: не сказано, что задаёт`);
    }
  }
});

test("параметры: мусор → допустимые значения", () => {
  const depth = DEVICES.pit.params[0];
  assert.equal(normalizeParam(depth, 37), 40);
  assert.equal(normalizeParam(depth, 999), 200);
  assert.equal(normalizeParam(depth, "abc"), 10);
  assert.equal(normalizeParam(DEVICES.pit.params[1], "lava"), "stakes");
  assert.equal(normalizeParam(DEVICES.roof.params[1], "true"), true);
  assert.deepEqual(normalizeOptions("nope", { a: 1 }), {});
  assert.equal(normalizeTrap({ device: "nope" }).device, "");
  assert.deepEqual(normalizeOptions("rune", { power: "strong", base: "3d8", junk: 1 }), { power: "strong", base: "3d8" });
});

test("глубина ямы: урон — половина высоты, от уровня не зависит; стены — Сл выбраться", () => {
  assert.equal(deriveDevice("pit", { depth: 30 }).damage, "15");
  assert.equal(deriveDevice("pit", { depth: 200 }).damage, "100");
  const deep = withDevice(scaleTrap(CATALOG.find((x) => x.id === "pit"), 3), { depth: 60 }, 3);
  assert.equal(deep.damage, "30");
  assert.equal(scaleTrap(deep, 4).damage, "30");
  assert.equal(deep.escapeDC, 20);
  const slick = withDevice(deep, { walls: "slick", spikes: "poisoned" }, 3);
  assert.equal(slick.escapeDC, 30);
  assert.equal(slick.damage2, "2d6");
  assert.equal(slick.damage2Type, "piercing");
  assert.deepEqual([slick.condition, slick.conditionValue], ["sickened", 1]);
  assert.equal(slick.fx, "spikes");
  assert.deepEqual([slick.saveAbility, slick.onSave], ["reflex", "avoid"], "схватиться за край — Рефлекс");
});

test("параметры меняют только свои поля и учитывают уровень партии", () => {
  const gas = scaleTrap(CATALOG.find((x) => x.id === "poisonGas"), 5);
  assert.equal(gas.level, 6);
  assert.equal(gas.damage, "4d6+10", "урон простой ловушки: 36/18 — вдвое");
  const custom = { ...gas, detectDC: 30, name: "Склеп" };
  const thick = withDevice(custom, { density: "thick" }, 5);
  assert.equal(thick.saveDC, 22 + (24 - 18), "Сл густого газа на 1 уровне партии + рост до 6-го уровня ловушки");
  assert.equal(thick.detectDC, 30, "чужие поля не трогаем");
  assert.equal(thick.name, "Склеп");
  assert.equal(thick.damage, "4d6+10");
  const sleep = withDevice(thick, { toxin: "sleep" }, 5);
  assert.equal(sleep.damage, "");
  assert.equal(sleep.condition, "unconscious");
  assert.equal(sleep.onSave, "avoid");
  assert.equal(sleep.fx, "sleep");
  assert.equal(sleep.options.density, "thick");
  const madness = withDevice(sleep, { toxin: "madness" }, 5);
  assert.deepEqual([madness.saveAbility, madness.condition, madness.conditionValue], ["will", "frightened", 2]);
});

test("руна: сила считается от урона из описания", () => {
  const rune = CATALOG.find((x) => x.id === "lightningRune");
  assert.equal(withDevice(rune, { power: "weak" }).damage, "2d10");
  assert.equal(withDevice(rune, { power: "strong" }).damage, "5d10");
  assert.equal(withDevice(rune, { power: "devastating" }).damage, "6d10");
  assert.equal(withDevice(withDevice(rune, { power: "weak" }), { power: "normal" }).damage, "3d10");
});

test("устройство и параметры доезжают до поведения области и обратно в библиотеку", () => {
  const pit = withDevice(CATALOG.find((x) => x.id === "pit"), { depth: 50, walls: "rough" });
  const system = toBehaviorData(pit, { party: 3 });
  assert.equal(system.device, "pit");
  assert.deepEqual(system.options, { depth: 50, spikes: "none", walls: "rough" });
  assert.equal(system.damage, "25");
  assert.equal(system.escapeDC, 15);
  const back = fromBehaviorData(system, { id: "custom-x", name: "Колодец", party: 3 });
  assert.equal(back.damage, "25");
  assert.equal(back.level, 0);
  assert.equal(back.options.depth, 50);

  const dart = scaleTrap(CATALOG.find((x) => x.id === "poisonDarts"), 4);
  assert.equal(dart.damage2, "2d6", "продолжительный урон тоже растёт");
  assert.equal(unscaleTrap(dart, 4).damage, "2d4+2");
});

test("ловушка на разных уровнях партии для окна настройки: текущий — как в полях", () => {
  const jet = scaleTrap(CATALOG.find((x) => x.id === "fireJet"), 3);
  const rows = byPartyLevel(jet, 3, [1, 4, 8]);
  assert.deepEqual(rows.map((r) => [r.party, r.level, r.current]), [[1, 2, false], [3, 4, true], [4, 5, false], [8, 9, false]]);
  assert.equal(rows[0].damage, "2d10+7");
  assert.equal(byPartyLevel({ ...jet, damage: "9d6" }, 3, [1])[1].damage, "9d6", "поле поправили руками — на текущем уровне ровно оно");
});

test("галочка «урон не зависит от уровня»: числа в полях не меняются, меняется рост", () => {
  const jet = scaleTrap(CATALOG.find((x) => x.id === "fireJet"), 5);
  const fixed = withFixedDamage(jet, true);
  assert.equal(fixed.damage, jet.damage);
  assert.equal(fixed.fixedDamage, true);
  assert.equal(unscaleTrap(fixed, 5).damage, jet.damage, "в библиотеку — тем же уроном");
  assert.equal(unscaleTrap(jet, 5).damage, "2d10+7");
});

test("поля устройства известны заранее", () => {
  assert.ok(deviceFields("pit").includes("escapeDC"));
  assert.ok(deviceFields("jet").includes("affects"));
  assert.deepEqual(deviceFields("nope"), []);
});
