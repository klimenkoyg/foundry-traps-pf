/* Куда класть свои картинки на холсте Foundry.
   На уровень карты (первичная группа холста): тогда их, как пол и плитки, закрывают туман войны
   и темнота — в неразведанной части не видно, в разведанной, но не видимой сейчас, — затемнено.
   Токены рисуются поверх метки, вспышка — поверх токенов.
   Если такой возможности нет (другая версия Foundry), — в слой интерфейса поверх всего. */

import { MODULE_ID } from "./constants.mjs";

const meshClass = () => globalThis.foundry?.canvas?.primary?.PrimarySpriteMesh ?? globalThis.PrimarySpriteMesh ?? null;

/** Высота, на которой лежит область (нижняя граница; у бесконечной — уровень пола). */
export function regionElevation(region) {
  const bottom = Number(region?.elevation?.bottom);
  return Number.isFinite(bottom) ? bottom : 0;
}

/**
 * Спрайт на уровне карты. overTokens — над токенами (вспышка), иначе под ними (метка).
 * Возвращает спрайт; убирать его — sprite.destroy().
 */
export function sceneSprite(texture, { overTokens = false, elevation = 0 } = {}) {
  const Mesh = meshClass();
  const primary = canvas.primary;
  if (Mesh && typeof primary?.addChild === "function") {
    try {
      const mesh = new Mesh(texture);
      const layers = primary.constructor?.SORT_LAYERS ?? {};
      const tokens = Number(layers.TOKENS ?? 700);
      mesh.elevation = elevation;
      mesh.sortLayer = overTokens ? tokens + 1 : tokens - 1;
      mesh.sort = 0;
      mesh.eventMode = "none";
      primary.addChild(mesh);
      return mesh;
    } catch (err) {
      console.warn(`${MODULE_ID} | не удалось положить картинку на уровень карты, рисую поверх`, err);
    }
  }
  const sprite = new PIXI.Sprite(texture);
  sprite.zIndex = overTokens ? 10000 : 150;
  sprite.eventMode = "none";
  canvas.interface.addChild(sprite);
  return sprite;
}

/**
 * Видит ли этот пользователь сейчас хоть часть области (x, y — центр, half — половина стороны).
 * Ведущий и сцена без зрения токенов — видят всё.
 */
export function seesArea(x, y, half) {
  if (game.user.isGM) return true;
  const vis = canvas.visibility;
  if (typeof vis?.testVisibility !== "function" || vis.tokenVision === false) return true;
  const d = half * 0.8;
  const points = [[x, y], [x - d, y - d], [x + d, y - d], [x - d, y + d], [x + d, y + d]];
  try {
    return points.some(([px, py]) => vis.testVisibility({ x: px, y: py }, { tolerance: 2 }));
  } catch {
    return true;
  }
}
