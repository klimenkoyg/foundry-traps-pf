/* Библиотека: встроенные ловушки (каталог + перевод) и свои (настройка мира). Свои можно сохранить
   в файл и загрузить из файла (core/share.mjs) — чтобы перенести в другой мир или поделиться. */

import { CATALOG } from "../core/catalog.mjs";
import { fileName, packTraps, readPack, safeName } from "../core/share.mjs";
import { customId, normalizeTrap } from "../core/trap.mjs";
import { MODULE_ID, SETTINGS } from "./constants.mjs";
import { has, t } from "./i18n.mjs";
import { setSetting, setting } from "./settings.mjs";

/**
 * Запись библиотеки: { id, trap, name, text, flavor, custom }
 * name/text/flavor — уже на языке клиента.
 */
function builtin(raw) {
  const trap = normalizeTrap(raw);
  const key = `Trap.${trap.id}`;
  return {
    id: trap.id,
    trap,
    name: has(`${key}.name`) ? t(`${key}.name`) : trap.id,
    text: has(`${key}.text`) ? t(`${key}.text`) : "",
    flavor: has(`${key}.flavor`) ? t(`${key}.flavor`) : "",
    custom: false,
  };
}

function custom(raw) {
  const trap = normalizeTrap(raw);
  return { id: trap.id, trap, name: trap.name || trap.id, text: trap.text, flavor: trap.flavor, custom: true };
}

const customs = () => Object.values(setting(SETTINGS.customTraps) ?? {}).filter((x) => x?.id);

export function listEntries() {
  const own = customs()
    .map(custom)
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  return [...CATALOG.map(builtin), ...own];
}

export function getEntry(id) {
  const raw = CATALOG.find((x) => x.id === id);
  if (raw) return builtin(raw);
  const own = (setting(SETTINGS.customTraps) ?? {})[id];
  return own ? custom(own) : null;
}

/** Сохранить свою ловушку (новую — без id). → запись */
export async function saveCustom(trap) {
  const all = foundry.utils.deepClone(setting(SETTINGS.customTraps) ?? {});
  const id = trap.id && trap.id.startsWith("custom-") ? trap.id : customId();
  all[id] = normalizeTrap({ ...trap, id });
  await setSetting(SETTINGS.customTraps, all);
  return custom(all[id]);
}

export async function deleteCustom(id) {
  const all = foundry.utils.deepClone(setting(SETTINGS.customTraps) ?? {});
  if (!(id in all)) return;
  delete all[id];
  await setSetting(SETTINGS.customTraps, all);
}

/* ---------------------------------------------------------------- файлы */

/** Для какой системы ловушки этого модуля: числа у систем разные, чужие файлы не подходят. */
export const SYSTEM = "pf2e";
const SYSTEM_NAMES = { dnd5e: "D&D 5e", pf2e: "Pathfinder 2e" };
export const systemName = (id) => SYSTEM_NAMES[id] ?? id;

/** Отдать файл браузеру — он скачается, как в Foundry «Экспорт данных». */
function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Картинки больше этого в файл не вкладываем — остаются путём. */
const MAX_IMAGE_MB = 8;

/** Картинка с этого сервера → { name, data } для файла; ссылку https и недоступное — не вкладываем. */
async function embedImage(trap) {
  const src = trap.image;
  if (!src || /^https?:/i.test(src)) return null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    if (blob.size > MAX_IMAGE_MB * 1024 * 1024) {
      ui.notifications.warn(t("Notify.imageTooBig", { name: trap.name, mb: MAX_IMAGE_MB }));
      return null;
    }
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { name: safeName(src), data };
  } catch (err) {
    console.warn(`${MODULE_ID} | картинку «${src}» не удалось вложить в файл`, err);
    return null;
  }
}

/**
 * Свои ловушки → файл .json. ids — какие (по умолчанию все). Картинки с сервера вкладываются в файл
 * целиком: у другого мастера такого пути нет. → { count, file } или null (нечего).
 */
export async function exportCustom(ids = null) {
  const all = customs().filter((x) => !ids || ids.includes(x.id));
  if (!all.length) return null;
  const name = all.length === 1 && ids ? t("Share.fileOne", { name: all[0].name || all[0].id }) : t("Share.fileAll");
  const images = {};
  for (const trap of all) {
    const img = await embedImage(trap);
    if (img) images[trap.id] = img;
  }
  const pack = packTraps(all, { system: SYSTEM, module: game.modules.get(MODULE_ID)?.version ?? "", images });
  const file = fileName(name);
  download(JSON.stringify(pack, null, 2), file);
  return { count: all.length, file };
}

/** Выбрать файл на компьютере. → File или null (окно закрыли). */
export function pickFile() {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json" });
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

/** Разобрать содержимое файла: что добавится, что заменится, что не подходит (core/share.mjs). */
export const previewImport = (text) => readPack(text, { system: SYSTEM, own: setting(SETTINGS.customTraps) ?? {} });

/** Папка мира для картинок из файлов: worlds/<мир>/ssl-traps. */
const imageDir = () => `worlds/${game.world.id}/ssl-traps`;

/** Вложенную картинку — на сервер, в папку мира. → путь или null (нет прав, сервер отказал). */
async function uploadImage(trap, image) {
  const FP = foundry.applications.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  if (!FP?.upload) return null;
  try {
    const dir = imageDir();
    try {
      await FP.createDirectory("data", dir, {});
    } catch {
      /* папка уже есть */
    }
    const blob = await (await fetch(image.data)).blob();
    // Имя с id ловушки: у разных ловушек одинаковые «mold.webp» не затрут друг друга.
    const file = new File([blob], `${trap.id}-${image.name}`, { type: blob.type });
    const res = await FP.upload("data", dir, file, {}, { notify: false });
    return res?.path ?? null;
  } catch (err) {
    console.warn(`${MODULE_ID} | картинку ловушки «${trap.name}» не удалось сохранить`, err);
    return null;
  }
}

/**
 * Добавить ловушки из файла в «Мои ловушки» одной записью настройки. items — из previewImport
 * ({ trap, image }); вложенные картинки сохраняются на сервер. → сколько добавлено.
 */
export async function importCustom(items) {
  if (!items.length) return 0;
  const all = foundry.utils.deepClone(setting(SETTINGS.customTraps) ?? {});
  for (const { trap, image } of items) {
    let path = trap.image;
    if (image) {
      path = await uploadImage(trap, image);
      if (!path) ui.notifications.warn(t("Notify.imageUploadFailed", { name: trap.name }));
    }
    all[trap.id] = normalizeTrap({ ...trap, image: path ?? "" });
  }
  await setSetting(SETTINGS.customTraps, all);
  return items.length;
}

