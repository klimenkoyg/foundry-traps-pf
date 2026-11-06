/* Повёрнутые ловушки с прошлых версий. С 0.2.7 поворот ловушек в «Регионах» не применяется
   (main.mjs), а ловушки и триггеры, повёрнутые раньше, модуль один раз выпрямляет на том же месте:
   - на 90° и 270° — те же клетки, ширина и высота меняются местами (и в настройке ловушки);
   - на другой угол — ровно по тому же центру, по клеткам.
   Иначе первое же перетаскивание кнопкой на карте сняло бы поворот вокруг угла области, и ловушка
   прыгнула бы в сторону. Выпрямляет активный ведущий при входе в мир; ловушки со сцен, которые
   потом импортируют из старых миров, выпрямляются, когда их создают. */

import { uprightRect } from "../core/geometry.mjs";
import { ACTIVATOR_TYPE, BEHAVIOR_TYPE } from "./constants.mjs";
import { t } from "./i18n.mjs";

const OURS = new Set([BEHAVIOR_TYPE, ACTIVATOR_TYPE]);

/** Повёрнут ли прямоугольник области. */
const turnedRect = (s) => s?.type === "rectangle" && (Number(s.rotation) || 0) % 360 !== 0;

/** Размер клетки сцены; 0 — без сетки (тогда не выравниваем). */
const gridOf = (scene) => {
  const grid = scene?.grid;
  const gridless = grid?.isGridless || (CONST.GRID_TYPES && grid?.type === CONST.GRID_TYPES.GRIDLESS);
  return gridless ? 0 : Number(grid?.size) || 100;
};

/** Чистые данные фигуры: из документа, из источника или как есть. */
const plain = (s) => (s?.toObject ? s.toObject() : { ...s });

/**
 * Фигуры области без поворота → { shapes, swapped } или null, если выпрямлять нечего.
 * swapped — ширина и высота поменялись местами (только у области из одного прямоугольника: у неё
 * размер в настройке ловушки совпадает с областью).
 */
export function straightShapes(shapes, scene) {
  const list = Array.isArray(shapes) ? shapes.map(plain) : [];
  if (!list.some(turnedRect)) return null;
  const grid = gridOf(scene);
  let swapped = false;
  const out = list.map((s) => {
    if (!turnedRect(s)) return s;
    const { swapped: turned, ...rect } = uprightRect(s, grid);
    if (list.length === 1) swapped = turned;
    const anchor = "anchorX" in s || "anchorY" in s ? { anchorX: 0, anchorY: 0 } : {};
    return { ...s, ...rect, ...anchor, rotation: 0 };
  });
  return { shapes: out, swapped };
}

/** Повёрнут ли хоть один прямоугольник среди фигур. */
export const hasTurnedRect = (shapes) => Array.isArray(shapes) && shapes.some((s) => turnedRect(plain(s)));

const isOurs = (region) => region?.behaviors?.some?.((b) => OURS.has(b.type)) ?? false;
export const trapOf = (region) => region?.behaviors?.find?.((b) => b.type === BEHAVIOR_TYPE) ?? null;

/** Размер ловушки в её настройке: ширина ↔ высота. */
export const swapSize = (behavior) => behavior.update({ "system.width": behavior.system.height, "system.height": behavior.system.width });

/** Ведущий вошёл в мир: выпрямить повёрнутые ловушки и триггеры на всех сценах. → сколько областей. */
export async function straightenOld() {
  if (!game.user?.isActiveGM) return 0;
  let count = 0;
  for (const scene of game.scenes ?? []) {
    const updates = [];
    const swaps = [];
    for (const region of scene.regions ?? []) {
      if (!isOurs(region)) continue;
      const fixed = straightShapes(region._source?.shapes ?? region.shapes, scene);
      if (!fixed) continue;
      updates.push({ _id: region.id, shapes: fixed.shapes });
      const trap = trapOf(region);
      if (fixed.swapped && trap) swaps.push(trap);
    }
    if (!updates.length) continue;
    await scene.updateEmbeddedDocuments("Region", updates);
    for (const behavior of swaps) await swapSize(behavior);
    count += updates.length;
  }
  if (count) ui.notifications.info(t("Notify.straightened", { n: count }));
  return count;
}

/**
 * Хук preCreateRegion: ловушку или триггер создают уже повёрнутыми (сцену импортировали из старого
 * мира, вставили скопированную область) — выпрямить на том же месте, размер в настройке — следом.
 */
export function straightenOnCreate(region, data) {
  if (!isOurs(region)) return;
  const fixed = straightShapes(data?.shapes ?? region._source?.shapes, region.parent);
  if (!fixed) return;
  region.updateSource({ shapes: fixed.shapes });
  const trap = trapOf(region);
  if (fixed.swapped && trap) trap.updateSource({ "system.width": trap.system.height, "system.height": trap.system.width });
}

