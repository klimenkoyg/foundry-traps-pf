/* Окно ведущего: библиотека ловушек (тащить на карту) и ловушки открытой сцены. */

import { rectCells } from "../../core/geometry.mjs";
import { DAMAGE_MODES, SAVE_ROLLS } from "../../core/resolve.mjs";
import { DAMAGE_TYPES, DETECT_MODES, DISARM_ROLLS, KINDS, PARTY_LEVELS, PLAYER_DISARM, SEVERITIES, filterTraps, scaleTrap, trapXp } from "../../core/trap.mjs";
import {
  addActivators,
  noticedBy,
  saveToLibrary,
  searchWith,
  sourceCustom,
  setArmed,
  setAllRevealed,
  setRevealed,
  triggerNow,
} from "../actions.mjs";
import { addTriggerNotified } from "../activators.mjs";
import { requestDisarm } from "../disarm.mjs";
import { DRAG_TYPE, IDEAS_URL, MODULE_ID, SETTINGS, THEME, tpl } from "../constants.mjs";
import { damageLabel } from "../pf2e.mjs";
import { t } from "../i18n.mjs";
import { deleteCustom, exportCustom, getEntry, importCustom, listEntries, pickFile, previewImport, saveCustom, systemName } from "../library.mjs";
import { activatorsOf, isRevealed, regionBounds, sceneTraps } from "../scene.mjs";
import { setSetting, setting } from "../settings.mjs";
import { askImport, askName } from "../dialogs.mjs";
import { activationLabel, affectsLabel, stats } from "../summary.mjs";
import { TrapEditor } from "./trap-editor.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const APP_ID = "ssl-traps-library";

const controlledTokens = () => (canvas.tokens?.controlled ?? []).map((tk) => tk.document).filter((d) => d?.actor);

export class TrapApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["ssl-traps", "st-app"],
    window: { icon: "fa-solid fa-skull-crossbones", resizable: true },
    position: { width: 780, height: 720 },
    actions: {
      // Не «tab»: это имя ApplicationV2 забирает себе (встроенное переключение вкладок по data-group).
      switchTab: TrapApp.#onSwitchTab,
      edit: TrapApp.#onEdit,
      pan: TrapApp.#onPan,
      configure: TrapApp.#onConfigure,
      toggleArmed: TrapApp.#onToggleArmed,
      toggleVisible: TrapApp.#onToggleVisible,
      revealAll: TrapApp.#onRevealAll,
      hideAll: TrapApp.#onHideAll,
      trigger: TrapApp.#onTrigger,
      addActivator: TrapApp.#onAddActivator,
      attempt: TrapApp.#onAttempt,
      saveTrap: TrapApp.#onSave,
      deleteTrap: TrapApp.#onDelete,
      deleteCustom: TrapApp.#onDeleteCustom,
      renameCustom: TrapApp.#onRenameCustom,
      exportCustom: TrapApp.#onExportCustom,
      newTrap: TrapApp.#onNewTrap,
      exportAll: TrapApp.#onExportAll,
      importFile: TrapApp.#onImportFile,
      search: TrapApp.#onSearch,
    },
  };

  static PARTS = { body: { template: tpl("trap-app.hbs"), templates: [tpl("trap-card.hbs")], scrollable: [".st-scroll"] } };

  static open(tab) {
    if (!game.user.isGM) {
      ui.notifications.warn(t("Notify.gmOnly"));
      return null;
    }
    let app = foundry.applications.instances.get(APP_ID);
    if (!app) app = new TrapApp();
    if (tab) app._tab = tab;
    const wasOpen = app.rendered;
    app.render({ force: true });
    // Поднять наверх можно только окно, которое уже на странице: у нового его ещё нет (v14 падает).
    if (wasOpen) app.bringToFront?.();
    return app;
  }

  /** Перерисовать, если окно открыто (сцена или библиотека поменялись). */
  /**
   * Перерисовать окно, если оно открыто. sceneOnly — поменялась ловушка на сцене: это видно только
   * на вкладке «На этой сцене», библиотеку и «Мои ловушки» перерисовывать незачем.
   */
  static refresh({ sceneOnly = false } = {}) {
    const app = foundry.applications.instances.get(APP_ID);
    if (!app?.rendered) return;
    if (sceneOnly && app._tab !== "scene" && !TrapApp._timer) return;
    clearTimeout(TrapApp._timer);
    TrapApp._timer = setTimeout(() => {
      TrapApp._timer = null;
      app.render();
    }, 120);
  }

  _tab = "library";

  _filter = { query: "", severity: "", kind: "", damageType: "" };

  get title() {
    return t("Title");
  }

  /** Оформление ставим на всё окно, вместе с шапкой Foundry. */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    frame.dataset.stTheme = THEME;
    return frame;
  }

  async _prepareContext() {
    const party = Number(setting(SETTINGS.partyLevel)) || 1;
    // «Ур. 3 · Опасная · 12 опыта» — уровень ловушки и опыт за неё для этой партии.
    const levelLabel = (trap, partyLevel) =>
      `${t("Stat.levelShort", { level: trap.level })} · ${t(`Severity.${trap.severity}`)}${partyLevel ? ` · ${t("Stat.xp", { n: trapXp(trap, partyLevel) })}` : ""}`;
    const all = listEntries();
    const mineCount = all.filter((e) => e.custom).length;
    // «Библиотека» — встроенные ловушки, «Мои ловушки» — сохранённые ведущим.
    const entries = all.filter((e) => (this._tab === "mine" ? e.custom : !e.custom)).map((e) => {
      const trap = scaleTrap(e.trap, party);
      return {
        id: e.id,
        name: e.name,
        text: e.text,
        icon: trap.icon,
        severity: trap.severity,
        severityLabel: levelLabel(trap, party),
        magical: trap.magical,
        natural: trap.natural,
        everyTurn: trap.everyTurn,
        image: trap.image,
        custom: e.custom,
        area: t("Stat.areaValue", { w: trap.width, h: trap.height }),
        affects: affectsLabel(trap),
        rearm: t(`Rearm.${trap.rearm}`),
        activation: activationLabel(trap),
        manual: trap.manual,
        stats: stats(trap),
        damageTypes: [trap.damage && trap.damageType, trap.damage2 && (trap.damage2Type || trap.damageType)].filter(Boolean).join(" "),
        search: `${e.name} ${e.text}`.toLowerCase(),
      };
    });

    const scene = canvas.scene;
    const traps = sceneTraps(scene).map(({ region, behavior }) => {
      const trap = behavior.system;
      const b = regionBounds(region);
      const cells = rectCells(b, scene.grid.size || 100);
      const activators = activatorsOf(region).length;
      return {
        regionId: region.id,
        behaviorId: behavior.id,
        name: behavior.name || region.name,
        icon: trap.icon,
        severity: trap.severity,
        severityLabel: levelLabel(trap, Number(region.getFlag(MODULE_ID, "partyLevel")) || 0),
        armed: !behavior.disabled,
        visible: isRevealed(region),
        detected: trap.detected,
        noticed: noticedBy(region).map((n) => n.name).filter(Boolean).join(", "),
        triggers: trap.triggers,
        triggersLabel: t("App.triggered", { n: trap.triggers }),
        manual: trap.manual,
        everyTurn: trap.everyTurn,
        activation: activationLabel(trap, activators),
        area: t("Stat.areaValue", { w: cells.width, h: cells.height }),
        stats: stats(trap),
      };
    });

    return {
      tab: this._tab,
      isLibrary: this._tab === "library",
      isMine: this._tab === "mine",
      isScene: this._tab === "scene",
      isGrid: this._tab !== "scene",
      mineCount,
      filter: this._filter,
      tiers: PARTY_LEVELS.map((n) => ({ value: n, label: String(n), selected: n === party })),
      severities: SEVERITIES.map((s) => ({ value: s, label: t(`Severity.${s}`), selected: s === this._filter.severity })),
      kinds: KINDS.map((k) => ({ value: k, label: t(`Kind.${k}`), selected: k === this._filter.kind })),
      damageTypes: DAMAGE_TYPES.map((d) => ({ value: d, label: damageLabel(d), selected: d === this._filter.damageType })),
      entries,
      scene: scene ? { name: scene.name, traps, anyHidden: traps.some((x) => !x.visible), anyShown: traps.some((x) => x.visible) } : null,
      sceneCount: traps.length,
      searchHint: t("App.searchSelectedHint"),
      ideasUrl: game.user.isGM ? IDEAS_URL : "",
      // Переключатели розыгрыша — общие настройки мира прямо на вкладке сцены.
      modes: [
        ["detectMode", DETECT_MODES],
        ["saveRolls", SAVE_ROLLS],
        ["damageMode", DAMAGE_MODES],
        ["disarmRolls", DISARM_ROLLS],
        ["playerDisarm", PLAYER_DISARM],
      ].map(([key, values]) => ({
        key,
        label: t(`App.${key}Label`),
        options: values.map((m) => ({ value: m, label: t(`App.${key}.${m}`), hint: t(`Settings.${key}.${m}`), checked: m === setting(SETTINGS[key]) })),
      })),
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const root = this.element;
    // Что делать с замеченной ловушкой — общая настройка мира, переключается прямо здесь.
    for (const el of root.querySelectorAll("input[data-setting]")) {
      el.addEventListener("change", () => el.checked && setSetting(SETTINGS[el.dataset.setting], el.value));
    }
    // Фильтры библиотеки — без перерисовки: прячем карточки, фокус остаётся в поле поиска.
    for (const el of root.querySelectorAll("[data-filter]")) {
      el.addEventListener(el.tagName === "INPUT" ? "input" : "change", () => {
        this._filter[el.dataset.filter] = el.value;
        this.#applyFilter();
      });
    }
    root.querySelector("[data-tier]")?.addEventListener("change", async (event) => {
      await setSetting(SETTINGS.partyLevel, Number(event.target.value));
      this.render();
    });
    for (const card of root.querySelectorAll(".st-card[draggable]")) {
      card.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("text/plain", JSON.stringify({ type: DRAG_TYPE, trapId: card.dataset.trap }));
        event.dataTransfer.effectAllowed = "copy";
        card.classList.add("is-dragging");
      });
      card.addEventListener("dragend", () => card.classList.remove("is-dragging"));
    }
    this.#applyFilter();
  }

  #applyFilter() {
    const root = this.element;
    const cards = [...root.querySelectorAll(".st-card")];
    if (!cards.length) return;
    const entries = cards.map((el) => ({
      el,
      name: el.dataset.search,
      text: "",
      trap: {
        severity: el.dataset.severity,
        magical: el.dataset.magical === "true",
        natural: el.dataset.natural === "true",
        damageType: el.dataset.damage.split(" ")[0] ?? "",
        damage2Type: el.dataset.damage.split(" ")[1] ?? "",
      },
    }));
    const shown = new Set(filterTraps(entries, this._filter).map((e) => e.el));
    for (const { el } of entries) el.hidden = !shown.has(el);
    root.querySelector(".st-empty-filter")?.toggleAttribute("hidden", shown.size > 0);
  }

  /* ---------- действия ---------- */

  static #onSwitchTab(event, target) {
    this._tab = target.dataset.tab;
    this.render();
  }

  #row(target) {
    const row = target.closest("[data-region]");
    const region = canvas.scene?.regions.get(row?.dataset.region);
    const behavior = region?.behaviors.get(row?.dataset.behavior);
    return region && behavior ? { region, behavior } : null;
  }

  static #onPan(event, target) {
    const found = this.#row(target);
    if (!found) return;
    const b = regionBounds(found.region);
    canvas.animatePan({ x: b.x + b.width / 2, y: b.y + b.height / 2, scale: Math.max(canvas.stage.scale.x, 1) });
    found.region.object?.control?.({ releaseOthers: true });
  }

  static #onConfigure(event, target) {
    const found = this.#row(target);
    if (found) TrapEditor.openPlaced(found.region, found.behavior);
  }

  /** Карточка библиотеки: нажали — открыть настройку (перетаскивание ставит на карту). */
  static #onEdit(event, target) {
    const id = target.closest("[data-trap]")?.dataset.trap;
    if (id) TrapEditor.openEntry(id);
  }

  static async #onToggleArmed(event, target) {
    const found = this.#row(target);
    if (found) await setArmed(found.behavior, found.behavior.disabled);
  }

  static async #onToggleVisible(event, target) {
    const found = this.#row(target);
    if (found) await setRevealed(found.region, found.behavior, !isRevealed(found.region));
  }

  static async #onRevealAll() {
    const n = await setAllRevealed(canvas.scene, true);
    if (n) ui.notifications.info(t("Notify.revealedAll", { n }));
  }

  static async #onHideAll() {
    const n = await setAllRevealed(canvas.scene, false);
    if (n) ui.notifications.info(t("Notify.hiddenAll", { n }));
  }

  static async #onTrigger(event, target) {
    const found = this.#row(target);
    if (!found) return;
    if (!game.users.activeGM?.isSelf) return ui.notifications.warn(t("Notify.noGM"));
    await triggerNow(found.behavior, controlledTokens());
  }

  /** Ещё один триггер ловушке (не больше трёх) — в её области; ведущий перетаскивает его на карте. */
  static async #onAddActivator(event, target) {
    const found = this.#row(target);
    if (found) await addTriggerNotified(found.region, found.behavior);
  }

  static async #onAttempt(event, target) {
    const found = this.#row(target);
    const [token] = controlledTokens();
    if (!found) return;
    if (!token) return ui.notifications.warn(t("Notify.selectToken"));
    await requestDisarm(found.region, found.behavior, token);
  }

  /** Ловушку со сцены — в «Мои ловушки»: спросить название; поставленную из своей — обновить или новой. */
  static async #onSave(event, target) {
    const found = this.#row(target);
    if (!found) return;
    const own = sourceCustom(found.behavior);
    const answer = await askName({ value: found.behavior.name || found.region.name, overwrite: own?.name ?? null });
    if (!answer) return;
    await saveToLibrary(found.region, found.behavior, { name: answer.name, asNew: answer.mode === "new" });
  }

  static async #onRenameCustom(event, target) {
    const id = target.closest("[data-trap]")?.dataset.trap;
    const entry = id && getEntry(id);
    if (!entry?.custom) return;
    const answer = await askName({ value: entry.name, title: t("Name.renameTitle") });
    if (!answer || answer.name === entry.name) return;
    await saveCustom({ ...entry.trap, id: entry.id, name: answer.name, text: entry.text, flavor: entry.flavor });
    ui.notifications.info(t("Notify.renamed", { name: answer.name }));
  }

  static async #onDelete(event, target) {
    const found = this.#row(target);
    if (!found) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("App.delete") },
      content: `<p>${t("App.confirmDelete", { name: foundry.utils.escapeHTML(found.behavior.name) })}</p>`,
    });
    if (ok) await found.region.delete();
  }

  static async #onDeleteCustom(event, target) {
    const id = target.closest("[data-trap]")?.dataset.trap;
    const entry = id && getEntry(id);
    if (!entry?.custom) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("App.deleteCustom") },
      content: `<p>${t("App.confirmDeleteCustom", { name: foundry.utils.escapeHTML(entry.name) })}</p>`,
    });
    if (ok) await deleteCustom(id);
  }

  /* ---------- свои ловушки: новая, файлы ---------- */

  static #onNewTrap() {
    TrapEditor.openNew();
  }

  static async #onExportAll() {
    const saved = await exportCustom();
    if (!saved) return ui.notifications.warn(t("Notify.exportEmpty"));
    ui.notifications.info(t("Notify.exported", { n: saved.count, file: saved.file }));
  }

  static async #onExportCustom(event, target) {
    const id = target.closest("[data-trap]")?.dataset.trap;
    const saved = id && (await exportCustom([id]));
    if (saved) ui.notifications.info(t("Notify.exported", { n: saved.count, file: saved.file }));
  }

  /** Выбрать файл → показать, что в нём → добавить отмеченное в «Мои ловушки». */
  static async #onImportFile() {
    const file = await pickFile();
    if (!file) return;
    const preview = previewImport(await file.text());
    if (!preview.ok || !preview.items.length) return ui.notifications.warn(t("Notify.importBad"));
    if (preview.items.every((x) => x.reason === "system")) {
      return ui.notifications.warn(t("Notify.importOther", { system: systemName(preview.system) }));
    }
    const picked = await askImport({ file: file.name, items: preview.items, systemName: systemName(preview.system) });
    if (!picked?.length) return;
    const n = await importCustom(picked);
    ui.notifications.info(t("Notify.imported", { n }));
    this._tab = "mine";
    this.render();
  }

  static async #onSearch() {
    const tokens = controlledTokens();
    if (!tokens.length) return ui.notifications.warn(t("Notify.selectToken"));
    await searchWith(tokens);
  }
}
