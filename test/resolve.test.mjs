import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG } from "../scripts/core/catalog.mjs";
import { allChecked, anyHit, counts, damageDue, hasEffect, needsDamageRoll, newTarget, nominal, setDamage, settle, stage, takesPersistent, totalDamage, trapSnapshot } from "../scripts/core/resolve.mjs";
import { normalizeTrap } from "../scripts/core/trap.mjs";

const byId = (id) => normalizeTrap((CATALOG.find((e) => (e.trap ?? e).id === id).trap ?? CATALOG.find((e) => (e.trap ?? e).id === id)));
// rolled: true — урон уже брошен (как будто все проверки пришли).
const state = (trap, parts, targets, rolled = true) => ({ trap: trapSnapshot(trap), parts, targets, rolled });

test("базовый спасбросок: цель ждёт броска, потом успех — половина, провал — полный урон и состояние", () => {
  const trap = { ...byId("poisonDarts"), attackBonus: null, saveAbility: "fortitude", saveDC: 13, onSave: "basic", condition: "sickened", conditionValue: 1 };
  const parts = [{ value: 7, type: "poison" }, { value: 2, type: "piercing" }];
  let mira = newTarget({ id: "t1", actorId: "a1", name: "Мира" });
  let brom = newTarget({ id: "t2", actorId: "a2", name: "Бром" });
  let s = state(trap, parts, [mira, brom]);
  assert.equal(stage(s, mira), "roll");
  assert.deepEqual(counts(s), { roll: 2, damage: 0, ready: 0, applied: 0, clear: 0 });

  mira = settle(s.trap, mira, { total: 15 }, "player");
  brom = settle(s.trap, brom, { total: 8 }, "module");
  s = { ...s, targets: [mira, brom] };
  assert.equal(totalDamage(parts), 9);
  assert.equal(nominal(s, mira), 4, "половина с округлением вниз");
  assert.equal(nominal(s, brom), 9);
  assert.equal(mira.res.condition, false);
  assert.equal(brom.res.condition, true);
  assert.equal(mira.by, "player");
  assert.deepEqual(counts(s), { roll: 0, damage: 0, ready: 2, applied: 0, clear: 0 });
  assert.equal(anyHit(s), true);

  s.targets[1] = { ...brom, applied: true, dealt: 9, conditioned: true };
  assert.equal(stage(s, s.targets[1]), "applied");
});

test("успех без урона и промах — «обошлось»; без проверки — сразу готово", () => {
  const save = { ...byId("poisonDarts"), attackBonus: null, saveAbility: "reflex", saveDC: 13, onSave: "avoid", condition: "" };
  let s = state(save, [{ value: 5, type: "piercing" }], []);
  const ok = settle(s.trap, newTarget({ id: "t", name: "Мира" }), { total: 20 });
  assert.equal(stage(s, ok), "clear");
  assert.equal(hasEffect(s, ok), false);

  const attack = { ...byId("scythingBlade"), attackBonus: 5 };
  s = state(attack, [{ value: 10, type: "slashing" }], []);
  const miss = settle(s.trap, newTarget({ id: "t", name: "Бром" }), { total: 3, natural: 2, ac: 17 });
  const hit = settle(s.trap, newTarget({ id: "t", name: "Бром" }), { total: 20, natural: 15, ac: 17 });
  const crit = settle(s.trap, newTarget({ id: "t", name: "Бром" }), { total: 27, natural: 18, ac: 17 });
  assert.equal(stage(s, miss), "clear");
  assert.equal(stage(s, hit), "ready");
  assert.equal(nominal(s, hit), 10);
  assert.equal(nominal(s, crit), 20, "крит — вдвое");

  // Яма без спасброска (ведущий выбрал «без проверки» в окне настройки).
  const pit = { ...byId("pit"), saveAbility: "", attackBonus: null, condition: "" };
  s = state(pit, [{ value: 6, type: "bludgeoning" }], []);
  assert.equal(s.trap.mode, "auto");
  const fell = settle(s.trap, newTarget({ id: "t", name: "Мира" }));
  assert.equal(stage(s, fell), "ready");
  assert.equal(nominal(s, fell), 6);
});

test("только состояние (сеть): применять есть что, даже без урона", () => {
  const net = { ...byId("fallingNet"), damage: "", damage2: "" };
  const s = state(net, [], []);
  const t = settle(s.trap, newTarget({ id: "t", name: "Мира" }), s.trap.mode === "save" ? { total: 1 } : null);
  assert.equal(hasEffect(s, t), Boolean(s.trap.condition));
});

test("урон бросается после проверок: ждёт последнего спасброска, потом один на всех", () => {
  const trap = { ...byId("poisonGas") };
  const parts = [{ formula: "2d6+5", type: "poison", value: null }];
  let a = newTarget({ id: "t1", name: "Мира" });
  let b = newTarget({ id: "t2", name: "Бром" });
  const s = state(trap, parts, [a, b], false);
  assert.equal(needsDamageRoll(s), true);
  assert.equal(damageDue(s), false, "спасброски ещё не пришли");

  s.targets[0] = settle(s.trap, a, { total: 20, natural: 12 }, "player");
  assert.equal(stage(s, s.targets[0]), "damage", "итог есть — ждёт урона");
  assert.equal(nominal(s, s.targets[0]), null, "числа ещё нет");
  assert.equal(allChecked(s), false);
  assert.equal(damageDue(s), false);

  s.targets[1] = settle(s.trap, b, { total: 12, natural: 4 }, "module");
  assert.equal(damageDue(s), true, "все проверки пришли — пора бросать");

  setDamage(s, [11]);
  assert.equal(s.rolled, true);
  assert.equal(needsDamageRoll(s), false);
  assert.equal(stage(s, s.targets[0]), "ready");
  assert.equal(nominal(s, s.targets[0]), 5, "успех — половина 11 вниз");
  assert.equal(nominal(s, s.targets[1]), 11);
  assert.deepEqual(counts(s), { roll: 0, damage: 0, ready: 2, applied: 0, clear: 0 });
});

test("ловушка без урона (сеть): ждать урона нечего, состояние сразу", () => {
  const net = { ...byId("fallingNet"), damage: "", damage2: "" };
  const s = state(net, [], [], false);
  assert.equal(needsDamageRoll(s), false);
  const t = settle(s.trap, newTarget({ id: "t", name: "Мира" }), { total: 1 });
  assert.equal(stage(s, t), s.trap.condition ? "ready" : "clear");
});

test("продолжительный урон: не бросается сразу, вешается при провале, не при половине", () => {
  const trap = { ...byId("acidSpray") };
  const parts = [
    { formula: "1d10+4", type: "acid", value: null },
    { formula: "1d6", type: "acid", value: null, persistent: true },
  ];
  const s = state(trap, parts, [], false);
  assert.equal(needsDamageRoll(s), true);
  setDamage(s, [9]);
  assert.equal(s.parts[0].value, 9);
  assert.equal(s.parts[1].value, null, "продолжительный — без броска");
  assert.equal(totalDamage(s.parts), 9);
  const ok = settle(s.trap, newTarget({ id: "t1", name: "Мира" }), { total: 18, natural: 10 });
  const fail = settle(s.trap, newTarget({ id: "t2", name: "Бром" }), { total: 10, natural: 3 });
  const critFail = settle(s.trap, newTarget({ id: "t3", name: "Гек" }), { total: 5, natural: 2 });
  assert.equal(takesPersistent(s, ok), false);
  assert.equal(takesPersistent(s, fail), true);
  assert.equal(nominal(s, ok), 4);
  assert.equal(nominal(s, critFail), 18, "крит. провал — вдвое");

  // Ловушка только с продолжительным уроном: бросать сразу нечего, но применить есть что.
  const only = state(trap, [parts[1]], [], false);
  assert.equal(needsDamageRoll(only), false);
  const hit = settle(only.trap, newTarget({ id: "t", name: "Мира" }), { total: 1, natural: 1 });
  assert.equal(stage(only, hit), "ready");
});
