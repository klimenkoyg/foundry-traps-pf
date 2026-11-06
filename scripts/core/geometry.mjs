/* Геометрия сцены без Foundry: куда встаёт ловушка, её рамка, расстояния. */

/**
 * Прямоугольник ловушки под курсором: width × height клеток (height не задана — квадрат).
 * Курсор — в центральной клетке (для чётного размера — левее и выше центра).
 * → { x, y, width, height } в пикселях сцены.
 */
export function placementRect(point, width, gridSize, height = width) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const col = Math.floor(point.x / gridSize) - Math.floor((w - 1) / 2);
  const row = Math.floor(point.y / gridSize) - Math.floor((h - 1) / 2);
  return { x: col * gridSize, y: row * gridSize, width: w * gridSize, height: h * gridSize };
}

/** Сколько клеток по ширине и высоте занимает рамка области. */
export function rectCells(rect, gridSize) {
  const g = gridSize || 100;
  return { width: Math.max(1, Math.round(rect.width / g)), height: Math.max(1, Math.round(rect.height / g)) };
}

/** Рамка по фигурам области (rectangle, ellipse, circle, polygon) без учёта поворота. */
export function shapesBounds(shapes = []) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x, y) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const s of shapes) {
    if (!s || s.hole) continue;
    switch (s.type) {
      case "rectangle":
        add(s.x, s.y);
        add(s.x + s.width, s.y + s.height);
        break;
      case "ellipse":
        add(s.x - s.radiusX, s.y - s.radiusY);
        add(s.x + s.radiusX, s.y + s.radiusY);
        break;
      case "circle":
        add(s.x - s.radius, s.y - s.radius);
        add(s.x + s.radius, s.y + s.radius);
        break;
      case "polygon":
        for (let i = 0; i + 1 < (s.points?.length ?? 0); i += 2) add(s.points[i], s.points[i + 1]);
        break;
      default:
        break;
    }
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export const rectCenter = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

export const rectContains = (r, p) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** Расстояние от точки до прямоугольника (0 — внутри). */
export function distanceToRect(p, r) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

/** Центр токена: x, y — левый верхний угол, width/height — в клетках. */
export function tokenCenter(token, gridSize) {
  return { x: token.x + ((token.width ?? 1) * gridSize) / 2, y: token.y + ((token.height ?? 1) * gridSize) / 2 };
}

/** Расстояние в футах (единицах сцены) по пикселям. */
export const pixelsToUnits = (px, gridSize, gridDistance) => (px / gridSize) * gridDistance;

/**
 * Точки области, на которые персонаж может посмотреть: центр, углы и середины сторон, чуть внутрь
 * (inset px), чтобы луч не упирался в стену ровно по краю клетки. Видна хоть одна — видна область.
 */
export function sightPoints(r, inset = 2) {
  const k = Math.max(0, Math.min(inset, r.width / 2, r.height / 2));
  const xs = [r.x + k, r.x + r.width / 2, r.x + r.width - k];
  const ys = [r.y + k, r.y + r.height / 2, r.y + r.height - k];
  const points = [{ x: xs[1], y: ys[1] }];
  for (const y of ys) for (const x of xs) if (!(x === xs[1] && y === ys[1])) points.push({ x, y });
  return points;
}

/**
 * Центры ближайших клеток двух прямоугольников на сетке (токен и область ловушки): от них Foundry
 * меряет расстояние линейкой. По оси, где прямоугольники перекрываются, точки совпадают.
 */
export function nearestCellCenters(a, b, cell) {
  const axis = (a0, a1, b0, b1) => {
    if (a1 <= b0) return [a1 - cell / 2, b0 + cell / 2];
    if (b1 <= a0) return [a0 + cell / 2, b1 - cell / 2];
    const lo = Math.max(a0, b0);
    return [lo + cell / 2, lo + cell / 2];
  };
  const [ax, bx] = axis(a.x, a.x + a.width, b.x, b.x + b.width);
  const [ay, by] = axis(a.y, a.y + a.height, b.y, b.y + b.height);
  return [{ x: ax, y: ay }, { x: bx, y: by }];
}

/** Клеток между точками, если каждая диагональ — 5 фт. */
export const chebyshevCells = (p, q, cell) => Math.round(Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) / cell);

/**
 * Клеток между точками по правилу Pathfinder 2e (если линейки Foundry нет): диагонали чередуются —
 * первая 5 фт, вторая 10 фт, и так далее. Две диагонали — 3 клетки, четыре — 6.
 */
export function alternatingCells(p, q, cell) {
  const dx = Math.round(Math.abs(p.x - q.x) / cell);
  const dy = Math.round(Math.abs(p.y - q.y) / cell);
  return Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
}

/** Дальность ловушки в футах → в клетках (клетка — 5 фт, на метрической сетке тоже). */
export const rangeCells = (feet) => Math.max(0, Number(feet) || 0) / 5;

/**
 * Куда поставить count новых триггеров ловушки (клетки 1×1 в пикселях). Сначала — клетки самой
 * области: один — посередине, несколько — по краям вдоль области и посередине; потом, если области
 * мало (ловушка в одну клетку), — клетки вокруг неё. taken — где триггеры уже стоят. Ведущий потом
 * перетаскивает их, куда нужно.
 */
export function activatorSpots(rect, count, gridSize, taken = []) {
  const cell = gridSize || 100;
  const w = Math.max(1, Math.round(rect.width / cell));
  const h = Math.max(1, Math.round(rect.height / cell));
  const at = ([c, r]) => ({ x: rect.x + c * cell, y: rect.y + r * cell, width: cell, height: cell });
  const mid = [Math.floor((w - 1) / 2), Math.floor((h - 1) / 2)];
  const ends = [
    [0, 0],
    [w - 1, h - 1],
  ];
  const inside = count >= 2 ? [...ends, mid] : [mid, ...ends];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) inside.push([c, r]);
  const ring = [
    [-1, mid[1]],
    [w, mid[1]],
    [mid[0], -1],
    [mid[0], h],
    [-1, -1],
    [w, -1],
    [-1, h],
    [w, h],
  ];
  const used = new Set(taken.map((t) => `${Math.round(t.x)},${Math.round(t.y)}`));
  const out = [];
  for (const spot of [...inside, ...ring].map(at)) {
    if (out.length >= count) break;
    const key = `${Math.round(spot.x)},${Math.round(spot.y)}`;
    if (used.has(key)) continue;
    used.add(key);
    out.push(spot);
  }
  return out;
}

/** Фигура области, сдвинутая на (dx, dy): прямоугольник, круг, эллипс — по x, y; многоугольник — по точкам. */
export function moveShape(shape, dx, dy) {
  const s = { ...shape };
  if (Array.isArray(s.points)) s.points = s.points.map((v, i) => v + (i % 2 ? dy : dx));
  if (Number.isFinite(s.x)) s.x += dx;
  if (Number.isFinite(s.y)) s.y += dy;
  return s;
}

/** Сдвиг перетаскиванием → целое число клеток (в пикселях). */
export const snapDelta = (d, gridSize) => Math.round(d / (gridSize || 100)) * (gridSize || 100);

/** Растяжка, если триггер вытянут (полоса), иначе плита. */
export const activatorLook = (rect) => (Math.abs(rect.width - rect.height) > 1 ? "wire" : "plate");

/**
 * Поворот прямоугольника на 90° по часовой стрелке вокруг точки (на экране y растёт вниз).
 * Вокруг середины клетки клетки переходят в клетки: четыре поворота возвращают всё на место.
 */
export function quarterTurn(rect, pivot) {
  const turn = (x, y) => ({ x: pivot.x - (y - pivot.y), y: pivot.y + (x - pivot.x) });
  const a = turn(rect.x, rect.y);
  const b = turn(rect.x + rect.width, rect.y + rect.height);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: rect.height, height: rect.width };
}

/**
 * Точка, вокруг которой ловушка поворачивается на 90°. Ширина и высота одной чётности (квадрат,
 * 2×4, 3×5) — середина области: она остаётся на месте. Разной чётности (коридор 1×4) — середина
 * средней клетки: только так клетки переходят в клетки.
 */
export function turnPivot(rect, gridSize) {
  const cell = gridSize || 100;
  const w = Math.max(1, Math.round(rect.width / cell));
  const h = Math.max(1, Math.round(rect.height / cell));
  if (w % 2 === h % 2) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  return { x: rect.x + (Math.floor((w - 1) / 2) + 0.5) * cell, y: rect.y + (Math.floor((h - 1) / 2) + 0.5) * cell };
}

/**
 * Повёрнутый прямоугольник области → такой же на том же месте, но без поворота: повёрнутые
 * ловушки остались с версий, где поворот в «Регионах» ещё не запрещался. На 90° и 270° ширина и
 * высота меняются местами, и клетки выходят те же; на другой угол — ставим ровно по тому же
 * центру, стороной туда, куда она ближе. С сеткой — по клеткам (gridSize 0 — без сетки).
 * Поворот: Foundry 14 — вокруг точки (x, y), сам прямоугольник от неё со сдвигом anchorX/anchorY;
 * Foundry 13 (без anchorX) — вокруг центра. → { x, y, width, height, swapped }.
 */
export function uprightRect(shape, gridSize = 0) {
  const w = Number(shape.width) || 0;
  const h = Number(shape.height) || 0;
  const a = ((((Number(shape.rotation) || 0) % 360) + 360) % 360) * (Math.PI / 180);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  let cx = shape.x + w / 2;
  let cy = shape.y + h / 2;
  if ("anchorX" in shape || "anchorY" in shape) {
    const dx = (0.5 - (Number(shape.anchorX) || 0)) * w;
    const dy = (0.5 - (Number(shape.anchorY) || 0)) * h;
    cx = shape.x + cos * dx - sin * dy;
    cy = shape.y + sin * dx + cos * dy;
  }
  const swapped = Math.abs(sin) > Math.abs(cos);
  const width = swapped ? h : w;
  const height = swapped ? w : h;
  const snap = (v) => (gridSize > 0 ? Math.round(v / gridSize) * gridSize : Math.round(v * 1000) / 1000);
  return { x: snap(cx - width / 2), y: snap(cy - height / 2), width, height, swapped };
}

