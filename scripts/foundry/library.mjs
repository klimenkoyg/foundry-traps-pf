/* Библиотека: встроенные ловушки (каталог + перевод) и свои (настройка мира). */

import { CATALOG } from "../core/catalog.mjs";
import { customId, normalizeTrap } from "../core/trap.mjs";
import { SETTINGS } from "./constants.mjs";
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
