import { MODULE_ID, SETTINGS } from "./constants.mjs";

export const setting = (key) => game.settings.get(MODULE_ID, key);

export const setSetting = (key, value) => game.settings.set(MODULE_ID, key, value);

export function registerSettings({ onLibrary, onMapButtons, onModes }) {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, data);
  const name = (key) => ({ name: `TRAPS.Settings.${key}.name`, hint: `TRAPS.Settings.${key}.hint` });

  // Свои ловушки библиотеки: { id: TrapDef }.
  reg(SETTINGS.customTraps, { scope: "world", config: false, type: Object, default: {}, onChange: onLibrary });
  // Уровень партии в окне библиотеки — у каждого ведущего свой.
  reg(SETTINGS.partyLevel, { scope: "client", config: false, type: Number, default: 1 });

  reg(SETTINGS.fxMode, {
    ...name("fxMode"),
    scope: "world",
    config: true,
    type: String,
    choices: {
      auto: "TRAPS.Settings.fxMode.auto",
      builtin: "TRAPS.Settings.fxMode.builtin",
      off: "TRAPS.Settings.fxMode.off",
    },
    default: "auto",
  });
  reg(SETTINGS.volume, {
    ...name("volume"),
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.7,
  });
  reg(SETTINGS.triggerBy, {
    ...name("triggerBy"),
    scope: "world",
    config: true,
    type: String,
    choices: { players: "TRAPS.Settings.triggerBy.players", all: "TRAPS.Settings.triggerBy.all" },
    default: "players",
  });
  // Розыгрыш срабатывания: кто бросает спасброски и когда наносить урон (переключается и на вкладке сцены).
  reg(SETTINGS.saveRolls, {
    ...name("saveRolls"),
    scope: "world",
    config: true,
    type: String,
    choices: { players: "TRAPS.Settings.saveRolls.players", module: "TRAPS.Settings.saveRolls.module" },
    default: "players",
    onChange: onModes,
  });
  reg(SETTINGS.damageMode, {
    ...name("damageMode"),
    scope: "world",
    config: true,
    type: String,
    choices: { button: "TRAPS.Settings.damageMode.button", auto: "TRAPS.Settings.damageMode.auto" },
    default: "button",
    onChange: onModes,
  });
  // Обезвреживание: кто бросает, когда ведущий жмёт ключ, и есть ли свой ключ у игроков
  // (переключается и на вкладке сцены).
  reg(SETTINGS.disarmRolls, {
    ...name("disarmRolls"),
    scope: "world",
    config: true,
    type: String,
    choices: { players: "TRAPS.Settings.disarmRolls.players", gm: "TRAPS.Settings.disarmRolls.gm" },
    default: "players",
    onChange: onModes,
  });
  reg(SETTINGS.playerDisarm, {
    ...name("playerDisarm"),
    scope: "world",
    config: true,
    type: String,
    choices: { on: "TRAPS.Settings.playerDisarm.on", off: "TRAPS.Settings.playerDisarm.off" },
    default: "on",
    onChange: () => {
      onModes?.();
      onMapButtons?.();
    },
  });
  reg(SETTINGS.chatMode, {
    ...name("chatMode"),
    scope: "world",
    config: true,
    type: String,
    choices: { public: "TRAPS.Settings.chatMode.public", gm: "TRAPS.Settings.chatMode.gm" },
    default: "public",
  });
  reg(SETTINGS.passiveDetect, { ...name("passiveDetect"), scope: "world", config: true, type: Boolean, default: true });
  // Кто получает тайную проверку Внимательности, подойдя к ловушке: по правилам — кто «ищет»
  // в исследовании (ловушку без ранга замечает любой), или все.
  reg(SETTINGS.searchMode, {
    ...name("searchMode"),
    scope: "world",
    config: true,
    type: String,
    choices: { activity: "TRAPS.Settings.searchMode.activity", always: "TRAPS.Settings.searchMode.always" },
    default: "activity",
  });
  reg(SETTINGS.detectSight, { ...name("detectSight"), scope: "world", config: true, type: Boolean, default: true });
  // Персонаж заметил ловушку: сразу показать её игрокам или сообщить ведущему, а показать вручную.
  reg(SETTINGS.detectMode, {
    ...name("detectMode"),
    scope: "world",
    config: true,
    type: String,
    choices: { gm: "TRAPS.Settings.detectMode.gm", reveal: "TRAPS.Settings.detectMode.reveal" },
    default: "gm",
    onChange: onModes,
  });
  // Кнопки «показать / скрыть» у ловушек на карте — у каждого ведущего свои.
  reg(SETTINGS.mapButtons, { ...name("mapButtons"), scope: "client", config: true, type: Boolean, default: true, onChange: onMapButtons });
  // «Вышла новая версия»: у каждого ведущего своё — проверять ли и что уже показали (foundry/update-check.mjs).
  reg(SETTINGS.updateCheck, { ...name("updateCheck"), scope: "client", config: true, type: Boolean, default: true });
  reg(SETTINGS.updateState, { scope: "client", config: false, type: Object, default: {} });
}
