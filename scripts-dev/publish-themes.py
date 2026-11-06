#!/usr/bin/env python3
"""Самодостаточная страница «Оформления «Западни»» для публикации на claude.ai.

    python3 scripts-dev/publish-themes.py <dom.html> <fa-dir> <out.html>

dom.html — снимок dev/design/themes.html?snapshot=1 (headless Chrome --dump-dom),
fa-dir    — all.min.css и fa-solid-900.woff2 из Font Awesome Free 6.5.2.
Внешних стилей на странице нет, кроме Google Fonts: стили модуля и нужные значки вшиты.
"""

import base64
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
THEMES = [
    ("dungeon", "Подземелье"),
    ("blueprint", "Чертёж"),
    ("heroic", "Героический"),
    ("engraving", "Гравюра"),
    ("reference", "Справочник"),
]
FONTS = (
    "https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,700;1,400&family=Alegreya+SC:wght@500;700"
    "&family=Alegreya+Sans:wght@400;500;700&family=Caveat:wght@500;600&family=Cormorant+SC:wght@600;700"
    "&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;600&family=Kurale"
    "&family=PT+Sans:ital,wght@0,400;0,700;1,400&family=PT+Sans+Narrow:wght@700&display=swap"
)


def element(html, start_marker):
    """Элемент <div …> целиком, начиная с маркера (счёт вложенных div)."""
    start = html.index(start_marker)
    depth = 0
    for m in re.finditer(r"<(/?)div\b", html[start:]):
        depth += -1 if m.group(1) else 1
        if depth == 0:
            end = html.index(">", start + m.end()) + 1
            return html[start:end]
    raise ValueError(f"не закрыт {start_marker}")


def inner(html):
    return html[html.index(">") + 1 : html.rindex("<")]


def fa_css(fa_dir, used):
    css = open(os.path.join(fa_dir, "all.min.css"), encoding="utf8").read()
    font = base64.b64encode(open(os.path.join(fa_dir, "fa-solid-900.woff2"), "rb").read()).decode()
    rules = []
    found = set()
    for sels, code in re.findall(r"((?:\.fa-[a-z0-9-]+:before,?)+)\{content:\"(\\[0-9a-f]+)\"\}", css):
        for name in re.findall(r"\.fa-([a-z0-9-]+):before", sels):
            if name in used and name not in found:
                found.add(name)
                rules.append(f'.fa-{name}::before{{content:"{code}"}}')
    missing = sorted(used - found)
    if missing:
        print("нет в Font Awesome:", ", ".join(missing))
    head = (
        '@font-face{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:900;font-display:block;'
        f'src:url(data:font/woff2;base64,{font}) format("woff2")}}\n'
        '.fa-solid{font-family:"Font Awesome 6 Free";font-weight:900;font-style:normal;font-variant:normal;'
        "display:inline-block;line-height:1;text-rendering:auto;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}\n"
    )
    return head + "\n".join(rules)


PAGE_CSS = """
/* Тёмная витрина: страница — нейтральная подложка, чтобы пять оформлений сравнивались честно. */
:root {
  --bg: #111013;
  --bar: #19181c;
  --panel: #1b1a1e;
  --line: #34323a;
  --ink: #ecebef;
  --muted: #b3b1bb;
  --accent: #e6a83c;
  --chat: #19181b;
  --msg: #222126;
  --msg-line: #2d2c32;
  --chat-light: #dcdcd8;
  --msg-light: #ebebe8;
  --msg-light-line: #d3d3cf;
  --msg-light-ink: #4d4d53;
  --whisper: #c29bf0;
  --font-ui: system-ui, -apple-system, "Segoe UI", sans-serif;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: calc(env(safe-area-inset-top, 0px) + 120px); }
body {
  background: var(--bg);
  color: var(--ink);
  font: 14px/1.45 var(--font-ui);
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 0 56px;
}
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--bar); }
.bar {
  position: sticky;
  top: env(safe-area-inset-top, 0px);
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  justify-content: space-between;
  align-items: center;
  margin-left: calc(-1 * max(16px, env(safe-area-inset-left, 0px)));
  margin-right: calc(-1 * max(16px, env(safe-area-inset-right, 0px)));
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-block: 10px;
  background: var(--bar);
  border-bottom: 1px solid var(--line);
}
.bar-title { min-width: 0; }
.bar-title b { display: block; font-size: 15px; }
.bar-title small { color: var(--muted); }
.switch { display: flex; flex-wrap: wrap; gap: 6px; }
.switch a { display: inline-flex; align-items: center; justify-content: center; padding: 7px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--ink); text-decoration: none; transition: border-color 150ms cubic-bezier(0.22, 1, 0.36, 1); }
.switch a:hover { border-color: #5a5763; }
.switch a[aria-current="true"] { border-color: var(--accent); color: var(--accent); }
.switch a:focus-visible, .cmp > a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
main { max-width: 1760px; margin: 0 auto; }
section, .pane { padding-top: 22px; }
h2 { margin: 0 0 4px; font-size: 20px; text-wrap: balance; }
.lead { margin: 0 0 14px; max-width: 75ch; color: var(--muted); text-wrap: pretty; }
.compare { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; }
.cmp { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.cmp > a { display: flex; flex-direction: column; gap: 2px; color: var(--ink); text-decoration: none; }
.cmp > a b { font-size: 15px; }
.cmp > a span { color: var(--muted); font-size: 12.5px; }
.cmp > a:hover b { color: var(--accent); }
.cmp .mini { border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.cmp .mini .st-scroll { overflow: visible; padding: 12px; }
.mini-chat { padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--chat); }
.detail-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px; }
.facts { display: grid; grid-template-columns: max-content minmax(0, 75ch); gap: 3px 16px; margin: 0 0 12px; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; min-width: 0; }
.swatches { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
.swatch { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px 3px 3px; border: 1px solid var(--line); border-radius: 6px; font: 11.5px ui-monospace, Menlo, monospace; color: var(--muted); }
.swatch i { width: 18px; height: 18px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.14); }
.detail-body { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start; }
figure { margin: 0; min-width: 0; }
figcaption { margin: 0 0 6px; color: var(--muted); font-size: 13px; }
.frame { width: 780px; max-width: 100%; height: 700px; display: flex; flex-direction: column; border: 1px solid var(--st-line); border-radius: 8px; overflow: hidden; box-shadow: 0 14px 44px rgb(0 0 0 / 0.55); }
.frame .window-header { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px 0 12px; flex: 0 0 auto; background: var(--st-bg-2); border-bottom: 1px solid var(--st-line); color: var(--st-ink); }
.frame .window-header h1 { flex: 1; margin: 0; font-size: 14px; font-weight: 600; font-family: var(--font-ui); }
.frame .window-content { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.frame .window-content > * { flex: 1; min-height: 0; }
.chat { width: 320px; max-width: 100%; padding: 8px; display: grid; gap: 8px; background: var(--chat); border: 1px solid var(--line); border-radius: 8px; }
.msg { padding: 6px 7px 7px; background: var(--msg); border: 1px solid var(--msg-line); border-radius: 6px; }
.msg > header { display: flex; justify-content: space-between; margin-bottom: 4px; color: var(--muted); font-size: 12px; }
.msg > header .whisper { color: var(--whisper); }
.chat.light-chat, .mini-chat.light-chat { background: var(--chat-light); }
.light-chat .msg { background: var(--msg-light); border-color: var(--msg-light-line); }
.light-chat .msg > header { color: var(--msg-light-ink); }
@media (max-width: 760px) {
  .switch { width: 100%; }
  .switch a { flex: 1 1 auto; }
  .facts { grid-template-columns: minmax(0, 1fr); }
  .facts dt { margin-top: 6px; }
  .detail-body, .detail-body figure { width: 100%; }
  .frame { width: 100%; height: 640px; }
  .chat { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  * { transition: none !important; }
}
"""

SCRIPT = """
<script>
(() => {
  const ids = %s;
  const pick = (raw) => {
    const id = ids.includes(raw) ? raw : ids[0];
    for (const p of document.querySelectorAll("[data-pane]")) p.hidden = p.dataset.pane !== id;
    for (const a of document.querySelectorAll("[data-link]")) a.setAttribute("aria-current", String(a.dataset.link === id));
  };
  addEventListener("hashchange", () => pick(location.hash.slice(1)));
  pick(location.hash.slice(1));
})();
</script>
"""


def main(dom_path, fa_dir, out_path):
    dom = open(dom_path, encoding="utf8").read()
    compare = inner(element(dom, '<div class="compare" id="compare-grid">'))
    panes = inner(element(dom, '<div id="panes">'))

    # Сравнение: кнопки выбора → ссылки на раздел оформления.
    compare = re.sub(r'<button type="button" data-pick="(\w+)">(.*?)</button>', r'<a href="#\1" data-link="\1">\2</a>', compare, flags=re.S)
    # Разделы: якорь = id оформления, заголовок раздела — без «Подробно:».
    for theme, _ in THEMES:
        panes = panes.replace(f'class="pane" data-pane="{theme}"', f'class="pane" data-pane="{theme}" id="{theme}"', 1)
    panes = panes.replace("Подробно: ", "")
    if "<script" in compare + panes:
        raise SystemExit("в снимке остался скрипт")

    body = compare + panes
    used = set(re.findall(r"\bfa-([a-z0-9-]+)", body)) - {"solid"}
    used |= {"skull-crossbones", "xmark"}
    module_css = "".join(open(os.path.join(ROOT, p), encoding="utf8").read() for p in ("styles/traps.css", "styles/theme-heroic.css", "dev/design/variants.css"))

    switch = "".join(f'<a href="#{t}" data-link="{t}">{name}</a>' for t, name in THEMES)
    page = f"""<title>Оформления «Западни»</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="{FONTS}">
<style>
{PAGE_CSS}
{fa_css(fa_dir, used)}
{module_css}
</style>
<header class="bar">
  <div class="bar-title">
    <b>Западня · пять оформлений</b>
    <small>Одна разметка модуля, пять тем. Шрифты и цвета — те, что поедут в модуль.</small>
  </div>
  <nav class="switch" aria-label="Оформление">{switch}</nav>
</header>
<main>
  <section>
    <h2>Рядом</h2>
    <p class="lead">Одна ловушка в библиотеке и одна карточка в чате — во всех пяти вариантах. Нажмите на название, чтобы открыть оформление целиком.</p>
    <div class="compare">{compare}</div>
  </section>
  {panes}
</main>
{SCRIPT % [t for t, _ in THEMES]}
"""
    page = page.replace("['dungeon', 'blueprint', 'heroic', 'engraving', 'reference']", '["dungeon","blueprint","heroic","engraving","reference"]')
    open(out_path, "w", encoding="utf8").write(page)
    print(f"{out_path}: {len(page.encode()) // 1024} КБ, значков {len(used)}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
