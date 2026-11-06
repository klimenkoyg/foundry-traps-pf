/* Переводы: ключи TRAPS.* в lang/ru.json и lang/en.json. */

const PREFIX = "TRAPS.";

const full = (key) => (key.startsWith(PREFIX) ? key : PREFIX + key);

export const has = (key) => game.i18n.has(full(key));

/** Перевод с подстановкой {имя}. Подстановку делаем сами — одинаково на любой версии Foundry. */
export function t(key, data) {
  const text = game.i18n.localize(full(key));
  if (!data) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in data ? String(data[name]) : m));
}

export const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
