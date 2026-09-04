# Gamedev w VFX

Książka HTML o tym, które workflow i patenty z produkcji gier realnie opłaca się przenieść do
pipeline'u VFX — a które tylko dobrze wyglądają na slajdzie. Punkt ciężkości leży na assetach
(trim sheety, atlasy i texel density, modularność, budżety, LOD-y, instancing), druga połowa
dotyczy renderingu i danych (real-time lookdev, baking, parity silnik ↔ path tracer, walidacja
assetów, proceduralność).

28 rozdziałów głównych układa się w siedem części i buduje na sobie liniowo — od jedynej różnicy,
z której wynikają wszystkie pozostałe (budżet klatki), przez autoring assetów, geometrię i
tekstury, po rendering, pipeline i domknięcie. Dodatki A–N schodzą głębiej tam, gdzie rozdział
główny musiał zatrzymać się na ogólnym mechanizmie. Jeden rozdział jest w całości o tym, czego z
gamedevu **nie** przenosić.

Siostrzany projekt [pipeline-book](https://bartoszskrzypiec.github.io/pipeline-book/) i
[raytracing-book](https://bartoszskrzypiec.github.io/raytracing-book/) — ta książka używa tego
samego systemu wizualnego, przemianowanego na słownictwo produkcji assetów.

## Jak to działa

Czyste, statyczne pliki HTML z inline'owanym SVG i wspólnym arkuszem stylów w `assets/style.css`.
Zero zależności, zero build stepu, zero npm — otwierasz plik w przeglądarce (albo całość na
GitHub Pages) i działa.

```
index.html            — spis treści (utrzymywany ręcznie)
rozdzialy/            — rozdziały główne 1–28
dodatki/              — dodatki A–N, każdy rozwija konkretny rozdział
assets/style.css      — wspólny dark theme, skopiowany z pipeline-book
assets/interactive.js — modale formuł + dymki symboli (z learning-materials)
dev/spis.json         — tytuły, zajawki i struktura książki w jednym miejscu
dev/scaffold.py       — generator brakujących szkieletów stron (nie nadpisuje istniejących)
```

## Status projektu

Żywy projekt, nie jednorazowa publikacja. Struktura i spis treści stoją w całości; napisane są
na razie **Rozdział 1** (budżet klatki) i **Rozdział 5** (trim sheety) — reszta stron pokazuje
panel „W przygotowaniu” i jest dopisywana sesja po sesji.

## Publikacja

Docelowo GitHub Pages: Settings → Pages → Deploy from a branch → `main` / `/ (root)`.
Plik `.nojekyll` jest w repo, żeby Pages nie próbowało przepuszczać stron przez Jekylla.
