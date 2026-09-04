# CLAUDE.md

Wskazówki dla sesji Claude Code pracujących nad tą książką.

## Czym jest ten projekt

„Gamedev w VFX" — polska, statyczna książka HTML o przenoszeniu workflow i patentów z produkcji
gier do pipeline'u VFX. Czytelnik to artysta techniczny po stronie filmowej (albo osoba
przechodząca z gier do VFX), który zna DCC i pipeline, ale niekoniecznie wie, dlaczego gamedev
robi pewne rzeczy inaczej. 28 rozdziałów głównych w siedmiu częściach, budowanych liniowo, plus
dodatki A–N rozwijające pojedynczy mechanizm. Siostrzany projekt `pipeline-book` i
`raytracing-book`, z których wzięty jest system wizualny.

Punkt ciężkości książki leży na **assetach** — tak zamówił autor. Rendering, pipeline i dane są
pełnoprawną, ale drugą połową. Rozdział 27 („Czego nie przenosić") jest częścią tezy, nie
dodatkiem grzecznościowym: książka nie ma być reklamą gamedevu.

## Brak systemu budowania

Czysty statyczny HTML/CSS z inline'owanym SVG — bez npm, bez bundlera, bez testów, bez lintera.
Żeby „uruchomić" stronę, otwierasz plik w przeglądarce albo serwujesz katalog dowolnym serwerem
statycznym. Deploy przez GitHub Pages z `main` / `/(root)`.

## Struktura

```
index.html                            — spis treści, tylko w korzeniu
rozdzialy/rozdzial-NN-slug.html       — 28 rozdziałów, NN z zerem wiodącym 01–28
dodatki/dodatek-x-slug.html           — 14 dodatków, x = a–n
assets/style.css                      — wspólny dark theme, kopia z pipeline-book,
                                        od teraz ewoluuje niezależnie
assets/interactive.js                 — modale formuł + dymki `.vec[data-tip]`,
                                        kopia z repo learning-materials, jeszcze nieużywana
dev/spis.json                         — źródło prawdy o tytułach, zajawkach i strukturze
dev/scaffold.py                       — generator brakujących stron
```

Każda strona linkuje `assets/style.css` i trzyma własny `<link>` do Google Fonts inline, dokładnie
jak w `pipeline-book`.

## Generator (`dev/scaffold.py`)

- `python3 dev/scaffold.py` dopisuje wyłącznie **brakujące** strony. Napisany rozdział jest
  bezpieczny — skrypt go pomija.
- `--index` przebudowuje `index.html` z `spis.json`. Używaj tego świadomie: **`index.html` jest po
  pierwszym wygenerowaniu utrzymywany ręcznie** (ma własny wstęp i panel „Stan książki"), więc
  przebudowa go nadpisze. Przy zwykłym dopisywaniu rozdziału edytuj `index.html` ręcznie.
- `--force` nadpisuje wszystko, łącznie z napisaną treścią. Praktycznie nigdy nie jest potrzebne.

Po zmianie tytułu albo zajawki aktualizuj `spis.json` **i** odpowiadające miejsca w `index.html`
oraz `.subtitle` na stronie rozdziału — te trzy muszą się zgadzać.

## System wizualny — odziedziczony, przesłownikowany

Ta sama mechanika CSS co w `pipeline-book`/`raytracing-book` (`.viewport-readout`, `.panel`,
`.eyebrow`, `.diagram-frame`, `.site-nav`, `.worked`, kolory `--amber/--cyan/--violet/--raster`).
Zmienia się tylko *słownictwo* w środku:

- `.viewport-readout` (pasek HUD na górze) → liczby budżetowe zamiast stanu kamery, np.
  `TRIM · 2048×2048` `POKRYCIE · 46 elementów` `UNIKALNYCH MAP · 1`. Dobierane per rozdział, nie z
  jednego szablonu — mają czytać się jak odczyt z profilera albo z panelu importu assetu.
- `.section-eyebrow` → „Etap: …", jak w `pipeline-book`.
- `.diagram-hud` → nazwy jak z narzędzia: `Trim.layout`, `Frame.budget`, `LOD.chain`.

**Mapowanie kolorów jest ustalone i obowiązuje w całej książce** (odpowiednik decyzji, którą
`pipeline-book` podejmuje w swoim CLAUDE.md):

- `--amber` (`.term-amber`) — strona gamedevu / real-time: budżet klatki, silnik, GPU.
- `--cyan` (`.term-cyan`) — strona VFX / offline: farma, path tracer, render finalny.
- `--violet` (`.term-violet`) — **przenoszony patent sam w sobie** — teza, wniosek, reguła
  decyzyjna. To kolor, którym książka mówi „o to właśnie chodzi".
- `--raster` — akcent pomocniczy w diagramach, bez znaczenia semantycznego.

Trzymaj się tego mapowania także w inline'owanym SVG: gamedev bursztynowy, VFX cyjanowy,
strzałka „to się przenosi" fioletowa.

## Zasady pisania treści

- **Rozdział zaczyna się od panelu `TL;DR` z trzema punktami** i kończy `.panel.glossary` +
  `.next` („Co dalej"), tak jak w `pipeline-book`.
- **Liczby muszą być prawdziwe i policzalne.** Rachunki wstawiaj w blok `.worked`, z jawnym
  działaniem, żeby czytelnik mógł podstawić własne wartości. Nie podawaj liczb, których nie da
  się wyprowadzić z podanych założeń.
- **Nie deklaruj wersji oprogramowania**, jeśli nie są konieczne do sensu zdania — książka ma
  przeżyć kilka wydań Unreala i Houdiniego.
- **Każdy patent dostaje granicę.** Rozdział, który mówi tylko, kiedy coś działa, jest napisany w
  połowie: sekcja o tym, gdzie technika przestaje wystarczać, jest obowiązkowa.
- **Odsyłacze po numerach, nie po nazwach plików.** „Rozdział 6", „Dodatek B" — nazwa pliku może
  się zmienić, numeracja w prozie nie.
- **Nie przenumerowuj rozdziałów ani nie zmieniaj liter dodatków bez pytania** — odwołania w
  prozie są rozsiane po innych plikach i renumeracja cicho je psuje.
- **Każdy dodatek ma w `.viewport-readout` token `EXT OF`** wskazujący rozwijany rozdział; to
  źródło prawdy o powiązaniu, nie tytuł.
- **Stub → rozdział**: przy pisaniu treści usuń panel `.panel.practice` „W przygotowaniu" w
  całości, zachowaj `.site-nav`, zaktualizuj panel „Stan książki" w `index.html`.
- Polskie znaki diakrytyczne w treści zawsze pełne i poprawne; **komunikaty commitów bez
  diakrytyków** (ASCII), tak jak w pozostałych repo tej serii.

## Weryfikacja

Nie ma testów, więc sprawdzenie jest ręczne i minimalne:

1. Otwórz zmienioną stronę w przeglądarce (albo `python3 -m http.server` w korzeniu).
2. Sprawdź, że wszystkie linki względne prowadzą do istniejących plików — najprościej skryptem
   grepującym `href="` i porównującym ze stanem katalogu.
3. Sprawdź, że SVG renderuje się w obu szerokościach (desktop i ~380 px) — diagramy mają
   `viewBox`, więc skalują się same, ale tekst potrafi się zlać.
