/* Анимация и звук ловушки у всех, кто смотрит эту сцену.
   Ведущий решает, что показать: JB2A через Sequencer (если установлен и в настройках не «только свои»)
   или встроенный эффект — тогда рассылает его по сокету модуля, и каждый клиент рисует сам. */

import { createEffect } from "../core/fx/painters.mjs";
import { FX_PRESETS, flightPath, jb2aGroups, pickJb2a, soundPath } from "../core/fx/presets.mjs";
import { MODULE_ID, SETTINGS, SOCKET } from "./constants.mjs";
import { sceneSprite, seesArea } from "./layers.mjs";
import { setting } from "./settings.mjs";

/** Сторона холста эффекта не больше этого числа пикселей: дальше растягиваем спрайт. */
const MAX_SIDE = 720;

const sequencerReady = () => Boolean(game.modules.get("sequencer")?.active && globalThis.Sequencer?.Database && globalThis.Sequence);

const exists = (key) => {
  try {
    return Boolean(Sequencer.Database.entryExists(key));
  } catch {
    return false;
  }
};

/** Анимация полёта (стрела, болт, луч): Sequencer подбирает файл по длине, ей нужны «откуда» и «куда». */
const isFlight = (key) => {
  try {
    const entry = Sequencer.Database.getEntry(key);
    return Boolean((Array.isArray(entry) ? entry[0] : entry)?.rangeFind);
  } catch {
    return false;
  }
};

/** Все записи JB2A из базы Sequencer (полные пути). */
function jb2aEntries() {
  const db = Sequencer.Database;
  let list = Array.isArray(db.flattenedEntries) ? db.flattenedEntries : null;
  if (!list && typeof db.getPathsUnder === "function") {
    list = [];
    const walk = (path, depth) => {
      let kids = [];
      try {
        kids = db.getPathsUnder(path) ?? [];
      } catch {
        kids = [];
      }
      if (!kids.length || depth > 6) return list.push(path);
      for (const k of kids) walk(`${path}.${k}`, depth + 1);
    };
    walk("jb2a", 0);
  }
  return (list ?? []).filter((x) => typeof x === "string" && x.startsWith("jb2a."));
}

/**
 * Анимации JB2A, которые реально установлены, — для выбора в окне ловушки: [{ label, options: [{ value, label }] }]
 * по разделам (см. jb2aGroups). null — Sequencer или JB2A не стоят (или анимации выключены в настройках).
 */
export function jb2aChoices() {
  if (setting(SETTINGS.fxMode) !== "auto" || !sequencerReady()) return null;
  const groups = jb2aGroups(jb2aEntries());
  return groups.length ? groups : null;
}

export function registerFxSocket() {
  game.socket.on(SOCKET, (payload) => {
    if (payload?.action === "fx") playLocal(payload.fx);
  });
}

/**
 * Показать ловушку на сцене (вызывает активный ведущий).
 * at: { x, y } центр, area — сторона области в px.
 */
export async function playTrapFx(scene, { fx, jb2a = "", sound, at, area, width = area, height = area, elevation = 0 }) {
  const mode = setting(SETTINGS.fxMode);
  const src = soundPath(sound || FX_PRESETS[fx]?.sound, MODULE_ID);
  if (src) playSound(scene, src);
  if (mode === "off") return 0;

  const cell = scene.grid.size;
  if (await playJb2a(scene, { fx, jb2a, at, width, height, cell })) return 900;
  const payload = { sceneId: scene.id, fx, x: at.x, y: at.y, area, width, height, cell, elevation, seed: Math.floor(Math.random() * 1e9) };
  game.socket.emit(SOCKET, { action: "fx", fx: payload });
  const duration = playLocal(payload);
  return duration;
}

/**
 * JB2A через Sequencer, если он стоит и в настройках не «только свои». jb2a — выбор ведущего:
 * "" — подобрать к встроенной анимации, "none" — только встроенная, иначе своя запись (нет такой
 * в базе — например, ловушку загрузили в мир без JB2A Patreon — подбираем, как обычно).
 * locally — только у себя (предпросмотр). → true, если сыграл.
 */
async function playJb2a(scene, { fx, jb2a = "", at, width, height, cell, locally = false }) {
  if (jb2a === "none" || setting(SETTINGS.fxMode) !== "auto" || !sequencerReady() || canvas.scene?.id !== scene.id) return false;
  const key = jb2a && exists(jb2a) ? jb2a : pickJb2a(fx, exists);
  if (!key) return false;
  try {
    const w = Math.max(width, cell);
    const h = Math.max(height, cell);
    const effect = new Sequence().effect().file(key);
    if (isFlight(key)) {
      // Стрела или луч летит через всю область вдоль длинной стороны.
      const { from, to } = flightPath(at, w, h, cell);
      effect.atLocation(from).stretchTo(to);
    } else {
      // Вытянутая область — эффект растягивается по её форме.
      effect.atLocation(at).size({ width: w * 1.25, height: h * 1.25 });
    }
    if (locally) effect.locally();
    await effect.play();
    return true;
  } catch (err) {
    console.warn(`${MODULE_ID} | Sequencer не сыграл ${key}, показываю свой эффект`, err);
    return false;
  }
}

/** Посмотреть анимацию и звук только у себя (окно настройки): ровно то, что сыграет ловушка. */
export async function previewFx(scene, { fx, jb2a = "", sound, at, area, width = area, height = area }) {
  const src = soundPath(sound || FX_PRESETS[fx]?.sound, MODULE_ID);
  const volume = Number(setting(SETTINGS.volume) ?? 0.7);
  if (src && volume > 0) foundry.audio.AudioHelper.play({ src, volume, autoplay: true, loop: false }, false);
  if (setting(SETTINGS.fxMode) === "off") return 0;
  const cell = scene.grid.size;
  if (await playJb2a(scene, { fx, jb2a, at, width, height, cell, locally: true })) return 900;
  return playLocal({ sceneId: scene.id, fx, x: at.x, y: at.y, area: Math.max(area, cell), width, height, cell, seed: Math.floor(Math.random() * 1e9) });
}

function playSound(scene, src) {
  const volume = Number(setting(SETTINGS.volume) ?? 0.7);
  if (volume <= 0) return;
  // Себе звук играет сам вызов; остальным — тем, кто смотрит эту сцену.
  const recipients = game.users.filter((u) => u.active && !u.isSelf && u.viewedScene === scene.id).map((u) => u.id);
  foundry.audio.AudioHelper.play({ src, volume, autoplay: true, loop: false }, recipients.length ? { recipients } : false);
}

/**
 * Нарисовать встроенный эффект на своём клиенте. → длительность в мс (0 — не показан).
 * Эффект лежит на уровне карты над токенами; игрок видит его, только если видит это место:
 * вспышку за стеной или в неразведанной темноте не показываем (звук всё равно слышен).
 */
export function playLocal(payload) {
  if (!payload || !canvas?.ready || canvas.scene?.id !== payload.sceneId) return 0;
  if (!canvas.interface && !canvas.primary) return 0;
  if (!seesArea(payload.x, payload.y, Math.max(payload.area, payload.cell) / 2)) return 0;

  const effect = createEffect(payload.fx, { area: payload.area, cell: payload.cell, seed: payload.seed });
  const k = Math.min(1, MAX_SIDE / effect.side);
  const el = document.createElement("canvas");
  el.width = Math.ceil(effect.side * k);
  el.height = el.width;
  const ctx = el.getContext("2d");

  const texture = PIXI.Texture.from(el);
  const sprite = sceneSprite(texture, { overTokens: true, elevation: payload.elevation ?? 0 });
  sprite.position.set(payload.x - effect.side / 2, payload.y - effect.side / 2);
  sprite.scale.set(1 / k);

  // Вытянутая область (коридор): эффекты рисуются квадратом по большей стороне — обрезаем их по
  // форме области с запасом в полклетки, чтобы не лезли в стены коридора.
  const w = Number(payload.width) || payload.area;
  const h = Number(payload.height) || payload.area;
  const m = payload.cell * 0.5;
  const clip = Math.abs(w - h) >= payload.cell * 0.5 ? { x: effect.side / 2 - w / 2 - m, y: effect.side / 2 - h / 2 - m, w: w + m * 2, h: h + m * 2 } : null;
  const ticker = canvas.app.ticker;
  const start = performance.now();
  const step = () => {
    if (sprite.destroyed) return ticker.remove(step);
    const t = (performance.now() - start) / effect.duration;
    if (t >= 1) {
      ticker.remove(step);
      sprite.destroy({ texture: true, baseTexture: true });
      return;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.width, el.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (clip) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
      effect.frame(ctx, t);
      ctx.restore();
    } else effect.frame(ctx, t);
    (texture.source ?? texture.baseTexture)?.update?.();
  };
  ticker.add(step);
  return effect.duration;
}
