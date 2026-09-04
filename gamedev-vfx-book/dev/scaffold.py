#!/usr/bin/env python3
"""Generuje szkielety stron książki z dev/spis.json.

Domyślnie NIE nadpisuje istniejących plików — napisany rozdział jest
bezpieczny. Do wygenerowania brakujących stron po dopisaniu pozycji do
spisu wystarczy uruchomić skrypt ponownie:

    python3 dev/scaffold.py            # tylko brakujące pliki
    python3 dev/scaffold.py --index    # dodatkowo przebuduj index.html
    python3 dev/scaffold.py --force    # nadpisz wszystko (uwaga!)

index.html jest generowany wyłącznie na żądanie (--index) i po pierwszym
wygenerowaniu jest utrzymywany ręcznie — patrz CLAUDE.md.
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPIS = json.loads((ROOT / "dev" / "spis.json").read_text(encoding="utf-8"))

FONTS = (
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700'
    "&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap\" "
    'rel="stylesheet">'
)

BRAND = SPIS["ksiazka"]["brand_prefix"]
BRAND_SUFFIX = SPIS["ksiazka"]["brand_suffix"]

W_PRZYGOTOWANIU = """  <div class="panel practice">
    <div class="panel-label">W przygotowaniu</div>
    <p>Ten rozdział ma już ustalone miejsce w książce, tytuł i zakres — treść powstaje sesja po sesji. Jeśli trafiłeś tu z spisu treści, wróć za jakiś czas albo zajrzyj do rozdziałów, które są już napisane.</p>
  </div>
"""


def ch_file(ch):
    return f"rozdzial-{ch['nr']:02d}-{ch['slug']}.html"


def dod_file(d):
    slug = d.get("slug") or slugify(d["tytul"])
    return f"dodatek-{d['litera']}-{slug}.html"


def slugify(text):
    table = str.maketrans("ąćęłńóśźż ", "acelnoszz-")
    out = text.lower().translate(table)
    return "".join(c for c in out if c.isalnum() or c == "-").strip("-")


def chapter_page(ch, prev_ch, next_ch):
    prev_link = (
        f'<a href="{ch_file(prev_ch)}">← R.{prev_ch["nr"]}</a>'
        if prev_ch
        else '<a href="../index.html">Spis treści</a>'
    )
    next_link = (
        f'<a href="{ch_file(next_ch)}">R.{next_ch["nr"]} →</a>'
        if next_ch
        else '<a href="../index.html">Spis treści</a>'
    )
    nav_prev = (
        f'<a class="nav-prev" href="{ch_file(prev_ch)}">← Poprzedni</a>'
        if prev_ch
        else '<span class="nav-prev"></span>'
    )
    nav_next = (
        f'<a class="nav-next" href="{ch_file(next_ch)}">Następny →</a>'
        if next_ch
        else '<span class="nav-next"></span>'
    )
    readout = "".join(f"<span>{tok}</span>" for tok in ch["readout"])
    return f"""<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rozdział {ch['nr']} — {ch['tytul']}</title>
{FONTS}
<link rel="stylesheet" href="../assets/style.css">
</head>
<body>

<nav class="topnav">
  <a class="topnav__brand" href="../index.html">{BRAND} <span>{BRAND_SUFFIX}</span></a>
  <div class="topnav__links">
    {prev_link}
    <a href="../index.html">Spis treści</a>
    {next_link}
  </div>
</nav>
<div class="page">

  <div class="viewport-readout">
    {readout}
  </div>

  <div class="eyebrow">Rozdział {ch['nr']} / {ch['eyebrow']}</div>
  <h1>{ch['tytul']}</h1>
  <p class="subtitle">{ch['hook']}</p>

{W_PRZYGOTOWANIU}
<div class="site-nav chapter-nav">
    {nav_prev}
    <a class="nav-toc" href="../index.html">Spis treści</a>
    {nav_next}
</div>
</div>
</body>
</html>
"""


def dodatek_page(d, prev_d, next_d, chapters):
    ext = chapters[d["ext"]]
    litera = d["litera"].upper()
    prev_link = (
        f'<a href="{dod_file(prev_d)}">← Dod. {prev_d["litera"].upper()}</a>'
        if prev_d
        else '<a href="../index.html">Spis treści</a>'
    )
    next_link = (
        f'<a href="{dod_file(next_d)}">Dod. {next_d["litera"].upper()} →</a>'
        if next_d
        else '<a href="../index.html">Spis treści</a>'
    )
    return f"""<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dodatek {litera} — {d['tytul']}</title>
{FONTS}
<link rel="stylesheet" href="../assets/style.css">
</head>
<body>

<nav class="topnav">
  <a class="topnav__brand" href="../index.html">{BRAND} <span>{BRAND_SUFFIX}</span></a>
  <div class="topnav__links">
    {prev_link}
    <a href="../index.html">Spis treści</a>
    <a href="../rozdzialy/{ch_file(ext)}">↑ R.{ext['nr']}</a>
    {next_link}
  </div>
</nav>
<div class="page">

  <div class="viewport-readout">
    <span>DODATEK · {litera}</span><span>ROZWIJA · {d['eyebrow'].replace('Głębiej: ', '')}</span><span>EXT OF · Rozdział {ext['nr']}</span>
  </div>

  <div class="eyebrow">Dodatek {litera} / {d['eyebrow']}</div>
  <h1>{d['tytul']}</h1>
  <p class="subtitle">{d['hook']}</p>

{W_PRZYGOTOWANIU}
<div class="site-nav">
    <a href="../index.html">← Spis treści</a>
    <a href="../rozdzialy/{ch_file(ext)}">↑ Rozdział {ext['nr']}: {ext['tytul']}</a>
</div>
</div>
</body>
</html>
"""


def index_page():
    chapters = SPIS["rozdzialy"]
    parts = []
    for czesc in SPIS["czesci"]:
        lo, hi = czesc["zakres"]
        rows = "\n".join(
            f'      <a class="index-row" href="rozdzialy/{ch_file(c)}">'
            f'<span class="index-num">Rozdział {c["nr"]}</span>'
            f'<span class="index-title">{c["tytul"]}</span>'
            f'<span class="index-hook">{c["hook"]}</span></a>'
            for c in chapters
            if lo <= c["nr"] <= hi
        )
        parts.append(
            f'  <div class="part">\n    <div class="part-label">{czesc["label"]}</div>\n'
            f'    <div class="index-list">\n{rows}\n    </div>\n  </div>'
        )

    by_nr = {c["nr"]: c for c in chapters}
    dod_rows = "\n".join(
        f'      <a class="index-row" href="dodatki/{dod_file(d)}">'
        f'<span class="index-num">Dodatek {d["litera"].upper()} · rozwija R.{d["ext"]}</span>'
        f'<span class="index-title">{d["tytul"]}</span>'
        f'<span class="index-hook">{d["hook"]}</span></a>'
        for d in SPIS["dodatki"]
    )
    parts.append(
        '  <div class="part">\n    <div class="part-label violet">Dodatki A–'
        f'{SPIS["dodatki"][-1]["litera"].upper()} · głębiej w konkretny mechanizm</div>\n'
        f'    <div class="index-list">\n{dod_rows}\n    </div>\n  </div>'
    )
    assert by_nr  # spis musi zawierać rozdziały

    first = chapters[0]
    return f"""<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{SPIS['ksiazka']['tytul']} — Spis treści</title>
{FONTS}
<link rel="stylesheet" href="assets/style.css">
<style>
.page{{max-width:920px;padding:64px 24px 120px;}}
h1{{line-height:1.1;}}
.subtitle{{margin:0 0 40px;}}
</style>
</head>
<body>

<nav class="topnav">
  <a class="topnav__brand" href="index.html">{BRAND} <span>{BRAND_SUFFIX}</span></a>
  <div class="topnav__links">
    <a href="rozdzialy/{ch_file(first)}">R.1 →</a>
  </div>
</nav>
<div class="page">

  <div class="eyebrow">Gamedev w VFX / Spis treści</div>
  <h1>{SPIS['ksiazka']['tytul']}</h1>
  <p class="subtitle">{SPIS['ksiazka']['podtytul']}</p>

{chr(10).join(parts)}

</div>
</body>
</html>
"""


def main():
    force = "--force" in sys.argv
    chapters = SPIS["rozdzialy"]
    by_nr = {c["nr"]: c for c in chapters}
    written, skipped = 0, 0

    for i, ch in enumerate(chapters):
        path = ROOT / "rozdzialy" / ch_file(ch)
        if path.exists() and not force:
            skipped += 1
            continue
        prev_ch = chapters[i - 1] if i > 0 else None
        next_ch = chapters[i + 1] if i + 1 < len(chapters) else None
        path.write_text(chapter_page(ch, prev_ch, next_ch), encoding="utf-8")
        written += 1

    dodatki = SPIS["dodatki"]
    for i, d in enumerate(dodatki):
        path = ROOT / "dodatki" / dod_file(d)
        if path.exists() and not force:
            skipped += 1
            continue
        prev_d = dodatki[i - 1] if i > 0 else None
        next_d = dodatki[i + 1] if i + 1 < len(dodatki) else None
        path.write_text(dodatek_page(d, prev_d, next_d, by_nr), encoding="utf-8")
        written += 1

    if "--index" in sys.argv or force:
        (ROOT / "index.html").write_text(index_page(), encoding="utf-8")
        print("index.html: przebudowany")

    print(f"strony: {written} zapisanych, {skipped} pominiętych (istnieją)")


if __name__ == "__main__":
    main()
