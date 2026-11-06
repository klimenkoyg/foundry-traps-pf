import assert from "node:assert/strict";
import { test } from "node:test";
import { activatorLook, activatorSpots, distanceToRect, moveShape, quarterTurn, snapDelta, turnPivot, uprightRect, placementRect, rectCenter, shapesBounds, tokenCenter } from "../scripts/core/geometry.mjs";

test("ловушка встаёт под курсор по клеткам", () => {
  assert.deepEqual(placementRect({ x: 250, y: 130 }, 1, 100), { x: 200, y: 100, width: 100, height: 100 });
  assert.deepEqual(placementRect({ x: 250, y: 130 }, 3, 100), { x: 100, y: 0, width: 300, height: 300 });
  assert.deepEqual(placementRect({ x: 250, y: 130 }, 2, 100), { x: 200, y: 100, width: 200, height: 200 });
});

test("рамка фигур области", () => {
  assert.deepEqual(shapesBounds([{ type: "rectangle", x: 100, y: 50, width: 200, height: 100 }]), { x: 100, y: 50, width: 200, height: 100 });
  assert.deepEqual(shapesBounds([{ type: "circle", x: 100, y: 100, radius: 50 }, { type: "polygon", points: [0, 0, 300, 20] }]), { x: 0, y: 0, width: 300, height: 150 });
  assert.equal(shapesBounds([]), null);
  assert.equal(shapesBounds([{ type: "rectangle", x: 0, y: 0, width: 10, height: 10, hole: true }]), null);
});

test("расстояния и центры", () => {
  const r = { x: 100, y: 100, width: 100, height: 100 };
  assert.equal(distanceToRect({ x: 150, y: 150 }, r), 0);
  assert.equal(distanceToRect({ x: 50, y: 150 }, r), 50);
  assert.equal(distanceToRect({ x: 230, y: 240 }, r), 50);
  assert.deepEqual(rectCenter(r), { x: 150, y: 150 });
  assert.deepEqual(tokenCenter({ x: 200, y: 300, width: 2, height: 1 }, 100), { x: 300, y: 350 });
});

test("точки взгляда: центр первым, затем углы и середины сторон внутри области", async () => {
  const { sightPoints } = await import("../scripts/core/geometry.mjs");
  const r = { x: 100, y: 200, width: 100, height: 100 };
  const pts = sightPoints(r, 5);
  assert.equal(pts.length, 9);
  assert.deepEqual(pts[0], { x: 150, y: 250 });
  for (const p of pts) {
    assert.ok(p.x >= 105 && p.x <= 195 && p.y >= 205 && p.y <= 295, JSON.stringify(p));
  }
  // Узкая область: отступ не выводит точки за край.
  for (const p of sightPoints({ x: 0, y: 0, width: 4, height: 4 }, 10)) assert.ok(p.x >= 0 && p.x <= 4 && p.y >= 0 && p.y <= 4);
});

test("расстояние до ловушки по клеткам, как линейка: 10 фт — через одну пустую клетку, и по диагонали тоже", async () => {
  const { chebyshevCells, nearestCellCenters, rangeCells } = await import("../scripts/core/geometry.mjs");
  const G = 100;
  const cells = (tok, trap) => {
    const [p, q] = nearestCellCenters(tok, trap, G);
    return chebyshevCells(p, q, G);
  };
  const tok = (c, r, n = 1) => ({ x: c * G, y: r * G, width: n * G, height: n * G });
  const trap = tok(5, 5);
  assert.equal(cells(tok(4, 5), trap), 1, "соседняя клетка — 5 фт");
  assert.equal(cells(tok(3, 5), trap), 2, "через одну пустую — 10 фт");
  assert.equal(cells(tok(2, 5), trap), 3, "через две — 15 фт");
  assert.equal(cells(tok(3, 3), trap), 2, "по диагонали через одну — 10 фт");
  assert.equal(cells(tok(5, 5), trap), 0, "стоит в ловушке");
  assert.equal(cells(tok(2, 4, 2), trap), 2, "большой токен 2×2 меряется от своего края");
  assert.equal(cells(tok(4, 1), { x: 3 * G, y: 4 * G, width: 3 * G, height: 3 * G }), 3, "до большой области — от её края");
  assert.equal(rangeCells(10), 2);
  assert.equal(rangeCells(5), 1);
  assert.equal(rangeCells("x"), 0);
});

test("прямоугольная ловушка под курсором: ширина и высота отдельно", async () => {
  const { placementRect, rectCells } = await import("../scripts/core/geometry.mjs");
  const G = 100;
  assert.deepEqual(placementRect({ x: 450, y: 450 }, 1, G, 3), { x: 400, y: 300, width: 100, height: 300 });
  assert.deepEqual(placementRect({ x: 450, y: 450 }, 3, G, 1), { x: 300, y: 400, width: 300, height: 100 });
  assert.deepEqual(placementRect({ x: 450, y: 450 }, 2, G), { x: 400, y: 400, width: 200, height: 200 }, "без высоты — квадрат");
  assert.deepEqual(rectCells({ x: 0, y: 0, width: 100, height: 400 }, G), { width: 1, height: 4 });
  assert.deepEqual(rectCells({ x: 0, y: 0, width: 10, height: 10 }, G), { width: 1, height: 1 }, "не меньше клетки");
});

test("триггеры: куда встают по умолчанию — в области, потом вокруг неё", () => {
  const cell = 100;
  const gas = { x: 300, y: 200, width: 300, height: 300 };
  // Один — посередине области.
  assert.deepEqual(activatorSpots(gas, 1, cell), [{ x: 400, y: 300, width: 100, height: 100 }]);
  // Несколько — по краям вдоль области и посередине.
  assert.deepEqual(
    activatorSpots(gas, 3, cell).map((r) => [r.x, r.y]),
    [
      [300, 200],
      [500, 400],
      [400, 300],
    ],
  );
  // Занятые клетки пропускаются.
  assert.deepEqual(activatorSpots(gas, 1, cell, [{ x: 400, y: 300 }]).map((r) => [r.x, r.y]), [[300, 200]]);
  // Ловушка в одну клетку: первый — в ней, остальные — рядом.
  assert.deepEqual(
    activatorSpots({ x: 600, y: 100, width: 100, height: 100 }, 3, cell).map((r) => [r.x, r.y]),
    [
      [600, 100],
      [500, 100],
      [700, 100],
    ],
  );
  assert.equal(activatorSpots(gas, 0, cell).length, 0);
});

test("сдвиг области: по клеткам, фигуры любого вида", () => {
  assert.equal(snapDelta(140, 100), 100);
  assert.equal(snapDelta(-160, 100), -200);
  assert.equal(snapDelta(40, 100), 0);
  assert.deepEqual(moveShape({ type: "rectangle", x: 100, y: 200, width: 100, height: 100 }, 100, -100), { type: "rectangle", x: 200, y: 100, width: 100, height: 100 });
  assert.deepEqual(moveShape({ type: "polygon", points: [0, 0, 100, 0, 100, 100] }, 50, 10).points, [50, 10, 150, 10, 150, 110]);
  assert.deepEqual(moveShape({ type: "circle", x: 0, y: 0, radius: 50 }, 100, 100), { type: "circle", x: 100, y: 100, radius: 50 });
});

test("вид триггера по форме: полоса — растяжка, квадрат — плита", () => {
  assert.equal(activatorLook({ width: 100, height: 100 }), "plate");
  assert.equal(activatorLook({ width: 100, height: 300 }), "wire");
  assert.equal(activatorLook({ width: 300, height: 100 }), "wire");
});

test("поворот на 90°: клетки в клетки, четыре поворота — на место, триггер едет вместе", () => {
  const cell = 100;
  const hall = { x: 300, y: 100, width: 100, height: 400 }; // коридор 1×4
  const pivot = turnPivot(hall, cell);
  assert.deepEqual(pivot, { x: 350, y: 250 });
  const once = quarterTurn(hall, pivot);
  assert.deepEqual(once, { x: 100, y: 200, width: 400, height: 100 });
  for (const v of [once.x, once.y, once.width, once.height]) assert.equal(v % cell, 0);
  let r = hall;
  for (let i = 0; i < 4; i++) r = quarterTurn(r, pivot);
  assert.deepEqual(r, hall);
  // Триггер в начале коридора (верхняя клетка) после поворота — в его начале справа.
  const plate = { x: 300, y: 100, width: 100, height: 100 };
  assert.deepEqual(quarterTurn(plate, pivot), { x: 400, y: 200, width: 100, height: 100 });
  // Квадраты 3×3 и 2×2 — на месте; 2×4 — вокруг своей середины, клетки в клетки.
  const room = { x: 0, y: 0, width: 300, height: 300 };
  assert.deepEqual(quarterTurn(room, turnPivot(room, cell)), room);
  const small = { x: 300, y: 200, width: 200, height: 200 };
  assert.deepEqual(quarterTurn(small, turnPivot(small, cell)), small);
  const wide = { x: 0, y: 0, width: 200, height: 400 };
  assert.deepEqual(quarterTurn(wide, turnPivot(wide, cell)), { x: -100, y: 100, width: 400, height: 200 });
});

test("повёрнутая ловушка выпрямляется на том же месте", () => {
  const cell = 100;
  // Foundry 14: коридор 1×4 с привязкой в углу, повёрнут на 90° вокруг угла (400, 100):
  // занимает x 0…400, y 100…200 — те же клетки, но без поворота.
  const v14 = { x: 400, y: 100, width: 100, height: 400, anchorX: 0, anchorY: 0, rotation: 90 };
  assert.deepEqual(uprightRect(v14, cell), { x: 0, y: 100, width: 400, height: 100, swapped: true });
  // 180° — те же размеры, прямоугольник по другую сторону от угла.
  assert.deepEqual(uprightRect({ ...v14, rotation: 180 }, cell), { x: 300, y: -300, width: 100, height: 400, swapped: false });
  // Без поворота — ничего не меняется.
  assert.deepEqual(uprightRect({ ...v14, rotation: 0 }, cell), { x: 400, y: 100, width: 100, height: 400, swapped: false });
  // Foundry 13: вокруг центра. 2×4 повёрнут на 90° — 4×2 с тем же центром (300, 300).
  const v13 = { x: 200, y: 100, width: 200, height: 400, rotation: 270 };
  assert.deepEqual(uprightRect(v13, cell), { x: 100, y: 200, width: 400, height: 200, swapped: true });
  // Наискось (30°) — по тому же центру, без обмена сторон, по клеткам.
  const tilted = uprightRect({ x: 200, y: 100, width: 200, height: 400, rotation: 30 }, cell);
  assert.deepEqual(tilted, { x: 200, y: 100, width: 200, height: 400, swapped: false });
  // 60° — ближе к 90°: стороны меняются.
  assert.equal(uprightRect({ x: 200, y: 100, width: 200, height: 400, rotation: 60 }, cell).swapped, true);
});


test("диагонали PF2e без линейки: 5 / 10 / 5 фт", async () => {
  const { alternatingCells } = await import("../scripts/core/geometry.mjs");
  const G = 100;
  const at = (c, r) => ({ x: c * G + 50, y: r * G + 50 });
  assert.equal(alternatingCells(at(0, 0), at(1, 1), G), 1);
  assert.equal(alternatingCells(at(0, 0), at(2, 2), G), 3, "две диагонали — 15 фт");
  assert.equal(alternatingCells(at(0, 0), at(4, 4), G), 6);
  assert.equal(alternatingCells(at(0, 0), at(3, 1), G), 3);
  assert.equal(alternatingCells(at(0, 0), at(0, 2), G), 2);
});
