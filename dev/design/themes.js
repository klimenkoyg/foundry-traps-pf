/* Пять оформлений «Западни» на настоящих шаблонах и функциях модуля. */

const { actors, GRID } = window.__mock;
const $ = (s) => document.querySelector(s);

const THEMES = [
  {
    id: "dungeon",
    name: "Подземелье",
    idea: "Камень, кованое железо и свет факела. Ближе всего к «Таверне»: материал живёт в рамках и медальонах, цифры остаются чистыми.",
    fonts: "Alegreya SC — названия, Alegreya Sans — всё остальное",
    mood: "Мрачное подземелье · «Таверна»",
  },
  {
    id: "blueprint",
    name: "Чертёж",
    idea: "Записки мастера ловушек: синька с миллиметровкой, характеристики в штампе чертежа, заметка ведущего — от руки жёлтым карандашом.",
    fonts: "PT Sans Narrow — названия, IBM Plex Mono — цифры и подписи, Caveat — пометки",
    mood: "Записки мастера ловушек",
  },
  {
    id: "heroic",
    name: "Героический",
    idea: "Как в Baldur's Gate 3: тёмные панели в двойной золотой оправе, медальоны вместо значков, торжественные заголовки и самоцветы опасности.",
    fonts: "Cormorant SC — названия, Alegreya Sans — всё остальное",
    mood: "Игровой интерфейс как в BG3",
  },
  {
    id: "engraving",
    name: "Гравюра",
    idea: "Darkest Dungeon и Diablo: чернь, кость и кровь. Тяжёлые двойные линии, штриховка резцом в шапках, у смертельных ловушек — кровавая нить.",
    fonts: "Kurale — названия, Alegreya — текст, Alegreya SC — подписи",
    mood: "Darkest Dungeon / Diablo",
  },
  {
    id: "reference",
    name: "Справочник",
    idea: "Строгий инструмент ведущего: свод правил как в D&D Beyond, плотный список вместо сетки карточек. Сам подстраивается под светлую и тёмную тему Foundry.",
    fonts: "PT Sans — везде",
    mood: "Строгий инструмент · D&D Beyond · Foundry v14",
  },
];

game.i18n.translations = await (await fetch(`/lang/${game.i18n.lang}.json`, { cache: "no-store" })).json();
await import("/scripts/main.mjs");
Hooks.callAll("init");
Hooks.callAll("ready");
await window.__mock.partials;

const { TrapApp } = await import("/scripts/foundry/apps/trap-app.mjs");
const { cardHtml } = await import("/scripts/foundry/trigger.mjs");
const { getEntry } = await import("/scripts/foundry/library.mjs");
const { normalizeTrap } = await import("/scripts/core/trap.mjs");
const { t } = await import("/scripts/foundry/i18n.mjs");
const api = game.modules.get("ssl_traps_pf2e").api;

/* ---------- сцена с ловушками в разных состояниях ---------- */
const fire = await api.place("fireJet", { x: 5.5 * GRID, y: 3.5 * GRID });
const gas = await api.place("poisonGas", { x: 9.5 * GRID, y: 5.5 * GRID });
await api.place("pit", { x: 7.5 * GRID, y: 1.5 * GRID });
const rune = await api.place("lightningRune", { x: 3.5 * GRID, y: 6.5 * GRID });
await fire.behaviors.contents[0].update({ "system.triggers": 1, "system.detected": true });
await fire.update({ visibility: 2 });
await gas.behaviors.contents[0].update({ "system.detected": true });
await rune.behaviors.contents[0].update({ disabled: true, "system.detected": true });
await rune.update({ visibility: 2 });

/* ---------- разметка окна: одна на все темы ---------- */
const template = Handlebars.compile(await (await fetch("/templates/trap-app.hbs", { cache: "no-store" })).text());
async function windowHtml(tab) {
  const app = new TrapApp();
  app._tab = tab;
  return template(await app._prepareContext());
}
const libraryHtml = await windowHtml("library");
const sceneHtml = await windowHtml("scene");

/* ---------- карточки чата ---------- */
const who = (actor) => ({ name: actor.name, texture: { src: actor.img } });
const P = (value, type, formula) => ({ value, type, formula });
const res = {
  saveFail: (n, cond = false) => ({ res: { mode: "save", success: false, multiplier: 1, condition: true }, check: { total: n }, conditioned: cond }),
  saveHalf: (n) => ({ res: { mode: "save", success: true, multiplier: 0.5, condition: false }, check: { total: n } }),
  hit: (n, cond = false) => ({ res: { mode: "attack", hit: true, multiplier: 1, condition: true }, check: { total: n }, conditioned: cond }),
  miss: (n) => ({ res: { mode: "attack", hit: false, multiplier: 0, condition: false }, check: { total: n } }),
};
function card(id, { parts, results }) {
  const entry = getEntry(id);
  const trap = normalizeTrap({ ...entry.trap, flavor: entry.flavor });
  const mode = trap.attackBonus !== null ? "attack" : trap.saveAbility ? "save" : "auto";
  // Здесь оформление задаёт колонка, а не модуль: снимаем его атрибут с карточки.
  return { alias: entry.name, html: cardHtml({ trap, name: entry.name, parts, results, mode }).replace(/ data-st-theme="\w+"/, "") };
}
const gasCard = card("poisonGas", {
  parts: [P(12, "poison", "2d10")],
  results: [
    { token: who(actors.mira), ...res.saveHalf(16), dealt: 6 },
    { token: who(actors.brom), ...res.saveFail(8, true), dealt: 12 },
    { token: who(actors.goblin), ...res.saveFail(5, true), dealt: 12 },
  ],
});
const detailCards = [
  card("witheringSigil", { parts: [P(23, "necrotic", "4d10")], results: [{ token: who(actors.brom), ...res.saveFail(11, true), dealt: 23 }] }),
  card("poisonDarts", { parts: [P(3, "piercing", "1d4"), P(8, "poison", "2d6")], results: [{ token: who(actors.mira), ...res.hit(19, true), dealt: 11 }] }),
  gasCard,
  card("arrowVolley", { parts: [P(7, "piercing", "2d6")], results: [{ token: who(actors.mira), ...res.miss(12) }, { token: who(actors.brom), ...res.hit(18), dealt: 7 }] }),
];
const note = (icon, cls, text) => `<p class="ssl-traps-note ${cls}"><i class="fa-solid ${icon}" inert></i> ${text}</p>`;
const notes = [
  { whisper: true, html: note("fa-eye", "", t("Chat.noticed", { name: "Мира", trap: getEntry("poisonGas").name })) },
  { html: note("fa-shield-halved", "is-success", t("Chat.disarmOk", { name: "Бром", trap: getEntry("lightningRune").name })) },
  { html: note("fa-burst", "is-triggered", t("Chat.disarmTriggered", { name: "Бром", trap: getEntry("fireJet").name })) },
];
const msg = ({ alias, html, whisper }) =>
  `<div class="msg"><header><span>${alias ?? t("Title")}</span>${whisper ? '<span class="whisper">шёпот</span>' : "<span>сейчас</span>"}</header>${html}</div>`;

/* ---------- «Рядом» ---------- */
const probe = document.createElement("div");
probe.innerHTML = libraryHtml;
const sampleCard = probe.querySelector('.st-card[data-trap="spikedPit"]').outerHTML;

$("#compare-grid").innerHTML = THEMES.map(
  (th) => `
  <article class="cmp">
    <button type="button" data-pick="${th.id}"><b>${th.name}</b><span>${th.mood}</span></button>
    <div class="mini ssl-traps" data-st-theme="${th.id}"><div class="st-scroll"><div class="st-grid">${sampleCard}</div></div></div>
    <div class="mini-chat ${th.id === "reference" ? "light-chat" : ""}" data-st-theme="${th.id}">${msg(gasCard)}</div>
  </article>`,
).join("");

/* ---------- «Подробно» ---------- */
const TOKENS = ["bg", "surface", "line", "ink", "ink-2", "accent", "setback", "dangerous", "deadly"];

function frame(el, theme, html) {
  el.className = "frame ssl-traps st-app";
  el.dataset.stTheme = theme;
  el.innerHTML = `
    <header class="window-header"><i class="fa-solid fa-skull-crossbones"></i><h1>${t("Title")}</h1><i class="fa-solid fa-xmark"></i></header>
    <section class="window-content">${html}</section>`;
}

function show(id) {
  const th = THEMES.find((x) => x.id === id) ?? THEMES[0];
  for (const b of document.querySelectorAll("#switch button")) b.setAttribute("aria-pressed", String(b.dataset.pick === th.id));
  $("#detail-name").textContent = `Подробно: ${th.name}`;
  $("#detail-idea").textContent = th.idea;
  $("#detail-facts").innerHTML = `<dt>Шрифты</dt><dd>${th.fonts}</dd><dt>Откуда</dt><dd>${th.mood}</dd>`;
  frame($("#win-library"), th.id, libraryHtml);
  frame($("#win-scene"), th.id, sceneHtml);
  const chat = $("#detail-chat");
  chat.dataset.stTheme = th.id;
  const dark = th.id === "reference" && $("#dark").checked;
  chat.classList.toggle("light-chat", th.id === "reference" && !dark);
  chat.innerHTML = [...detailCards, ...notes].map(msg).join("");
  $("#dark-toggle").hidden = th.id !== "reference";
  $("#detail-body").classList.toggle("theme-dark", dark);
  const styles = getComputedStyle($("#win-library"));
  $("#detail-swatches").innerHTML = TOKENS.map((k) => {
    const v = styles.getPropertyValue(`--st-${k}`).trim();
    return `<span class="swatch"><i style="background:${v}"></i>${k} ${v}</span>`;
  }).join("");
  try {
    localStorage.setItem("ssl-traps-theme", th.id);
  } catch {
    /* приватный режим */
  }
}

$("#switch").innerHTML = THEMES.map((th, i) => `<button type="button" data-pick="${th.id}"><kbd>${i + 1}</kbd>${th.name}</button>`).join("");
document.addEventListener("click", (event) => {
  const b = event.target.closest("[data-pick]");
  if (!b) return;
  show(b.dataset.pick);
  if (b.closest(".cmp") || matchMedia("(max-width: 760px)").matches) $("#detail").scrollIntoView();
});
document.addEventListener("keydown", (event) => {
  if (event.target.closest("input, select, textarea")) return;
  const th = THEMES[Number(event.key) - 1];
  if (th) show(th.id);
});
$("#dark").addEventListener("change", () => show("reference"));

let saved = null;
try {
  saved = localStorage.getItem("ssl-traps-theme");
} catch {
  /* приватный режим */
}
show(new URLSearchParams(location.search).get("theme") ?? saved ?? "dungeon");

// Для снимков: ?only=detail — только подробный вид, ?only=compare — только сравнение.
const only = new URLSearchParams(location.search).get("only");
if (only === "detail") $("#compare").hidden = true;
if (only === "compare") $("#detail").hidden = true;

// Для публикации: ?snapshot=1 — все пять подробных видов сразу, по разделу на оформление.
if (new URLSearchParams(location.search).get("snapshot")) {
  const holder = document.createElement("div");
  holder.id = "panes";
  for (const th of THEMES) {
    show(th.id);
    const pane = $("#detail").cloneNode(true);
    pane.removeAttribute("id");
    for (const el of pane.querySelectorAll("[id]")) el.removeAttribute("id");
    pane.querySelector(".dark-toggle")?.remove();
    pane.className = "pane";
    pane.dataset.pane = th.id;
    holder.append(pane);
  }
  $("#detail").replaceWith(holder);
  document.body.dataset.snapshot = "ready";
}
