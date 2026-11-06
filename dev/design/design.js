/* Витрина: окно ведущего и карточки чата, собранные настоящими шаблонами и функциями модуля. */

const { actors, GRID } = window.__mock;

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
const pit = await api.place("pit", { x: 7.5 * GRID, y: 1.5 * GRID });
const rune = await api.place("lightningRune", { x: 3.5 * GRID, y: 6.5 * GRID });
await fire.behaviors.contents[0].update({ "system.triggers": 1, "system.detected": true });
await fire.update({ visibility: 2 });
await gas.behaviors.contents[0].update({ "system.detected": true });
await rune.behaviors.contents[0].update({ disabled: true, "system.detected": true });
await rune.update({ visibility: 2 });
void pit;

/* ---------- окно ведущего: обе вкладки ---------- */
const source = await (await fetch("/templates/trap-app.hbs", { cache: "no-store" })).text();
const template = Handlebars.compile(source);

async function frame(id, tab) {
  const app = new TrapApp();
  app._tab = tab;
  const context = await app._prepareContext();
  const el = document.getElementById(id);
  el.classList.add("application", "ssl-traps", "st-app");
  el.dataset.stTheme = "heroic";
  el.innerHTML = `
    <header class="window-header"><i class="fa-solid fa-skull-crossbones"></i><h1>${t("Title")}</h1><i class="fa-solid fa-xmark"></i></header>
    <section class="window-content">${template(context)}</section>`;
}
await frame("win-library", "library");
await frame("win-scene", "scene");

/* ---------- карточки чата ---------- */
const who = (actor) => ({ name: actor.name, texture: { src: actor.img } });
const P = (value, type, formula) => ({ value, type, formula });

function card(id, { parts, results }) {
  const entry = getEntry(id);
  const trap = normalizeTrap({ ...entry.trap, flavor: entry.flavor });
  const mode = trap.attackBonus !== null ? "attack" : trap.saveAbility ? "save" : "auto";
  return { alias: entry.name, html: cardHtml({ trap, name: entry.name, parts, results, mode }) };
}

const res = {
  saveFail: (n, cond = false) => ({ res: { mode: "save", success: false, multiplier: 1, condition: true }, check: { total: n }, conditioned: cond }),
  saveHalf: (n) => ({ res: { mode: "save", success: true, multiplier: 0.5, condition: false }, check: { total: n } }),
  saveNone: (n) => ({ res: { mode: "save", success: true, multiplier: 0, condition: false }, check: { total: n } }),
  hit: (n, cond = false) => ({ res: { mode: "attack", hit: true, multiplier: 1, condition: true }, check: { total: n }, conditioned: cond }),
  miss: (n) => ({ res: { mode: "attack", hit: false, multiplier: 0, condition: false }, check: { total: n } }),
};

const messages = {
  "chat-a": [
    card("fireJet", { parts: [P(13, "fire", "2d10")], results: [{ token: who(actors.mira), ...res.saveFail(9), dealt: 13 }] }),
    card("poisonGas", {
      parts: [P(12, "poison", "2d10")],
      results: [
        { token: who(actors.mira), ...res.saveHalf(16), dealt: 6 },
        { token: who(actors.brom), ...res.saveFail(8, true), dealt: 12 },
        { token: who(actors.goblin), ...res.saveFail(5, true), dealt: 12 },
      ],
    }),
  ],
  "chat-b": [
    card("poisonDarts", {
      parts: [P(3, "piercing", "1d4"), P(8, "poison", "2d6")],
      results: [{ token: who(actors.brom), ...res.hit(19, true), dealt: 11 }],
    }),
    card("arrowVolley", {
      parts: [P(7, "piercing", "2d6")],
      results: [
        { token: who(actors.mira), ...res.miss(12) },
        { token: who(actors.brom), ...res.hit(18), dealt: 7 },
      ],
    }),
    card("pit", { parts: [P(6, "bludgeoning", "2d6")], results: [{ token: who(actors.mira), ...res.saveNone(17) }] }),
  ],
  "chat-c": [
    card("sleepGas", {
      parts: [],
      results: [
        { token: who(actors.mira), ...res.saveNone(14) },
        { token: who(actors.brom), ...res.saveFail(7, true) },
      ],
    }),
    card("alarmPlate", { parts: [], results: [] }),
  ],
};

const note = (icon, cls, text) => `<p class="ssl-traps-note ${cls}"><i class="fa-solid ${icon}" inert></i> ${text}</p>`;
const notes = [
  { whisper: true, html: note("fa-eye", "", t("Chat.noticed", { name: "Мира", trap: getEntry("poisonGas").name })) },
  { html: note("fa-shield-halved", "is-success", t("Chat.disarmOk", { name: "Бром", trap: getEntry("lightningRune").name })) },
  { html: note("fa-hand", "is-fail", t("Chat.disarmFail", { name: "Мира", trap: getEntry("poisonDarts").name })) },
  { html: note("fa-burst", "is-triggered", t("Chat.disarmTriggered", { name: "Бром", trap: getEntry("fireJet").name })) },
  { whisper: true, html: note("fa-eye", "", t("Chat.searchNone", { name: "Бром" })) },
];

const msg = ({ alias, html, whisper }) =>
  `<div class="msg"><header><span>${alias ?? t("Title")}</span>${whisper ? '<span class="whisper">шёпот</span>' : "<span>сейчас</span>"}</header>${html}</div>`;

for (const [id, list] of Object.entries(messages)) document.getElementById(id).innerHTML = list.map(msg).join("");
document.getElementById("chat-c").insertAdjacentHTML("beforeend", notes.map(msg).join(""));
