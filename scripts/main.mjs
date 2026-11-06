/* Западня PF2e · Trap Library PF2e — ловушки с анимациями для Pathfinder 2e в Foundry VTT v13–v14. */

import { checkApproach, placeTrap, recolorActivators, removeActivators } from "./foundry/actions.mjs";
import { onRenderCard, registerCardSocket } from "./foundry/card.mjs";
import { onRenderDisarm, registerDisarmSocket } from "./foundry/disarm.mjs";
import { addSceneControls, refreshSceneControls } from "./foundry/controls.mjs";
import { onRenderChatMessage, syncChatButtons } from "./foundry/chat.mjs";
import { TrapApp } from "./foundry/apps/trap-app.mjs";
import { registerBehavior } from "./foundry/behavior.mjs";
import { ACTIVATOR_TYPE, BEHAVIOR_TYPE, DRAG_TYPE, MODULE_ID, SETTINGS, tpl } from "./foundry/constants.mjs";
import { isPf2e } from "./foundry/pf2e.mjs";
import { playTrapFx, registerFxSocket } from "./foundry/fx.mjs";
import { clearHud, refreshHud, scheduleHud, syncHudZoom } from "./foundry/gm-hud.mjs";
import { clearMarkers, refreshMarkers, scheduleMarkers } from "./foundry/markers.mjs";
import { t } from "./foundry/i18n.mjs";
import { getEntry, listEntries } from "./foundry/library.mjs";
import { sceneTraps } from "./foundry/scene.mjs";
import { hasTurnedRect, straightenOld, straightenOnCreate, straightShapes, swapSize, trapOf } from "./foundry/straighten.mjs";
import { registerSettings, setting } from "./foundry/settings.mjs";
import { fireTrap } from "./foundry/trigger.mjs";
import { checkForUpdate } from "./foundry/update-check.mjs";

const open = () => TrapApp.open();

Hooks.once("init", () => {
  registerSettings({
    onLibrary: () => TrapApp.refresh(),
    onMapButtons: () => {
      refreshHud();
      refreshMarkers({ animate: false });
      refreshSceneControls();
    },
    onModes: () => TrapApp.refresh(),
  });
  registerBehavior();
  game.keybindings.register(MODULE_ID, "open", {
    name: "TRAPS.Keybinding.open",
    editable: [],
    restricted: true,
    onDown: () => {
      open();
      return true;
    },
  });
  foundry.applications.handlebars.loadTemplates(["trap-app.hbs", "trap-card.hbs", "trap-editor.hbs", "trap-preview.hbs"].map(tpl));
});

Hooks.once("ready", () => {
  registerFxSocket();
  registerCardSocket();
  registerDisarmSocket();
  if (game.user.isGM && !isPf2e()) ui.notifications.warn(t("Notify.notPf2e"));
  // Ловушки, повёрнутые в «Регионах» до 0.2.7, — выпрямить на том же месте (один раз).
  straightenOld().catch((err) => console.warn(`${MODULE_ID} | выпрямить повёрнутые ловушки`, err));
  game.modules.get(MODULE_ID).api = {
    /** Окно ведущего: open("scene") — сразу на вкладке сцены. */
    open: (tab) => TrapApp.open(tab),
    /** Ловушки библиотеки: [{ id, name, trap, custom }]. */
    library: () => listEntries(),
    getTrap: (id) => getEntry(id),
    /** Поставить из макроса: place("pit", { x, y }, { party: 5 }) — под партию 5 уровня. */
    place: (trapId, point, { scene = canvas.scene, party } = {}) => placeTrap(scene, trapId, point, party),
    /** Ловушки сцены: [{ region, behavior }]. */
    traps: (scene = canvas.scene) => sceneTraps(scene),
    /** Сработать вручную (только активный ведущий). */
    fire: (behavior, options) => fireTrap(behavior, options),
    /** Показать анимацию без ловушки: playFx("fire", { x, y }, 200). */
    playFx: (fx, at, area = canvas.grid.size, sound) => playTrapFx(canvas.scene, { fx, sound, at, area }),
    behaviorType: BEHAVIOR_TYPE,
  };
  // Вышла новая версия — ведущему окошко «что нового». Чуть позже: пусть мир сначала загрузится.
  if (game.user.isGM) {
    setTimeout(() => checkForUpdate().catch((err) => console.warn(`${MODULE_ID} | проверка обновлений`, err)), 4000);
  }
});

// Левая панель: своя группа «Ловушки» (на слое регионов).
Hooks.on("getSceneControlButtons", addSceneControls);

// Ловушку перетащили из окна на карту.
Hooks.on("dropCanvasData", (cnv, data) => {
  if (data?.type !== DRAG_TYPE) return;
  if (!game.user.isGM) return false;
  const scene = cnv.scene ?? canvas.scene;
  if (!scene) {
    ui.notifications.warn(t("Notify.noScene"));
    return false;
  }
  // Из окна настройки прилетает готовый черновик, из библиотеки — id.
  const draft = data.draft;
  const source = draft
    ? { id: draft.sourceId, trap: draft, name: draft.name, text: draft.text, flavor: draft.flavor, scaled: true }
    : data.trapId;
  placeTrap(scene, source, { x: data.x, y: data.y }, draft?.party);
  return false;
});

// Пассивная Внимательность: персонаж игрока подошёл к ловушке.
Hooks.on("updateToken", (token, change) => {
  if (!game.user.isActiveGM || !setting(SETTINGS.passiveDetect)) return;
  if (!("x" in change) && !("y" in change)) return;
  checkApproach(token).catch((err) => console.warn(`${MODULE_ID} | тайная проверка Внимательности`, err));
});

// Области модуля: ловушки и их триггеры.
const OUR_TYPES = new Set([BEHAVIOR_TYPE, ACTIVATOR_TYPE]);
const isOurs = (doc) => (doc?.behaviors ? [...doc.behaviors] : [doc]).some((b) => OUR_TYPES.has(b?.type));

// Ловушки и триггеры не поворачиваются на произвольный угол: рисунки, «заметить с» и стены
// считаются по клеткам. Поворот в «Регионах» (ручкой, колесом, в окне области) отбрасываем и
// подсказываем кнопку ↻ — она разворачивает ловушку на 90°.
const straight = (shape) => ({ ...shape, rotation: 0 });
const turned = (shapes) => Array.isArray(shapes) && shapes.some((s) => (Number(s?.rotation) || 0) % 360 !== 0);
Hooks.on("preUpdateRegion", (region, changes, options) => {
  if (!isOurs(region) || !turned(changes.shapes)) return;
  // Повёрнута была и раньше (с прошлых версий, ещё не выпрямлена) — выпрямить на том же месте, а не
  // снимать поворот вокруг угла: иначе ловушка прыгнула бы в сторону.
  if (hasTurnedRect(region._source?.shapes)) {
    const fixed = straightShapes(changes.shapes, region.parent);
    changes.shapes = fixed.shapes.map(straight);
    if (fixed.swapped) options.sslTrapsSwap = true;
    return;
  }
  changes.shapes = changes.shapes.map(straight);
  ui.notifications.info(t("Notify.noRotation", { name: region.name }));
});
// Выпрямили ловушку, повёрнутую на 90°, — ширина и высота в её настройке меняются местами.
Hooks.on("updateRegion", (region, changes, options, userId) => {
  if (!options?.sslTrapsSwap || userId !== game.user.id) return;
  const trap = trapOf(region);
  if (trap) swapSize(trap).catch((err) => console.warn(`${MODULE_ID} | размер ловушки`, err));
});
Hooks.on("preCreateRegion", (region, data) => {
  if (!isOurs(region) || !turned(data.shapes)) return;
  straightenOnCreate(region, data);
  if (turned(region._source?.shapes)) region.updateSource({ shapes: region._source.shapes.map(straight) });
});

// Убрали ловушку — убираем и её триггеры (это делает один клиент: активный ведущий).
Hooks.on("deleteRegion", (region) => {
  if (!game.user.isActiveGM) return;
  removeActivators(region).catch((err) => console.warn(`${MODULE_ID} | триггеры ловушки`, err));
});

// Окно ведущего и метки на карте следят за сценой — только за ловушками и их триггерами.

// Заметили ловушку — это две-три записи подряд (поведение, кто заметил, показать игрокам): метки,
// кнопки и сообщения в чате перерисовываем один раз, когда они пришли.
let sceneTimer = null;
function scheduleScene() {
  clearTimeout(sceneTimer);
  sceneTimer = setTimeout(() => {
    scheduleMarkers();
    scheduleHud();
    syncChatButtons();
  }, 40);
}

for (const hook of ["createRegion", "updateRegion", "deleteRegion", "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior"]) {
  Hooks.on(hook, (doc) => {
    // Удаление перерисовываем всегда: у удалённой области поведений может уже не быть.
    if (!hook.startsWith("delete") && !isOurs(doc)) return;
    // Ловушку поставили или убрали — меняется и счётчик на вкладке; поправили — только вкладка сцены.
    TrapApp.refresh({ sceneOnly: hook.startsWith("update") });
    scheduleScene();
  });
}
Hooks.on("canvasReady", () => {
  if (game.user.isActiveGM) recolorActivators(canvas.scene).catch((err) => console.warn(`${MODULE_ID} | цвет триггеров`, err));
  TrapApp.refresh();
  refreshMarkers({ animate: false });
  refreshHud();
});
Hooks.on("canvasTearDown", () => {
  clearMarkers();
  clearHud();
});
Hooks.on("canvasPan", () => syncHudZoom());
// Ушли в «Регионы» — кнопки у ловушек прячутся, вернулись — снова на месте.
Hooks.on("activateCanvasLayer", () => scheduleHud());

// Кнопка ведущего «показать игрокам / скрыть» в сообщении о замеченной ловушке.
Hooks.on("renderChatMessageHTML", onRenderChatMessage);
// Карточка срабатывания: спасброски игроков и кнопки ведущего «нанести».
Hooks.on("renderChatMessageHTML", onRenderCard);
// Просьба обезвредить: кнопка «Бросить» у игрока, «Бросить за игрока» у ведущего.
Hooks.on("renderChatMessageHTML", onRenderDisarm);
// Свой ключ у игрока зависит от того, кого он выделил и где стоит его токен.
Hooks.on("controlToken", () => !game.user.isGM && scheduleHud());
Hooks.on("updateToken", (token, change) => !game.user.isGM && ("x" in change || "y" in change) && scheduleHud());
