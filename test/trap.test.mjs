import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG } from "../scripts/core/catalog.mjs";
import {
  filterTraps,
  fromBehaviorData,
  isFormula,
  normalizeTrap,
  resolveDisarm,
  resolveTarget,
  scaleFormula,
  scaleTrap,
  unscaleTrap,
  trapXp,
  activation,
  MAX_ACTIVATORS,
  toBehaviorData,
  trapMode,
} from "../scripts/core/trap.mjs";
import { FX_PRESETS, SOUND_NAMES } from "../scripts/core/fx/presets.mjs";

test("каталог: уникальные id, корректные данные, известные анимации и звуки", () => {
  const ids = new Set();
  for (const raw of CATALOG) {
    assert.ok(!ids.has(raw.id), `повтор id ${raw.id}`);
    ids.add(raw.id);
    const t = normalizeTrap(raw);
    for (const key of Object.keys(raw)) assert.deepEqual(t[key], raw[key], `${raw.id}.${key} изменился при нормализации`);
    assert.ok(t.fx in FX_PRESETS, `${raw.id}: нет анимации ${t.fx}`);
    assert.ok(SOUND_NAMES.includes(t.sound), `${raw.id}: нет звука ${t.sound}`);
    if (raw.damage) assert.ok(isFormula(raw.damage));
  }
  assert.ok(CATALOG.length >= 15);
});

test("нормализация: мусор → значения по умолчанию, атака отменяет спасбросок", () => {
  const t = normalizeTrap({ severity: "nope", size: 99, detectDC: "abc", damage: "rm -rf", attackBonus: "5", saveAbility: "reflex", level: 99 });
  assert.equal(t.severity, "dangerous");
  assert.equal(t.size, 12);
  assert.equal(t.detectDC, 17);
  assert.equal(t.damage, "");
  assert.equal(t.attackBonus, 5);
  assert.equal(t.saveAbility, "");
  assert.equal(t.level, 24, "таблицы GM Core — до 24 уровня");
  assert.equal(trapMode(t), "attack");
  assert.equal(trapMode(normalizeTrap({ saveAbility: "fortitude" })), "save");
  assert.equal(normalizeTrap({ saveAbility: "dex" }).saveAbility, "", "характеристик D&D нет");
  assert.equal(trapMode(normalizeTrap({})), "auto");
  assert.equal(normalizeTrap({ onSave: "half" }).onSave, "basic");
});

test("состояние со значением: у напуган — 1 по умолчанию, у сбит с ног — без значения", () => {
  assert.equal(normalizeTrap({ condition: "frightened" }).conditionValue, 1);
  assert.equal(normalizeTrap({ condition: "frightened", conditionValue: 3 }).conditionValue, 3);
  assert.equal(normalizeTrap({ condition: "prone", conditionValue: 3 }).conditionValue, 0);
  assert.equal(normalizeTrap({ condition: "sickened", conditionValue: 9 }).conditionValue, 4);
});

test("формулы", () => {
  assert.ok(isFormula("2d6"));
  assert.ok(isFormula("1d4 + 2d10 - 1"));
  assert.ok(isFormula("d8"));
  assert.ok(isFormula("10"), "падение — просто число");
  assert.ok(!isFormula("2d6; alert(1)"));
  assert.ok(!isFormula(""));
});

test("пересчёт под уровень партии: Сл, атака и урон — по таблицам GM Core", () => {
  assert.equal(scaleFormula("2d10+7", 2), "4d10+14");
  assert.equal(scaleFormula("1d4+2", 0.5), "1d4+1");
  assert.equal(scaleFormula("d6", 3), "3d6");
  assert.equal(scaleFormula("2d6+0", 1.5), "3d6");
  const jet = normalizeTrap(CATALOG.find((x) => x.id === "fireJet"));
  assert.equal(jet.level, 2);
  const at5 = scaleTrap(jet, 5);
  assert.equal(at5.level, 6);
  assert.equal(at5.detectDC, 18 + (25 - 18), "Скрытность: высокая 18 → 25");
  assert.equal(at5.saveDC, 18 + (24 - 18), "Сл эффекта: высокая 18 → 24");
  assert.equal(at5.damage, "4d10+14", "урон: в 36/18 = 2 раза");
  assert.equal(scaleTrap(jet, 1).damage, jet.damage, "для партии 1 уровня — как в описании");
  const back = unscaleTrap(at5, 5);
  assert.deepEqual([back.level, back.detectDC, back.saveDC, back.damage], [jet.level, jet.detectDC, jet.saveDC, jet.damage]);
  const darts = scaleTrap(CATALOG.find((x) => x.id === "poisonDarts"), 9);
  assert.equal(darts.attackBonus, 25, "атака: +13 на 1 уровне → +25 на 9-м");
  assert.equal(darts.detectRank, 2, "с 9 уровня нужен эксперт");
});

test("падение в яму от уровня не зависит, а Скрытность растёт", () => {
  const pit = normalizeTrap(CATALOG.find((x) => x.id === "pit"));
  const high = scaleTrap(pit, 10);
  assert.equal(high.damage, "10");
  assert.equal(high.escapeDC, pit.escapeDC);
  assert.ok(high.detectDC > pit.detectDC);
  assert.equal(high.detectRank, 0, "ловушка на виду так и остаётся на виду");
});

test("опыт за простую ловушку", () => {
  const trap = normalizeTrap({ level: 3 });
  assert.equal(trapXp(trap, 3), 8);
  assert.equal(trapXp(trap, 1), 16);
  assert.equal(trapXp(trap, 8), 0, "ниже уровня партии − 4 — без опыта");
  assert.equal(trapXp(normalizeTrap({ level: 10 }), 1), 30);
});

test("базовый спасбросок: крит. успех 0, успех ½, провал весь, крит. провал вдвое", () => {
  const trap = normalizeTrap({ saveAbility: "reflex", saveDC: 18, onSave: "basic", condition: "frightened", conditionValue: 1 });
  const at = (total, natural = 10) => resolveTarget(trap, { save: { total, natural } });
  assert.deepEqual([at(28).multiplier, at(18).multiplier, at(17).multiplier, at(8).multiplier], [0, 0.5, 1, 2]);
  assert.equal(at(18).condition, false);
  assert.deepEqual([at(17).condition, at(17).conditionValue], [true, 1]);
  assert.equal(at(8).conditionValue, 2, "крит. провал — значение на 1 больше");
  assert.equal(at(17, 20).multiplier, 0.5, "естественная 20 — на ступень выше");
  assert.equal(at(18, 1).multiplier, 1, "естественная 1 — на ступень ниже");
  assert.equal(resolveTarget(trap, { save: { total: 0, degree: 3 } }).multiplier, 0, "степень от системы важнее итога");
});

test("спасбросок «успех спасает»: успех — ничего, провал — урон, крит. провал — не вдвое", () => {
  const pit = normalizeTrap(CATALOG.find((x) => x.id === "pit"));
  assert.equal(resolveTarget(pit, { save: { total: 15 } }).multiplier, 0);
  assert.equal(resolveTarget(pit, { save: { total: 14 } }).multiplier, 1);
  assert.equal(resolveTarget(pit, { save: { total: 2 } }).multiplier, 1);
  assert.equal(resolveTarget(pit, { save: { total: 2 } }).condition, true);
});

test("атака против КБ: крит — вдвое, естественная 20 и 1 сдвигают исход", () => {
  const trap = normalizeTrap({ attackBonus: 14 });
  const hit = (total, natural, ac = 18) => resolveTarget(trap, { attack: { total, natural, ac } });
  assert.deepEqual([hit(18, 4).hit, hit(18, 4).multiplier], [true, 1]);
  assert.deepEqual([hit(28, 14).crit, hit(28, 14).multiplier], [true, 2]);
  assert.equal(hit(17, 3).hit, false);
  assert.equal(hit(17, 20).hit, true, "провал + естественная 20 — попадание");
  assert.equal(hit(30, 20, 18).multiplier, 2);
  assert.equal(hit(18, 1).hit, false, "успех + естественная 1 — промах");
});

test("обезвредить устройство: степени успеха и несколько успехов", () => {
  assert.equal(resolveDisarm({ total: 18 }, 18).outcome, "success");
  assert.equal(resolveDisarm({ total: 17 }, 18).outcome, "fail");
  assert.equal(resolveDisarm({ total: 8 }, 18).outcome, "triggered", "крит. провал — срабатывает");
  assert.equal(resolveDisarm({ total: 9, natural: 1 }, 18).outcome, "triggered");
  assert.equal(resolveDisarm(18, 18).outcome, "success", "можно передать просто итог");
  const first = resolveDisarm({ total: 19 }, 18, { progress: 0, needed: 2 });
  assert.deepEqual([first.outcome, first.progress], ["progress", 1]);
  assert.equal(resolveDisarm({ total: 19 }, 18, { progress: 1, needed: 2 }).outcome, "success");
  assert.deepEqual([resolveDisarm({ total: 28 }, 18, { needed: 2 }).outcome], ["success"], "крит. успех — за два");
});

test("заметить: Внимательность против Скрытности, и ранга должно хватать", async () => {
  const { notices } = await import("../scripts/core/trap.mjs");
  assert.equal(notices(18, 18), true);
  assert.equal(notices(17, 18), false);
  assert.equal(notices(25, 18, { rank: 0, need: 1 }), false, "без нужного ранга не заметить");
  assert.equal(notices(25, 18, { rank: 2, need: 1 }), true);
});

test("в поведение и обратно: в библиотеке ловушка — для партии 1 уровня", () => {
  const raw = CATALOG.find((x) => x.id === "fireJet");
  const system = toBehaviorData(raw, { party: 5, flavor: "Пламя!" });
  assert.equal(system.damage, "4d10+14");
  assert.equal(system.level, 6);
  assert.equal(system.flavor, "Пламя!");
  assert.equal(system.trapId, "fireJet");
  const back = fromBehaviorData(system, { id: "custom-1", name: "Моя струя", size: 1, party: 5 });
  assert.equal(back.damage, "2d10+7");
  assert.equal(back.level, 2);
  assert.equal(back.name, "Моя струя");
  assert.equal(back.id, "custom-1");
});

test("фильтр библиотеки", () => {
  const entries = CATALOG.map((raw) => ({ trap: normalizeTrap(raw), name: raw.id, text: "" }));
  assert.ok(filterTraps(entries, { kind: "magical" }).every((e) => e.trap.magical));
  assert.ok(filterTraps(entries, { severity: "deadly" }).every((e) => e.trap.severity === "deadly"));
  assert.deepEqual(filterTraps(entries, { damageType: "poison" }).map((e) => e.trap.id).sort(), ["poisonDarts", "poisonGas", "toxicFumes", "yellowMold"]);
  assert.deepEqual(filterTraps(entries, { damageType: "void" }).map((e) => e.trap.id), ["witheringSigil"]);
  // Вид: механические, магические и природные не пересекаются.
  const natural = filterTraps(entries, { kind: "natural" }).map((e) => e.trap.id);
  assert.deepEqual(natural.sort(), ["brownMold", "greenSlime", "quicksand", "razorvine", "toxicFumes", "yellowMold"]);
  assert.ok(filterTraps(entries, { kind: "mechanical" }).every((e) => !e.trap.magical && !e.trap.natural));
  const all = ["mechanical", "magical", "natural"].flatMap((kind) => filterTraps(entries, { kind }));
  assert.equal(all.length, entries.length, "каждая ловушка ровно одного вида");
  assert.deepEqual(filterTraps(entries, { query: "PIT" }).map((e) => e.trap.id), ["pit", "spikedPit"]);
});

test("кто заметил ловушку: каждый персонаж учитывается один раз", async () => {
  const { DETECT_MODES, addNoticer, knowsTrap } = await import("../scripts/core/trap.mjs");
  assert.deepEqual(DETECT_MODES, ["gm", "reveal"], "по умолчанию — сообщить ведущему");
  let list = addNoticer([], { id: "mira", name: "Мира" });
  list = addNoticer(list, { id: "mira", name: "Мира" });
  list = addNoticer(list, { id: "brom", name: "Бром" });
  assert.deepEqual(list, [{ id: "mira", name: "Мира" }, { id: "brom", name: "Бром" }]);
  assert.deepEqual(addNoticer(null, { id: "x", name: 5 }), [{ id: "x", name: "5" }]);
  assert.deepEqual(addNoticer([{ name: "без id" }], {}), [], "мусор отбрасывается");
  assert.equal(knowsTrap({ noticedBy: list }, "mira"), true);
  assert.equal(knowsTrap({ noticedBy: list }, "goblin"), false);
  assert.equal(knowsTrap({ revealed: true }, "goblin"), true, "показанную видят все");
  assert.equal(knowsTrap({ noticedBy: "не список" }, "mira"), false);
});

test("ширина и высота ловушки: старый size — квадрат, туда и обратно через поведение", async () => {
  const { fromBehaviorData, normalizeTrap, toBehaviorData } = await import("../scripts/core/trap.mjs");
  const sq = normalizeTrap({ size: 3 });
  assert.deepEqual([sq.width, sq.height, sq.size], [3, 3, 3]);
  const corridor = normalizeTrap({ width: 1, height: 4 });
  assert.deepEqual([corridor.width, corridor.height, corridor.size], [1, 4, 4]);
  assert.deepEqual([normalizeTrap({ width: 0, height: 99 }).width, normalizeTrap({ width: 0, height: 99 }).height], [1, 12]);
  const sys = toBehaviorData(corridor);
  assert.deepEqual([sys.width, sys.height], [1, 4]);
  const back = fromBehaviorData(sys, { width: 4, height: 1 });
  assert.deepEqual([back.width, back.height], [4, 1], "размер берётся с области на сцене");
  const old = fromBehaviorData({ ...sys, width: undefined, height: undefined, size: 2 });
  assert.deepEqual([old.width, old.height], [2, 2], "старая ловушка без ширины — квадрат");
});

test("срабатывание: вручную, от триггера или от самой области; предустановки каталога", () => {
  assert.equal(activation({ manual: true }, 3), "manual");
  assert.equal(activation({ manual: false }, 2), "activator");
  assert.equal(activation({ manual: false }, 0), "area");
  const clean = normalizeTrap({ activators: 9, manual: "yes" });
  assert.equal(clean.activators, MAX_ACTIVATORS);
  assert.equal(clean.manual, true);
  assert.equal(normalizeTrap({}).manual, false);
  assert.equal(normalizeTrap({}).activators, 0);
  assert.equal(normalizeTrap({ activators: -1 }).activators, 0);
  // Ловушки 0.2.4: «плита» или «растяжка» — это один триггер.
  assert.equal(normalizeTrap({ activator: "wire" }).activators, 1);
  assert.equal(normalizeTrap({ activator: "" }).activators, 0);
  const byId = Object.fromEntries(CATALOG.map((e) => [e.id, normalizeTrap(e)]));
  for (const id of ["arrowVolley", "fallingNet", "collapsingRoof", "rollingBoulder", "poisonGas", "sleepGas"]) assert.equal(byId[id].activators, 1, id);
  assert.equal(byId.pit.activators, 0);
  assert.equal(byId.fireJet.activators, 0);
  // В поведение области и обратно.
  const system = toBehaviorData({ ...byId.arrowVolley, activators: 2, manual: true });
  assert.equal(system.activators, 2);
  assert.equal(system.manual, true);
  assert.equal(fromBehaviorData(system, { id: "x" }).activators, 2);
});

test("ранги: заметить и обезвредить, в поведение и обратно", () => {
  assert.equal(normalizeTrap({}).detectRank, 0);
  assert.equal(normalizeTrap({ detectRank: 9 }).detectRank, 4);
  const system = toBehaviorData({ ...CATALOG[0], detectRank: 2, disarmRank: 3, disarmSuccesses: 2 });
  assert.deepEqual([system.detectRank, system.disarmRank, system.disarmSuccesses], [2, 3, 2]);
  const back = fromBehaviorData(system, { id: "x" });
  assert.deepEqual([back.detectRank, back.disarmRank, back.disarmSuccesses], [2, 3, 2]);
});

test("природная опасность и «каждый ход»: нормализация, в поведение и обратно", async () => {
  const { blankTrap, trapKind } = await import("../scripts/core/trap.mjs");
  assert.equal(normalizeTrap({}).natural, false);
  assert.equal(normalizeTrap({}).everyTurn, false);
  assert.equal(normalizeTrap({ natural: 1, everyTurn: "yes" }).natural, true);
  assert.equal(normalizeTrap({ natural: true, everyTurn: true }).everyTurn, true);
  // Магическая не бывает природной: магия важнее.
  const both = normalizeTrap({ magical: true, natural: true });
  assert.equal(both.natural, false);
  assert.equal(trapKind(both), "magical");
  assert.equal(trapKind(normalizeTrap({ natural: true })), "natural");
  assert.equal(trapKind(normalizeTrap({})), "mechanical");
  const system = toBehaviorData(normalizeTrap({ natural: true, everyTurn: true }));
  assert.equal(system.natural, true);
  assert.equal(system.everyTurn, true);
  const back = fromBehaviorData(system, { id: "x" });
  assert.equal(normalizeTrap(back).natural, true);
  assert.equal(normalizeTrap(back).everyTurn, true);
  // Заготовка для «Новая ловушка».
  const trap = blankTrap();
  assert.equal(trapKind(trap), "mechanical");
  assert.equal(trap.everyTurn, false);
  assert.ok(isFormula(trap.damage));
  assert.equal(trapMode(trap), "save");
});

test("видна сразу, своя картинка, анимация JB2A: нормализация, в поведение и обратно", async () => {
  const { imagePath, jb2aKey } = await import("../scripts/core/trap.mjs");
  const t = normalizeTrap({ visible: 1, image: " worlds/w/mold.webp ", jb2a: "jb2a.fog_cloud.02.green" });
  assert.equal(t.visible, true);
  assert.equal(t.image, "worlds/w/mold.webp");
  assert.equal(t.jb2a, "jb2a.fog_cloud.02.green");
  assert.equal(normalizeTrap({}).visible, false);
  // Картинка: путь или https; данные внутри, скрипты и разметка — нет.
  assert.equal(imagePath("https://example.com/a.png"), "https://example.com/a.png");
  for (const bad of ["data:image/png;base64,AAA", "javascript:alert(1)", "blob:x", 'a"><img', "a\nb", "x".repeat(2001)]) assert.equal(imagePath(bad), "", bad);
  // JB2A: "" — подобрать, "none" — только своя, иначе запись jb2a.…
  assert.equal(jb2aKey("none"), "none");
  assert.equal(jb2aKey("jb2a.explosion.01.orange"), "jb2a.explosion.01.orange");
  for (const bad of ["fire", "jb2a.", "jb2a.a b", "modules/x.webm"]) assert.equal(jb2aKey(bad), "", bad);
  const system = toBehaviorData(t);
  assert.equal(system.visible, true);
  assert.equal(system.image, "worlds/w/mold.webp");
  assert.equal(system.jb2a, "jb2a.fog_cloud.02.green");
  const back = normalizeTrap(fromBehaviorData(system, { id: "x" }));
  assert.equal(back.visible, true);
  assert.equal(back.image, "worlds/w/mold.webp");
  assert.equal(back.jb2a, "jb2a.fog_cloud.02.green");
  // Природные опасности, которые видно и так, встают показанными.
  const byId = Object.fromEntries(CATALOG.map((e) => [e.id, normalizeTrap(e)]));
  assert.equal(byId.brownMold.visible, true);
  assert.equal(byId.quicksand.visible, false);
  assert.equal(byId.pit.visible, false);
});


test("природные опасности и заготовка «Новая ловушка» — по таблицам GM Core для своего уровня", async () => {
  const { effectDC, hazardDamage, stealthDC } = await import("../scripts/core/tables.mjs");
  const { blankTrap } = await import("../scripts/core/trap.mjs");
  const avg = (f) => f.split("+").reduce((n, part) => {
    const m = part.trim().match(/^(\d*)d(\d+)$/);
    return n + (m ? (Number(m[1]) || 1) * (Number(m[2]) + 1) / 2 : Number(part));
  }, 0);
  const hazards = CATALOG.filter((e) => e.natural).map((e) => normalizeTrap(e));
  assert.equal(hazards.length, 6);
  for (const t of hazards) {
    const kind = t.id === "quicksand" ? "extreme" : "high";
    assert.equal(t.detectDC, stealthDC(t.level, kind), `${t.id}: Скрытность`);
    assert.equal(t.disarmDC, stealthDC(t.level), `${t.id}: Сл обезвреживания`);
    if (t.saveAbility) assert.equal(t.saveDC, effectDC(t.level), `${t.id}: Сл спасброска`);
    if (t.escapeDC) assert.equal(t.escapeDC, stealthDC(t.level), `${t.id}: Сл выбраться`);
    // Помеха — уровень партии −1, опасная — тот же или +1 (для партии 1 уровня: 0 и 1–2).
    assert.ok(t.severity === "setback" ? t.level === 0 : t.level >= 1 && t.level <= 2, `${t.id}: уровень и опасность`);
    if (!t.damage) continue;
    const share = avg(t.damage) / hazardDamage(t.level).average;
    if (t.everyTurn) assert.ok(share > 0.45 && share < 0.6, `${t.id}: каждый ход — около половины (${share})`);
    else assert.equal(t.damage, hazardDamage(t.level).formula, `${t.id}: урон простой ловушки`);
  }
  const blank = blankTrap();
  assert.equal(blank.level, 0);
  assert.deepEqual([blank.detectDC, blank.disarmDC, blank.saveDC, blank.damage], [stealthDC(0), stealthDC(0), effectDC(0), hazardDamage(0).formula]);
  assert.equal(blank.saveAbility, "reflex");
});
