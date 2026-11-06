/* Левая панель Foundry: своя группа «Ловушки».
   Группа не включает никакой слой: в Foundry 13–14 включённый слой сам переключает панель на «свою»
   группу (слой регионов — на «Регионы»), и кнопки «Западни» пропадали бы, едва появившись. Поэтому
   ведущий остаётся на том слое, где был (обычно токены), а группа — это кнопки модуля:
   - череп (выбран сразу) — открыть окно «Западни»;
   - «Библиотека», «Мои ловушки», «Ловушки этой сцены» — окно сразу на нужной вкладке;
   - переключатель кнопок у ловушек на карте.
   Двигать ловушки и триггеры, настраивать и добавлять триггеры — кнопками у ловушек на карте
   (foundry/gm-hud.mjs), без перехода в «Регионы». Фигуру произвольной формы — в «Регионах».
   На чужие панели (токены и другие) модуль кнопок не добавляет; быстро открыть окно — и клавишей. */

import { TrapApp } from "./apps/trap-app.mjs";
import { SETTINGS } from "./constants.mjs";
import { setSetting, setting } from "./settings.mjs";

const ICON = "fa-solid fa-skull-crossbones";
const GROUP = "sslTraps";

/** Инструменты группы; run(active, event) — что сделать по нажатию. */
function groupTools() {
  const open = (tab) => () => TrapApp.open(tab);
  return [
    // Выбранный инструмент группы: нажали на череп — открылось окно. Без события (панель
    // восстанавливается после перезагрузки) окно само не открывается.
    { name: "traps", title: "TRAPS.Controls.open", icon: ICON, run: (active, event) => active && event && TrapApp.open() },
    { name: "library", title: "TRAPS.Controls.library", icon: "fa-solid fa-book-skull", button: true, run: open("library") },
    { name: "mine", title: "TRAPS.Controls.mine", icon: "fa-solid fa-feather-pointed", button: true, run: open("mine") },
    { name: "scene", title: "TRAPS.Controls.scene", icon: "fa-solid fa-map-location-dot", button: true, run: open("scene") },
    {
      name: "mapButtons",
      title: "TRAPS.Controls.mapButtons",
      icon: "fa-solid fa-eye",
      toggle: true,
      active: setting(SETTINGS.mapButtons) !== false,
      run: (active) => setSetting(SETTINGS.mapButtons, Boolean(active)),
    },
  ];
}

/** Хук getSceneControlButtons: v13–v14 — объект групп, раньше — массив. */
export function addSceneControls(controls) {
  if (!game.user.isGM) return;
  const tools = groupTools();

  if (Array.isArray(controls)) {
    controls.push({
      name: GROUP,
      title: "TRAPS.Controls.group",
      icon: ICON,
      visible: true,
      activeTool: "traps",
      tools: tools.map(({ run, ...tool }) => ({ ...tool, visible: true, ...(run && tool.button ? { onClick: run } : {}) })),
    });
    return;
  }

  // Сразу после регионов: рядом с тем, с чем ловушки и работают.
  const after = Number(controls.regions?.order ?? Object.keys(controls).length);
  controls[GROUP] = {
    name: GROUP,
    title: "TRAPS.Controls.group",
    icon: ICON,
    order: after + 0.5,
    visible: true,
    activeTool: "traps",
    tools: Object.fromEntries(
      tools.map(({ run, ...tool }, i) => [
        tool.name,
        { ...tool, order: i, visible: true, ...(run ? { onChange: (event, active) => run(active, event) } : {}) },
      ]),
    ),
  };
}

/** Переключатель группы следует за настройкой, если её поменяли в другом месте. */
export function refreshSceneControls() {
  try {
    ui.controls?.render?.();
  } catch {
    /* панель ещё не готова */
  }
}
