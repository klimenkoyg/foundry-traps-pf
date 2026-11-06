/* Окно настройки ловушки. Сверху — устройство: параметры на языке мира (глубина ямы, вид газа),
   ниже — все числа. Справа — карточка, которая меняется на глазах. Работает и с ловушкой из
   библиотеки (поставить на карту, сохранить как свою), и с ловушкой на сцене. */

import { DEVICES, deviceFields } from "../../core/devices.mjs";
import { FX_NAMES, SOUND_NAMES } from "../../core/fx/presets.mjs";
import {
  byPartyLevel,
  isFormula,
  normalizeTrap,
  scaleTrap,
  SEVERITIES,
  trapMode,
  trapXp,
  unscaleTrap,
  withDevice,
  withFixedDamage,
} from "../../core/trap.mjs";
import { MAX_LEVEL, MIN_LEVEL } from "../../core/tables.mjs";
import { placeTrap, updatePlaced } from "../actions.mjs";
import { DRAG_TYPE, MODULE_ID, SETTINGS, THEME, tpl } from "../constants.mjs";
import { choices } from "../pf2e.mjs";
import { previewFx } from "../fx.mjs";
import { t } from "../i18n.mjs";
import { askName } from "../dialogs.mjs";
import { getEntry, saveCustom } from "../library.mjs";
import { rectCells } from "../../core/geometry.mjs";
import { activatorsOf, regionBounds } from "../scene.mjs";
import { setting } from "../settings.mjs";
import { activationLabel, affectsLabel, fieldChips, stats } from "../summary.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Поля, которые правятся в окне, и то, как читать их из формы. */
const NUMBER_FIELDS = new Set([
  "level", "detectDC", "detectRank", "detectRange", "disarmDC", "disarmRank", "disarmSuccesses", "saveDC", "attackBonus",
  "escapeDC", "conditionValue", "width", "height", "activators",
]);
const CHECK_FIELDS = new Set(["magical", "stops", "fixedDamage", "manual", "damage2Persistent"]);
const FORMULA_FIELDS = new Set(["damage", "damage2"]);

const label = (name) => t(`Behavior.FIELDS.${name}.label`);
const options = (map, current) =>
  Object.entries(typeof map === "function" ? map() : map).map(([value, text]) => ({ value, label: text, selected: value === String(current ?? "") }));

/** Ячейка размера: сторона области ловушки на сцене в клетках. */
const cellsOf = (region) => rectCells(regionBounds(region), region.parent?.grid?.size || 100);

export class TrapEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["ssl-traps", "st-app", "st-editor"],
    window: { icon: "fa-solid fa-sliders", resizable: true },
    position: { width: 860, height: 720 },
    actions: {
      place: TrapEditor.#onPlace,
      apply: TrapEditor.#onApply,
      saveLibrary: TrapEditor.#onSaveLibrary,
      saveCopy: TrapEditor.#onSaveCopy,
      play: TrapEditor.#onPlay,
      reset: TrapEditor.#onReset,
    },
  };

  static PARTS = {
    form: { template: tpl("trap-editor.hbs"), scrollable: [".st-scroll"] },
    preview: { template: tpl("trap-preview.hbs"), templates: [tpl("trap-card.hbs")] },
  };

  /** Ловушка из библиотеки: id записи. */
  static openEntry(id) {
    const entry = getEntry(id);
    if (!entry) return null;
    return TrapEditor.#show(`ssl-traps-editor-${id}`, () => new TrapEditor({ id: `ssl-traps-editor-${id}`, source: { kind: "library", entry } }));
  }

  /** Ловушка на сцене. */
  static openPlaced(region, behavior) {
    const id = `ssl-traps-editor-${behavior.id}`;
    return TrapEditor.#show(id, () => new TrapEditor({ id, source: { kind: "scene", region, behavior } }));
  }

  static #show(id, make) {
    if (!game.user.isGM) {
      ui.notifications.warn(t("Notify.gmOnly"));
      return null;
    }
    const app = foundry.applications.instances.get(id) ?? make();
    const wasOpen = app.rendered;
    app.render({ force: true });
    // Поднять наверх можно только окно, которое уже на странице: у нового его ещё нет (v14 падает).
    if (wasOpen) app.bringToFront?.();
    return app;
  }

  constructor({ source, ...opts } = {}) {
    super(opts);
    this.source = source;
    this.#load();
  }

  /** Черновик — числа уже под уровень партии, как их увидят за столом. */
  #load() {
    const src = this.source;
    if (src.kind === "scene") {
      const system = src.behavior.system.toObject();
      this.party = Number(src.region.getFlag(MODULE_ID, "partyLevel") ?? 1) || 1;
      this.draft = normalizeTrap({
        ...system,
        id: system.trapId,
        name: src.behavior.name || src.region.name,
        text: system.notes,
        ...cellsOf(src.region),
        // Сколько триггеров на самом деле стоит на сцене — их ведущий мог добавить и на карте.
        activators: activatorsOf(src.region).length,
      });
    } else {
      const { entry } = src;
      this.party = Number(setting(SETTINGS.partyLevel)) || 1;
      this.draft = { ...scaleTrap(entry.trap, this.party), name: entry.name, text: entry.text, flavor: entry.flavor };
    }
    this.initial = foundry.utils.deepClone(this.draft);
  }

  get title() {
    return t("Editor.title", { name: this.draft?.name || t("Title") });
  }

  get isScene() {
    return this.source.kind === "scene";
  }

  get isCustom() {
    return Boolean(this.ownId);
  }

  /** Своя ловушка, которую правит окно: из «Моих ловушек» или поставленная из неё на сцену. */
  get ownId() {
    if (this.source.kind === "library") return this.source.entry.custom ? this.source.entry.id : null;
    const id = this.draft?.id;
    return id?.startsWith("custom-") && getEntry(id)?.custom ? id : null;
  }

  get dirty() {
    return JSON.stringify(this.draft) !== JSON.stringify(this.initial);
  }

  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    frame.dataset.stTheme = THEME;
    return frame;
  }

  /* ---------------------------------------------------------------- контекст */

  async _prepareContext() {
    const d = this.draft;
    const controlled = new Set(deviceFields(d.device));
    return {
      uid: this.id,
      name: d.name,
      icon: d.icon,
      severity: d.severity,
      magical: d.magical,
      mode: trapMode(d),
      severities: SEVERITIES.map((s) => ({ value: s, label: t(`Severity.${s}`), checked: s === d.severity })),
      device: this.#deviceContext(d),
      groups: this.#groups(d, controlled),
      preview: this.#previewCard(d),
      flavor: d.flavor,
      isScene: this.isScene,
      isCustom: this.isCustom,
      dirty: this.dirty,
      saveLabel: t(this.isCustom ? "Editor.saveOver" : "Editor.saveNew"),
      tiers: this.#tiers(d),
    };
  }

  /**
   * Справа под карточкой: какой станет ловушка под партию другого уровня — её уровень, Сл
   * Скрытности и урон (по таблицам GM Core). Текущий уровень партии подсвечен.
   */
  #tiers(d) {
    const sum = (x) => [x.damage, x.damage2].filter(Boolean).join(" + ") || t("Stat.noDamageShort");
    return {
      fixed: false,
      rows: byPartyLevel(d, this.party).map((r) => ({
        levels: t("Editor.partyRow", { party: r.party, level: r.level }),
        factor: t("Stat.dc", { dc: r.detectDC }),
        damage: sum(r),
        current: r.current,
      })),
    };
  }

  #deviceContext(d) {
    const def = DEVICES[d.device];
    if (!def) return null;
    return {
      params: def.params.map((p) => {
        const base = `Device.${d.device}.${p.key}`;
        const value = d.options[p.key];
        const ctx = { key: p.key, label: t(`${base}.label`), chips: fieldChips(d, p.fields), value };
        const unit = (n) => (p.unit ? t(`Unit.${p.unit}`, { n }) : String(n));
        if (p.type === "range" && (p.max - p.min) / p.step <= 5) {
          const steps = [];
          for (let v = p.min; v <= p.max; v += p.step) steps.push({ value: String(v), label: unit(v), checked: v === value });
          return { ...ctx, isSeg: true, options: steps };
        }
        if (p.type === "range") {
          return {
            ...ctx,
            isRange: true,
            min: p.min,
            max: p.max,
            step: p.step,
            display: unit(value),
            minLabel: unit(p.min),
            maxLabel: unit(p.max),
            fill: Math.round(((value - p.min) / (p.max - p.min)) * 100),
          };
        }
        if (p.type === "toggle") return { ...ctx, isToggle: true };
        return { ...ctx, isSeg: true, options: p.options.map((v) => ({ value: v, label: t(`${base}.${v}`), checked: v === value })) };
      }),
    };
  }

  #groups(d, controlled) {
    const mode = trapMode(d);
    const field = (name, type, extra = {}) => {
      const value = d[name];
      const out = { name, label: extra.label ?? label(name), device: controlled.has(name), hint: extra.hint, show: extra.show, wide: extra.wide };
      if (type === "select") return { ...out, isSelect: true, options: options(extra.choices, value) };
      if (type === "number") return { ...out, isNumber: true, value: value ?? "", min: extra.min ?? 0, max: extra.max ?? 40, step: extra.step ?? 1 };
      if (type === "formula") return { ...out, isText: true, value, placeholder: "—" };
      if (type === "check") return { ...out, isCheck: true, value };
      if (type === "area") return { ...out, isArea: true, value, wide: true };
      return out;
    };
    const saves = () => Object.fromEntries(Object.entries(choices.saves()).filter(([k]) => k));
    const sounds = () => ({
      "": t("Sound.none"),
      ...Object.fromEntries(SOUND_NAMES.map((s) => [s, t(`Sound.${s}`)])),
      ...(d.sound && !SOUND_NAMES.includes(d.sound) ? { [d.sound]: d.sound } : {}),
    });
    const groups = [
      {
        id: "checks",
        fields: [
          field("level", "number", { min: MIN_LEVEL, max: MAX_LEVEL, hint: t("Editor.levelHint", { xp: trapXp(d, this.party), party: this.party }) }),
          field("detectRange", "number", { min: 5, max: 120, step: 5 }),
          field("detectDC", "number", { max: 70 }),
          field("detectRank", "select", { choices: choices.ranks }),
          field("disarmSkill", "select", { choices: choices.skills }),
          field("disarmDC", "number", { max: 70 }),
          field("disarmRank", "select", { choices: choices.ranks }),
          field("disarmSuccesses", "number", { min: 1, max: 5 }),
          {
            name: "check",
            label: t("Editor.check"),
            isSelect: true,
            options: options({ save: t("Editor.checkSave"), attack: t("Editor.checkAttack"), auto: t("Editor.checkAuto") }, mode),
            device: controlled.has("attackBonus") || controlled.has("saveAbility"),
          },
          field("saveAbility", "select", { choices: saves, show: "save" }),
          field("saveDC", "number", { show: "save", min: 1, max: 70 }),
          field("onSave", "select", { choices: { basic: t("OnSave.basic"), avoid: t("OnSave.avoid") }, show: "save", wide: true }),
          field("attackBonus", "number", { show: "attack", min: -5, max: 60 }),
        ],
      },
      {
        id: "damage",
        fields: [
          field("damage", "formula"),
          field("damageType", "select", { choices: choices.damageTypes }),
          field("damage2", "formula"),
          field("damage2Type", "select", { choices: choices.damageTypesOptional }),
          field("damage2Persistent", "check", { wide: true }),
          field("condition", "select", { choices: choices.conditions }),
          field("conditionValue", "number", { min: 0, max: 4, hint: t("Editor.conditionValueHint") }),
          field("escapeDC", "number", { hint: t("Editor.escapeHint"), max: 70 }),
          field("escapeSkill", "select", { choices: choices.escapeSkills }),
          field("fixedDamage", "check", { wide: true }),
        ],
      },
      {
        id: "area",
        fields: [
          field("width", "number", { label: t("Editor.width"), min: 1, max: 12 }),
          field("height", "number", { label: t("Editor.height"), min: 1, max: 12 }),
          field("affects", "select", { choices: { trigger: t("Affects.trigger"), area: t("Affects.area") } }),
          field("rearm", "select", { choices: { auto: t("Rearm.auto"), once: t("Rearm.once") } }),
          field("activators", "select", {
            choices: { 0: t("Activators.none"), 1: t("Activators.1"), 2: t("Activators.2"), 3: t("Activators.3") },
            hint: t("Editor.activatorHint"),
            wide: true,
          }),
          field("manual", "check", { hint: t("Editor.manualHint"), wide: true }),
        ],
      },
      {
        id: "effects",
        fields: [
          field("fx", "select", { choices: () => Object.fromEntries(FX_NAMES.map((x) => [x, t(`Fx.${x}`)])) }),
          field("sound", "select", { choices: sounds }),
        ],
      },
      {
        id: "texts",
        fields: [field("flavor", "area"), field("text", "area", { label: label("notes") })],
      },
    ];
    // Без устройства все числа — главное, раскрываем всё.
    const open = this._open ?? new Set(d.device ? ["checks", "damage"] : groups.map((g) => g.id));
    this._open = open;
    return groups.map((g) => ({ ...g, label: t(`Editor.${g.id}`), open: open.has(g.id) }));
  }

  #previewCard(d) {
    const parts = [d.damage && d.damageType, d.damage2 && (d.damage2Type || d.damageType)].filter(Boolean);
    return {
      preview: true,
      id: d.id,
      name: d.name || t("Title"),
      text: d.text,
      icon: d.icon,
      severity: d.severity,
      severityLabel: `${t("Stat.levelShort", { level: d.level })} · ${t(`Severity.${d.severity}`)} · ${t("Stat.xp", { n: trapXp(d, this.party) })}`,
      magical: d.magical,
      custom: this.isCustom,
      area: t("Stat.areaValue", { w: d.width, h: d.height }),
      affects: affectsLabel(d),
      rearm: t(`Rearm.${d.rearm}`),
      activation: activationLabel(d),
      manual: d.manual,
      stats: stats(d),
      damageTypes: parts.join(" "),
    };
  }

  /* ---------------------------------------------------------------- форма */

  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    const root = this.element;
    root.addEventListener("input", (event) => this.#onInput(event));
    root.addEventListener("change", (event) => this.#onChange(event));
    // Раскрытые разделы переживают перерисовку.
    root.addEventListener(
      "toggle",
      (event) => {
        const group = event.target.closest?.("[data-group]")?.dataset.group;
        if (!group) return;
        if (event.target.open) this._open.add(group);
        else this._open.delete(group);
      },
      true,
    );
    // Карточку предпросмотра можно утащить на карту — встанет ровно такая.
    root.addEventListener("dragstart", (event) => {
      const card = event.target.closest?.(".st-card.is-preview");
      if (!card) return;
      if (this.isScene) return event.preventDefault();
      const draft = { ...this.draft, scaled: true, party: this.party, sourceId: this.source.entry.id };
      event.dataTransfer.setData("text/plain", JSON.stringify({ type: DRAG_TYPE, draft }));
      event.dataTransfer.effectAllowed = "copy";
    });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#markChanged();
  }

  /** Живые поля: ползунок, текст. */
  #onInput(event) {
    const el = event.target;
    if (!el.name) return;
    if (el.type === "range") {
      this.#setDevice(el.name.slice(4), Number(el.value));
      return;
    }
    if (el.type === "text" || el.tagName === "TEXTAREA") this.#setField(el);
  }

  /** Выборы, флажки, числа — по завершении ввода. */
  #onChange(event) {
    const el = event.target;
    if (!el.name || el.type === "range") return;
    if (el.name.startsWith("opt.")) return this.#setDevice(el.name.slice(4), el.value);
    if (el.name === "check") return this.#setMode(el.value);
    this.#setField(el);
    // Числа, вышедшие за пределы, возвращаем в рамки.
    if (NUMBER_FIELDS.has(el.name)) el.value = this.draft[el.name] ?? "";
  }

  #setField(el) {
    const name = el.name;
    let value = el.value;
    if (CHECK_FIELDS.has(name)) value = el.checked;
    else if (NUMBER_FIELDS.has(name)) value = el.value === "" ? (name === "attackBonus" ? null : 0) : Number(el.value);
    if (FORMULA_FIELDS.has(name)) el.classList.toggle("is-invalid", Boolean(value.trim()) && !isFormula(value));
    const before = this.draft;
    if (name === "fixedDamage") {
      // Урон в полях переходит между «как записан» и «под уровень партии» (на 1–4 уровне — тот же).
      this.draft = withFixedDamage(before, value);
      this.#syncFields(before);
      return this.#refresh();
    }
    this.draft = { ...normalizeTrap({ ...this.draft, [name]: value }) };
    // Пока формула набирается, не стираем её: в черновик попадёт, когда станет верной.
    if (FORMULA_FIELDS.has(name) && value.trim() && !isFormula(value)) this.draft[name] = before[name];
    if (name === "severity") this.#syncHead();
    this.#refresh();
  }

  /** Спасбросок, атака или ничего: переключаем связанные поля. */
  #setMode(mode) {
    const before = this.draft;
    const patch =
      mode === "attack"
        ? { attackBonus: before.attackBonus ?? 10, saveAbility: "" }
        : mode === "save"
          ? { attackBonus: null, saveAbility: before.saveAbility || this.initial.saveAbility || "reflex" }
          : { attackBonus: null, saveAbility: "" };
    this.draft = normalizeTrap({ ...before, ...patch });
    this.#syncFields(before);
    this.#refresh();
  }

  /** Параметр устройства: пересчитать его поля и показать, что поменялось. */
  #setDevice(key, value) {
    const before = this.draft;
    this.draft = withDevice(before, { [key]: value }, this.party);
    this.#syncFields(before);
    this.#syncDevice();
    this.#refresh();
  }

  /** Поля формы, которые поменялись не руками, — обновить и подсветить. */
  #syncFields(before) {
    const form = this.element?.querySelector(".st-ed-form");
    if (!form) return;
    const d = this.draft;
    for (const [name, value] of Object.entries(d)) {
      if (JSON.stringify(value) === JSON.stringify(before[name])) continue;
      const input = form.querySelector(`[name="${name}"]`);
      if (!input) continue;
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = value ?? "";
      flash(input.closest(".st-field"));
    }
    const mode = trapMode(d);
    if (form.dataset.mode !== mode) {
      form.dataset.mode = mode;
      const check = form.querySelector('[name="check"]');
      if (check) check.value = mode;
    }
    this.#syncHead();
  }

  /** Подписи под параметрами устройства и число у ползунка. */
  #syncDevice() {
    const form = this.element?.querySelector(".st-ed-form");
    const ctx = this.#deviceContext(this.draft);
    if (!form || !ctx) return;
    for (const p of ctx.params) {
      const effect = form.querySelector(`[data-effect="${p.key}"]`);
      const html = p.chips.map((c) => `<span>${foundry.utils.escapeHTML(c)}</span>`).join("");
      if (effect && effect.innerHTML !== html) {
        effect.innerHTML = html;
        flash(effect);
      }
      if (p.isRange) {
        const output = form.querySelector(`[data-output="${p.key}"]`);
        if (output) output.textContent = p.display;
        form.querySelector(`[name="opt.${p.key}"]`)?.style.setProperty("--fill", `${p.fill}%`);
      }
    }
  }

  #syncHead() {
    const head = this.element?.querySelector(".st-ed-head .st-icon");
    if (head) head.dataset.severity = this.draft.severity;
  }

  /** Перерисовать только карточку справа: поля формы не теряют фокус. */
  #refresh() {
    if (this._refreshing) return;
    this._refreshing = setTimeout(() => {
      this._refreshing = null;
      this.render({ parts: ["preview"] });
    }, 30);
  }

  /** Строки карточки, которые поменялись с прошлого раза, ненадолго подсвечиваются. */
  #markChanged() {
    const card = this.element?.querySelector(".st-card.is-preview");
    if (!card) return;
    const now = Object.fromEntries([...card.querySelectorAll("[data-stat]")].map((el) => [el.dataset.stat, el.textContent]));
    if (this._stats) {
      for (const [key, text] of Object.entries(now)) {
        if (this._stats[key] !== text) flash(card.querySelector(`[data-stat="${key}"]`));
      }
    }
    this._stats = now;
  }

  /* ---------------------------------------------------------------- действия */

  /** В центр экрана (или куда смотрит ведущий). */
  static async #onPlace() {
    const scene = canvas.scene;
    if (!scene) return ui.notifications.warn(t("Notify.noScene"));
    const pivot = canvas.stage?.pivot ?? { x: (scene.dimensions?.width ?? 0) / 2, y: (scene.dimensions?.height ?? 0) / 2 };
    await placeTrap(scene, this.#asEntry(), { x: pivot.x, y: pivot.y }, this.party);
  }

  static async #onApply() {
    const { region, behavior } = this.source;
    await updatePlaced(region, behavior, this.draft);
    ui.notifications.info(t("Notify.updated", { name: this.draft.name }));
    this.close();
  }

  /** Своя — перезаписать под текущим названием; встроенная или со сцены — спросить название. */
  static async #onSaveLibrary() {
    if (this.ownId) return this.#save(this.ownId, this.draft.name);
    const answer = await askName({ value: this.draft.name });
    if (answer) await this.#save(undefined, answer.name);
  }

  static async #onSaveCopy() {
    const answer = await askName({ value: t("Name.copyOf", { name: this.draft.name }) });
    if (answer) await this.#save(undefined, answer.name);
  }

  /** В «Мои ловушки» — с уроном для 1–4 уровня. id — перезаписать свою; без id — новая. */
  async #save(id, name = this.draft.name) {
    this.draft = { ...this.draft, name };
    const trap = unscaleTrap(this.draft, this.party);
    const entry = await saveCustom({ ...trap, id });
    const input = this.element?.querySelector('[name="name"]');
    if (input) input.value = entry.name;
    ui.notifications.info(t("Notify.saved", { name: entry.name }));
    // Окно библиотечной ловушки дальше правит сохранённую: следующее «Сохранить» её перезапишет.
    if (this.source.kind === "library") {
      this.source = { kind: "library", entry };
      this.draft = { ...this.draft, id: entry.id };
      this.initial = foundry.utils.deepClone(this.draft);
    }
    this.render({ parts: ["preview"] });
  }

  static #onPlay() {
    const scene = canvas.scene;
    if (!scene) return;
    const grid = scene.grid.size;
    let at = canvas.stage?.pivot ?? { x: 0, y: 0 };
    if (this.isScene) {
      const b = regionBounds(this.source.region);
      at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }
    previewFx(scene, { fx: this.draft.fx, sound: this.draft.sound, at: { x: at.x, y: at.y }, area: Math.max(this.draft.width, this.draft.height) * grid, width: this.draft.width * grid, height: this.draft.height * grid });
  }

  static #onReset() {
    this.draft = foundry.utils.deepClone(this.initial);
    this._stats = null;
    this.render();
  }

  #asEntry() {
    const d = this.draft;
    return { id: this.source.entry.id, trap: d, name: d.name, text: d.text, flavor: d.flavor, scaled: true };
  }
}

/** Короткая подсветка: «это поменялось». */
function flash(el) {
  if (!el) return;
  el.classList.remove("is-flash");
  void el.offsetWidth;
  el.classList.add("is-flash");
}

