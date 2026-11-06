/* Триггеры ловушки глазами ведущего: добавить с подсказкой (окно и кнопка на карте). */

import { MAX_ACTIVATORS } from "../core/trap.mjs";
import { addActivators } from "./actions.mjs";
import { t } from "./i18n.mjs";
import { activatorsOf } from "./scene.mjs";

/** Ещё один триггер ловушке; три уже стоят — сказать, что больше нельзя. → область или null. */
export async function addTriggerNotified(region, behavior) {
  const name = behavior?.name || region.name;
  if (activatorsOf(region).length >= MAX_ACTIVATORS) {
    ui.notifications.warn(t("Notify.activatorMax", { name, n: MAX_ACTIVATORS }));
    return null;
  }
  const [made] = await addActivators(region, 1);
  if (!made) return null;
  const count = activatorsOf(region).length;
  if (behavior && behavior.system.activators !== count) await behavior.update({ "system.activators": count });
  ui.notifications.info(t(behavior?.system?.manual ? "Notify.activatorAddedManual" : "Notify.activatorAdded", { name }));
  return made;
}
