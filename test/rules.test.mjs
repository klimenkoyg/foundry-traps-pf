import assert from "node:assert/strict";
import { test } from "node:test";
import { degreeFor, degreeOf, hasRank, validDegree } from "../scripts/core/degrees.mjs";
import { clampLevel, effectDC, hazardAttack, hazardDamage, hazardXp, highRank, moderateRank, stealthDC } from "../scripts/core/tables.mjs";

test("степени успеха: ±10 от Сл, естественные 20 и 1 сдвигают на ступень", () => {
  assert.equal(degreeOf(28, 18), 3);
  assert.equal(degreeOf(27, 18), 2);
  assert.equal(degreeOf(18, 18), 2);
  assert.equal(degreeOf(17, 18), 1);
  assert.equal(degreeOf(9, 18), 1);
  assert.equal(degreeOf(8, 18), 0);
  assert.equal(degreeOf(17, 18, 20), 2, "провал + 20 → успех");
  assert.equal(degreeOf(28, 18, 20), 3, "выше крит. успеха не бывает");
  assert.equal(degreeOf(18, 18, 1), 1, "успех + 1 → провал");
  assert.equal(degreeOf(5, 18, 1), 0);
});

test("степень от системы важнее посчитанной; мусор — не степень", () => {
  assert.equal(degreeFor({ total: 5, degree: 3 }, 18), 3, "например, «Увёртливость»");
  assert.equal(degreeFor({ total: 18, degree: null }, 18), 2);
  assert.equal(validDegree(4), null);
  assert.equal(validDegree("2"), 2);
  assert.equal(validDegree(""), null);
  assert.equal(validDegree(null), null);
});

test("ранги", () => {
  assert.equal(hasRank(1, 0), true);
  assert.equal(hasRank(0, 1), false);
  assert.equal(hasRank(undefined, 0), true);
});

test("таблицы GM Core: контрольные точки", () => {
  assert.deepEqual([stealthDC(0), stealthDC(0, "extreme"), stealthDC(0, "low")], [16, 19, 13]);
  assert.equal(stealthDC(24), 55);
  assert.equal(hazardAttack(2), 14, "как «Метатель копий»: +14 на 2 уровне");
  assert.deepEqual(hazardDamage(4), { formula: "4d8+10", average: 28 });
  assert.deepEqual([effectDC(5), effectDC(5, "extreme")], [22, 26]);
  assert.equal(clampLevel(30), 24);
  assert.equal(clampLevel(-5), -1);
  assert.deepEqual([moderateRank(0), moderateRank(1), moderateRank(9), moderateRank(19)], [0, 1, 2, 3]);
  assert.deepEqual([highRank(2), highRank(2, true), highRank(5), highRank(20)], [1, 2, 2, 4]);
});

test("опыт за простую ловушку: 1/5 существа того же уровня", () => {
  assert.deepEqual([-4, -3, -2, -1, 0, 1, 2, 3, 4].map((d) => hazardXp(5 + d, 5)), [2, 3, 4, 6, 8, 12, 16, 24, 30]);
  assert.equal(hazardXp(0, 5), 0);
});
