/* Небольшие окна модуля поверх DialogV2. */

import { THEME_ATTR } from "./constants.mjs";
import { esc, t } from "./i18n.mjs";

/**
 * Спросить, как назвать ловушку. value — что подставить в поле.
 * overwrite — название своей ловушки, которую можно обновить вместо того, чтобы сохранять новую.
 * → { name, mode: "new" | "over" } или null (передумали).
 */
export async function askName({ value = "", overwrite = null, title = t("Name.title") } = {}) {
  const { DialogV2 } = foundry.applications.api;
  const content = `<div ${THEME_ATTR} class="ssl-traps st-name-dialog">
    <label><span>${esc(t("Name.label"))}</span><input type="text" name="name" value="${esc(value)}" maxlength="80" autocomplete="off" autofocus></label>
    <p>${esc(overwrite ? t("Name.overHint", { name: overwrite }) : t("Name.hint"))}</p>
  </div>`;
  const read = (button) => String(button?.form?.elements?.name?.value ?? "").trim();
  const buttons = [];
  if (overwrite) {
    buttons.push({ action: "over", label: t("Name.overwrite"), icon: "fa-solid fa-floppy-disk", callback: (event, button) => ({ name: read(button), mode: "over" }) });
  }
  buttons.push({
    action: "new",
    label: t(overwrite ? "Name.asNew" : "Name.save"),
    icon: "fa-solid fa-book-medical",
    default: true,
    callback: (event, button) => ({ name: read(button), mode: "new" }),
  });
  buttons.push({ action: "cancel", label: t("Name.cancel"), icon: "fa-solid fa-xmark", callback: () => null });
  let result = null;
  try {
    result = await DialogV2.wait({ window: { title, icon: "fa-solid fa-signature" }, content, buttons, rejectClose: false, modal: true });
  } catch {
    return null; // окно закрыли
  }
  if (!result || typeof result !== "object") return null;
  return { ...result, name: result.name || value || t("Name.untitled") };
}
