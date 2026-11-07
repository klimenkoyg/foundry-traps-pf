/* Свои ловушки в файле: сохранить, чтобы перенести в другой мир или отдать другому мастеру,
   и разобрать чужой файл перед загрузкой. Без Foundry — покрыто тестами.

   Файл — JSON:
   { format: "ssl_traps", version: 1, system: "pf2e", module: "0.2.0", exported: "2026-…", traps: [ловушка…],
     images: { <id ловушки>: { name: "mold.webp", data: "data:image/webp;base64,…" } } }
   system — для какой системы ловушки: числа у D&D и Pathfinder разные, чужие не подходят.
   images — свои картинки с сервера, вложенные целиком: на чужом сервере такого пути нет. Ссылки
   https остаются ссылками. */

import { customId, normalizeTrap } from "./trap.mjs";

export const FILE_FORMAT = "ssl_traps";
export const FILE_VERSION = 1;

/**
 * Ловушки → содержимое файла. traps — как в «Моих ловушках» (урон для 1–4 уровня);
 * images — вложенные картинки по id ловушки: { name, data } (data — «data:image/…;base64,…»).
 */
export function packTraps(traps, { system, module = "", now = new Date(), images = {} } = {}) {
  const list = traps.map((x) => normalizeTrap(x));
  const ids = new Set(list.map((x) => x.id));
  const pack = { format: FILE_FORMAT, version: FILE_VERSION, system, module, exported: now.toISOString(), traps: list };
  const embedded = Object.fromEntries(Object.entries(images).filter(([id, img]) => ids.has(id) && isEmbedded(img)));
  if (Object.keys(embedded).length) pack.images = embedded;
  return pack;
}

/** Вложенная картинка из файла: имя и данные «data:image/…». */
const isEmbedded = (img) => Boolean(img && typeof img.data === "string" && /^data:image\/[\w.+-]+;base64,/.test(img.data));

/**
 * Разобрать файл. text — его содержимое; own — свои ловушки по id (что уже есть в мире).
 * → { ok: false, reason: "json" | "format" } или
 *   { ok: true, system, items: [{ trap, image, status: "new" | "replace" | "skip", reason? }] }
 * image — вложенная картинка { name, data } или null: её нужно сохранить на сервер и вписать путь.
 * replace — такая ловушка уже есть (тот же id): версия из файла её заменит;
 * skip — не подходит: другая система ("system") или без названия ("empty").
 */
export function readPack(text, { system, own = {}, makeId = customId } = {}) {
  let data;
  try {
    data = typeof text === "string" ? JSON.parse(text) : text;
  } catch {
    return { ok: false, reason: "json" };
  }
  if (!data || data.format !== FILE_FORMAT || !Array.isArray(data.traps)) return { ok: false, reason: "format" };
  const other = Boolean(data.system && system && data.system !== system);
  const images = data.images && typeof data.images === "object" ? data.images : {};
  const seen = new Set();
  const items = data.traps.map((raw) => {
    const trap = normalizeTrap(raw);
    const found = images[trap.id];
    const image = isEmbedded(found) ? { name: safeName(found.name), data: found.data } : null;
    if (other) return { trap, image, status: "skip", reason: "system" };
    if (!trap.name) return { trap, image, status: "skip", reason: "empty" };
    // Свой id сохраняем: загрузили тот же файл ещё раз — ловушка обновится, а не задвоится.
    // Чужой или повторившийся в файле — новый.
    let id = trap.id.startsWith("custom-") && !seen.has(trap.id) ? trap.id : makeId();
    while (seen.has(id)) id = makeId();
    seen.add(id);
    return { trap: { ...trap, id }, image, status: id in own ? "replace" : "new" };
  });
  return { ok: true, system: data.system ?? "", items };
}

/** Имя картинки для сервера: латиница, цифры, дефис; расширение — как было (иначе .webp). */
export function safeName(name) {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const m = base.match(/\.(png|jpe?g|webp|gif|svg|avif)$/i);
  const ext = m ? m[1].toLowerCase() : "webp";
  const stem = (m ? base.slice(0, -m[0].length) : base).normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return `${stem || "image"}.${ext}`;
}

/** Имя файла без символов, которые запрещены в Windows и macOS. */
export const fileName = (name) => `${String(name).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\s+/g, " ").trim() || "traps"}.json`;
