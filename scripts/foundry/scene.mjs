/* Ловушки на сцене: найти, рамка области, видимость, сообщения в чат. */

import { alternatingCells, distanceToRect, nearestCellCenters, shapesBounds, sightPoints, tokenCenter } from "../core/geometry.mjs";
import { ACTIVATOR_TYPE, BEHAVIOR_TYPE, MODULE_ID, SETTINGS } from "./constants.mjs";
import { setting } from "./settings.mjs";

/** Все ловушки сцены: [{ region, behavior }]. */
export function sceneTraps(scene) {
  if (!scene) return [];
  const list = [];
  for (const region of scene.regions ?? []) {
    for (const behavior of region.behaviors ?? []) {
      if (behavior.type === BEHAVIOR_TYPE) list.push({ region, behavior });
    }
  }
  return list;
}

/** Поведение «Триггер ловушки» области или null. */
export const activatorBehavior = (region) => [...(region?.behaviors ?? [])].find((b) => b.type === ACTIVATOR_TYPE) ?? null;

/** Триггеры ловушки: области сцены, чьё поведение «Триггер ловушки» ссылается на неё. */
export function activatorsOf(trapRegion) {
  const scene = trapRegion?.parent;
  if (!scene || !trapRegion.id) return [];
  return [...(scene.regions ?? [])].filter((r) => r.id !== trapRegion.id && activatorBehavior(r)?.system?.trap === trapRegion.id);
}

/** Ловушка, которую запускает область-триггер: { region, behavior } или null (ловушку убрали). */
export function trapOfActivator(region) {
  const id = activatorBehavior(region)?.system?.trap;
  const trapRegion = id ? region.parent?.regions?.get?.(id) : null;
  const behavior = trapRegion ? [...trapRegion.behaviors].find((b) => b.type === BEHAVIOR_TYPE) : null;
  return behavior ? { region: trapRegion, behavior } : null;
}

/** Рамка области { x, y, width, height } в пикселях сцены. */
export function regionBounds(region) {
  const b = region.bounds;
  if (b && Number.isFinite(b.width) && b.width > 0) return { x: b.x, y: b.y, width: b.width, height: b.height };
  return shapesBounds(region.shapes?.map?.((s) => s.toObject?.() ?? s) ?? []) ?? { x: 0, y: 0, width: 0, height: 0 };
}

/** Токены внутри области. */
export function regionTokens(region) {
  if (region.tokens) return [...region.tokens];
  return region.parent.tokens.filter((t) => t.regions?.has?.(region));
}

/** Прямоугольник токена в пикселях сцены. */
export function tokenRect(token, grid) {
  return { x: token.x, y: token.y, width: (token.width ?? 1) * grid, height: (token.height ?? 1) * grid };
}

/**
 * Сколько клеток от токена до области — как меряет линейка Foundry: от ближайшей клетки токена до
 * ближайшей клетки области, с правилом диагоналей сцены. Соседняя клетка — 1, через одну пустую — 2,
 * токен внутри области — 0. Без линейки — по правилу PF2e: диагонали 5 / 10 / 5 фт.
 */
export function cellsBetween(token, region) {
  const scene = token.parent;
  const grid = scene?.grid ?? canvas.grid;
  const size = grid?.size || 100;
  const a = tokenRect(token, size);
  const b = regionBounds(region);
  if (grid?.isGridless || (CONST.GRID_TYPES && grid?.type === CONST.GRID_TYPES.GRIDLESS)) {
    // Без сетки — от края до края; касание считаем соседней клеткой, как на сетке.
    const gap = Math.max(0, Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)), Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)));
    const inside = distanceToRect({ x: a.x + a.width / 2, y: a.y + a.height / 2 }, b) === 0;
    return inside ? 0 : gap / size + 1;
  }
  const [p, q] = nearestCellCenters(a, b, size);
  if (p.x === q.x && p.y === q.y) return 0;
  try {
    const path = grid?.measurePath?.([p, q]);
    if (path && Number.isFinite(path.distance) && grid.distance > 0) return path.distance / grid.distance;
  } catch {
    /* старая линейка — посчитаем сами */
  }
  return alternatingCells(p, q, size);
}

/**
 * Видит ли токен хоть одну точку области. Взгляд перекрывают стены, закрывающие обзор, и закрытые
 * двери — та же проверка, по которой Foundry строит поле зрения. Нет проверки — считаем, что видит.
 */
export function hasLineOfSight(token, region) {
  const backend = CONFIG.Canvas?.polygonBackends?.sight;
  if (typeof backend?.testCollision !== "function") return true;
  const grid = token.parent?.grid?.size ?? canvas.grid?.size ?? 100;
  const origin = tokenCenter(token, grid);
  try {
    return sightPoints(regionBounds(region), Math.max(2, grid * 0.1)).some(
      (p) => !backend.testCollision(origin, p, { type: "sight", mode: "any" }),
    );
  } catch (err) {
    console.warn(`${MODULE_ID} | проверка видимости`, err);
    return true;
  }
}

const VIS = () => CONST.REGION_VISIBILITY;

/** Игроки видят метку ловушки (foundry/markers.mjs). Старые ловушки показывали саму область. */
export const isRevealed = (region) => Boolean(region.getFlag?.(MODULE_ID, "revealed")) || region.visibility === VIS().ALWAYS;

/**
 * Показать ловушку игрокам меткой или спрятать. Сама область всегда видна только ведущему:
 * цветная заливка выдаёт игрокам точный размер и цвет опасности, а метка говорит ровно «здесь ловушка».
 */
export function setVisible(region, visible) {
  const change = {};
  if (Boolean(region.getFlag?.(MODULE_ID, "revealed")) !== Boolean(visible)) change[`flags.${MODULE_ID}.revealed`] = Boolean(visible);
  if (region.visibility === VIS().ALWAYS) change.visibility = VIS().GAMEMASTER;
  if (!Object.keys(change).length) return null;
  return region.update(change);
}

export const gmIds = () => game.users.filter((u) => u.isGM).map((u) => u.id);

/** Владельцы-игроки актёра. */
export const ownerIds = (actor) =>
  game.users.filter((u) => !u.isGM && actor?.testUserPermission?.(u, "OWNER")).map((u) => u.id);

/**
 * Сообщение модуля в чат.
 * audience: "auto" — по настройке «карточка срабатывания»; "gm" — ведущим; массив id — им и ведущим.
 */
export function postMessage({ content, alias, rolls = [], audience = "auto", flags = {} }) {
  const data = { content, speaker: { alias }, flags: { [MODULE_ID]: { card: true, ...flags } } };
  if (rolls.length) data.rolls = rolls;
  if (audience === "gm" || (audience === "auto" && setting(SETTINGS.chatMode) === "gm")) data.whisper = gmIds();
  else if (Array.isArray(audience)) data.whisper = [...new Set([...gmIds(), ...audience])];
  return ChatMessage.create(data);
}
