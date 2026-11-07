import assert from "node:assert/strict";
import { test } from "node:test";
import { fileName, FILE_FORMAT, packTraps, readPack } from "../scripts/core/share.mjs";
import { normalizeTrap } from "../scripts/core/trap.mjs";

const mine = (id, name, extra = {}) => normalizeTrap({ id, name, damage: "2d6", damageType: "fire", ...extra });
const ids = (() => {
  let n = 0;
  return () => `custom-new${++n}`;
})();

test("файл: сохранить и загрузить обратно — ловушки те же", () => {
  const traps = [mine("custom-a", "Огненная пасть"), mine("custom-b", "Плесень", { natural: true, everyTurn: true })];
  const pack = packTraps(traps, { system: "pf2e", module: "0.2.0", now: new Date("2026-11-07T00:00:00Z") });
  assert.equal(pack.format, FILE_FORMAT);
  assert.equal(pack.version, 1);
  assert.equal(pack.system, "pf2e");
  assert.equal(pack.exported, "2026-11-07T00:00:00.000Z");
  const read = readPack(JSON.stringify(pack), { system: "pf2e", own: {}, makeId: ids });
  assert.equal(read.ok, true);
  assert.deepEqual(read.items.map((x) => x.status), ["new", "new"]);
  assert.deepEqual(read.items.map((x) => x.trap), traps, "id и все поля сохранились");
});

test("файл: своя ловушка с тем же id — заменит, повтор в файле — новый id", () => {
  const pack = packTraps([mine("custom-a", "А"), mine("custom-a", "А ещё раз"), mine("pit", "Из библиотеки")], { system: "pf2e" });
  const read = readPack(pack, { system: "pf2e", own: { "custom-a": {} }, makeId: ids });
  const [a, again, pit] = read.items;
  assert.equal(a.status, "replace");
  assert.equal(a.trap.id, "custom-a");
  assert.equal(again.status, "new");
  assert.notEqual(again.trap.id, "custom-a");
  assert.match(pit.trap.id, /^custom-/, "не свой id (встроенной ловушки) заменяется новым");
  assert.equal(pit.status, "new");
});

test("файл: чужая система, без названия, не наш файл, битый JSON", () => {
  const dnd = packTraps([mine("custom-a", "А")], { system: "dnd5e" });
  const other = readPack(dnd, { system: "pf2e" });
  assert.equal(other.ok, true);
  assert.equal(other.system, "dnd5e");
  assert.deepEqual(other.items.map((x) => [x.status, x.reason]), [["skip", "system"]]);
  const noName = readPack(packTraps([mine("custom-a", "")], { system: "pf2e" }), { system: "pf2e" });
  assert.deepEqual(noName.items.map((x) => [x.status, x.reason]), [["skip", "empty"]]);
  assert.deepEqual(readPack("{не json", { system: "pf2e" }), { ok: false, reason: "json" });
  assert.deepEqual(readPack(JSON.stringify({ traps: [] }), { system: "pf2e" }), { ok: false, reason: "format" });
  assert.deepEqual(readPack(JSON.stringify({ format: FILE_FORMAT, traps: "нет" }), { system: "pf2e" }), { ok: false, reason: "format" });
  // Мусор внутри ловушки приводится к норме, а не ломает загрузку.
  const junk = readPack(JSON.stringify({ format: FILE_FORMAT, system: "pf2e", traps: [{ id: "custom-z", name: "Ж", damage: "rm -rf", severity: "x" }] }), { system: "pf2e" });
  assert.equal(junk.items[0].trap.damage, "");
  assert.equal(junk.items[0].trap.severity, "dangerous");
});

test("имя файла: без запрещённых символов", () => {
  assert.equal(fileName("Западня — мои ловушки"), "Западня — мои ловушки.json");
  assert.equal(fileName('a/b:c*d?"e<f>g|h'), "abcdefgh.json");
  assert.equal(fileName("   "), "traps.json");
});

test("файл: картинки с сервера вкладываются, ссылки остаются ссылками", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const traps = [mine("custom-a", "С картинкой", { image: "worlds/w/ssl-traps/mold.webp" }), mine("custom-b", "Со ссылкой", { image: "https://example.com/a.png" })];
  const pack = packTraps(traps, { system: "pf2e", images: { "custom-a": { name: "mold.webp", data: png }, "custom-x": { name: "чужая", data: png }, "custom-b": { name: "a", data: "не картинка" } } });
  assert.deepEqual(Object.keys(pack.images), ["custom-a"], "только для своих ловушек и только настоящие картинки");
  const read = readPack(JSON.stringify(pack), { system: "pf2e" });
  assert.deepEqual(read.items[0].image, { name: "mold.webp", data: png });
  assert.equal(read.items[1].image, null);
  assert.equal(read.items[1].trap.image, "https://example.com/a.png");
  assert.equal(packTraps(traps, { system: "pf2e" }).images, undefined, "без картинок — без раздела images");
});

test("имя картинки для сервера", async () => {
  const { safeName } = await import("../scripts/core/share.mjs");
  assert.equal(safeName("worlds/x/Бурая плесень.webp"), "image.webp");
  assert.equal(safeName("a b.PNG"), "a-b.png");
  assert.equal(safeName("../../evil"), "evil.webp");
  assert.equal(safeName("mold_2.jpeg"), "mold_2.jpeg");
  assert.equal(safeName(undefined), "image.webp");
});
