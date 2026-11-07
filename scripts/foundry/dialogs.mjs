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

/**
 * Что загрузить из файла: список ловушек с пометками «новая», «заменит вашу», «не подходит»;
 * подходящие отмечены. items — из previewImport. → отмеченные записи ({ trap, image }) или null.
 */
export async function askImport({ file, items, systemName }) {
  const { DialogV2 } = foundry.applications.api;
  const row = (item, i) => {
    const { trap, status, reason } = item;
    const skip = status === "skip";
    const note = status === "replace" ? t("Import.replaceHint") : reason === "system" ? t("Import.skipSystem", { system: systemName }) : reason === "empty" ? t("Import.skipEmpty") : "";
    const name = trap.name || "—";
    return `<li class="${skip ? "is-skip" : ""}">
      <label class="st-check"><input type="checkbox" name="pick" value="${i}" aria-label="${esc(name)}" ${skip ? "disabled" : "checked"}><span></span></label>
      <span class="st-icon" data-severity="${esc(trap.severity)}"><i class="${esc(trap.icon)}" inert></i></span>
      <span class="st-import-name"><b>${esc(name)}</b>${note ? `<small>${esc(note)}</small>` : ""}</span>
      <span class="st-badge st-import-status is-${status}">${esc(t(`Import.${status}`))}</span>
    </li>`;
  };
  const content = `<div ${THEME_ATTR} class="ssl-traps st-import">
    <p class="st-import-file"><i class="fa-solid fa-file-lines" inert></i> <b>${esc(file)}</b> <span>· ${esc(t("Import.count", { n: items.length }))}</span></p>
    <ul class="st-import-list">${items.map(row).join("")}</ul>
    <p class="st-import-note">${esc(t("Import.note"))}</p>
  </div>`;
  const picked = (button) => [...(button?.form?.querySelectorAll?.('input[name="pick"]:checked') ?? [])].map((el) => items[Number(el.value)]).filter(Boolean);
  let result = null;
  try {
    result = await DialogV2.wait({
      window: { title: t("Import.title"), icon: "fa-solid fa-file-arrow-up" },
      position: { width: 520 },
      content,
      buttons: [
        { action: "add", label: t("Import.add"), icon: "fa-solid fa-file-import", default: true, callback: (event, button) => picked(button) },
        { action: "cancel", label: t("Import.cancel"), icon: "fa-solid fa-xmark", callback: () => null },
      ],
      rejectClose: false,
      modal: true,
    });
  } catch {
    return null;
  }
  return Array.isArray(result) ? result : null;
}

