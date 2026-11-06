export const MODULE_ID = "ssl_traps_pf2e";

/** Тип поведения области: «<id модуля>.trap» (documentTypes в module.json). */
export const BEHAVIOR_TYPE = `${MODULE_ID}.trap`;

/** Тип поведения области-триггера: «<id модуля>.activator» — наступили на неё, сработала ловушка. */
export const ACTIVATOR_TYPE = `${MODULE_ID}.activator`;

/** Что тащим из окна на карту. */
export const DRAG_TYPE = `${MODULE_ID}.Trap`;

export const SOCKET = `module.${MODULE_ID}`;

/** Оформление окна и карточек чата: styles/theme-heroic.css. */
export const THEME = "heroic";
export const THEME_ATTR = `data-st-theme="${THEME}"`;

export const SETTINGS = {
  customTraps: "customTraps",
  partyLevel: "partyLevel",
  fxMode: "fxMode",
  volume: "volume",
  saveRolls: "saveRolls",
  damageMode: "damageMode",
  chatMode: "chatMode",
  triggerBy: "triggerBy",
  passiveDetect: "passiveDetect",
  searchMode: "searchMode",
  detectSight: "detectSight",
  detectMode: "detectMode",
  mapButtons: "mapButtons",
  updateCheck: "updateCheck",
  disarmRolls: "disarmRolls",
  playerDisarm: "playerDisarm",
  updateState: "updateState",
};

/** Цвет области-триггера: бирюзовый — ведущий сразу отличает триггер от самой ловушки. */
export const ACTIVATOR_COLOR = "#2fb8c8";

/** Цвет области по опасности. */
export const SEVERITY_COLOR = { setback: "#d9a441", dangerous: "#e0702e", deadly: "#c0392b" };

export const tpl = (path) => `modules/${MODULE_ID}/templates/${path}`;

/** Форма для идей (Google Форма, та же, что в «Таверне»): кнопка «Предложить идею» у ведущего внизу окна. Пусто — кнопки нет. */
export const IDEAS_URL = "https://forms.gle/FuMwJ2JzSn3DHCTc7";
