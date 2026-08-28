# Integrating the shared engine into a book project

This repo holds the shared, dependency-free toolkit used across the book
projects (`renderman_guide`/`pxrsurface-guide`, `lookdev_book`,
`pipeline_book`, `raytracing_book`, and any future one). It's plain static
files — no npm, no bundler, no build step — meant to be **copied** into a
book's own `assets/` folder, not referenced across repos at runtime (each
book deploys independently to its own GitHub Pages site, so a cross-repo
relative path wouldn't resolve anyway).

## The three tools, and when to reach for each

| Tool | File(s) | Use for |
|---|---|---|
| WebGL2/Canvas2D physics engine | `assets/js/viz.js` | A lit sphere rendering real BRDF/Fresnel/thin-film math live; Canvas2D plots (NDF curves, polar lobes, falloff profiles) with drag/slider controls. Reach for this when the point is *"look at what this actually renders like."* |
| SVG + slider diagrams | see `../patterns/svg-slider-widget.md` | A 2D geometric/algorithmic relationship that changes shape with a parameter — ray/plane geometry, angle relationships, threshold effects, sample-count convergence. Cheap, no shared runtime needed, proven at scale in `raytracing_book` (26 instances). |
| Formula modals + symbol tooltips | `assets/js/interactive.js` | "Explain this formula" expandable panels, and hover/tap/keyboard tooltips on inline vector/variable symbols (`.vec[data-tip]`). Proven at scale in `raytracing_book` (272 tooltips). |

They compose freely on the same page. None of them require the other two.

## Copying in

Copy whichever of `assets/js/viz.js`, `assets/js/i18n.js`,
`assets/js/interactive.js`, and `assets/css/widgets.css` your book actually
needs into its own `assets/js/` and `assets/css/`. Check `CHANGELOG.md` in
this repo before re-copying an update, so you know what changed.

## The CSS token contract (`viz.js` / `widgets.css`)

`viz.js`'s `theme()` function and `widgets.css`'s component rules read these
custom properties from whatever stylesheet your book already loads:

```
--text        --text-muted    --border      --accent
--viz-a       --viz-b         --viz-grid    --viz-bg
```

If your book's palette uses different names, alias them once — don't edit
`viz.js` or `widgets.css` to rename what they read. Worked example, mapping
the `raytracing_book`/`pipeline_book`/`lookdev_book` trilogy's actual tokens
onto this contract:

```css
:root {
  --text-muted: var(--text-dim);
  --accent:     var(--amber);      /* or --raster — your call */
  --viz-a:      var(--violet);
  --viz-b:      var(--cyan);
  --viz-grid:   var(--border);
  --viz-bg:     var(--bg-panel-alt);
}
```

`--text` and `--border` already match by name in that trilogy — nothing to
do for those two.

Some `viz.js` widgets also use an `--arnold`/`--pxr`-style *renderer-pair*
color convention for split-sphere comparisons (warm = "one side," cool =
"the other side"). This is optional and only needed if you build a
two-renderer or two-model comparison widget — don't invent tokens for it
speculatively; add them when you actually build that widget.

If your book has a light/dark split (like `renderman_guide`) and the
trilogy doesn't, that's fine — `widgets.css` has no
`prefers-color-scheme` opinions of its own; put any light/dark variants of
your aliases in your own stylesheet.

## The i18n contract (`i18n.js`)

Nothing in `i18n.js` is book-specific — it reads its configuration entirely
from two optional attributes on `<html>`:

```html
<html lang="pl" data-lang="pl"
      data-i18n-storage="ldb-lang"
      data-i18n-default="pl">
```

- `data-i18n-storage` — the `localStorage` key this book's language choice
  is saved under. **Pick a short, book-specific value** (e.g. `ldb-lang` for
  lookdev_book, `rtb-lang` for raytracing_book) so two of these sites open
  in the same browser don't collide. Omitting it falls back to the neutral
  `'i18n-lang'` — fine for a single book, but pick an explicit one once more
  than one bilingual book exists, to avoid exactly that collision.
- `data-i18n-default` — `'en'` or `'pl'`, the language a first-time visitor
  gets when their browser locale matches neither. Omitting it defaults to
  `'en'`.

Every bilingual page's `<title>` must author **both** variants explicitly —
there's no auto-derivation from the bare tag text:

```html
<title data-title-en="Chapter title" data-title-pl="Tytuł rozdziału">Tytuł rozdziału</title>
```

(The bare text between the tags is what search engines and non-JS visitors
see — set it to whichever language your book actually defaults to.)

### The pre-paint script

`i18n.js` runs as an ES module, which loads after first paint — without
something running earlier, a returning visitor whose stored preference
differs from the page's bare `lang` attribute would see a flash of the
wrong language. Every bilingual page needs this inline, synchronous script
in `<head>`, **before** the stylesheet or module script, with the two
attribute names matched to whatever you set on `<html>`:

```html
<script>
(function () {
  var d = document.documentElement, l = null;
  var storeKey = d.dataset.i18nStorage || 'i18n-lang';
  var fallback = d.dataset.i18nDefault === 'pl' ? 'pl' : 'en';
  try { l = new URLSearchParams(location.search).get('lang') || localStorage.getItem(storeKey); } catch (e) {}
  if (l !== 'en' && l !== 'pl') l = (navigator.language || '').toLowerCase().indexOf('pl') === 0 ? 'pl' : fallback;
  d.setAttribute('data-lang', l); d.lang = l; d.classList.add('js');
})();
</script>
```

This is intentionally duplicated logic (it can't import `i18n.js`, since
the whole point is running before any module loads) — keep the two in sync
if you ever change the language-selection priority.

### The language switch button

Drop this into your book's nav (matches the `.topnav`/`.topnav__brand`
convention already used by all four current book projects):

```html
<div class="lang-switch" role="group" aria-label="Language / Język">
  <button type="button" data-set-lang="pl" class="is-active" aria-pressed="true">PL</button>
  <button type="button" data-set-lang="en" aria-pressed="false">EN</button>
</div>
```

Swap which button starts `is-active`/`aria-pressed="true"` to match your
`data-i18n-default`. Add the `topnav--i18n` modifier class to the `<nav>`
it lives in — `widgets.css` uses that class to keep the switch pinned
top-right instead of wrapping under a long link list.

## The bilingual content rule

Every translatable block ships **twice**, as `lang="en"`/`lang="pl"`
sibling elements — never as one element with mixed-language content:

```html
<p lang="en">Roughness widens the highlight.</p>
<p lang="pl">Roughness poszerza rozbłysk.</p>
```

Real parameter/node/formula-symbol names — anything that's a literal name
from the actual software or notation, not prose — stay as a single
unwrapped node, shown identically regardless of language, never duplicated
or translated. This isn't a new rule: it's each book's own existing
authoring discipline for renderer parameter names and formula symbols
("define the symbol the first time it appears"), just extended to the
widget layer.

## Verification checklist

- Toggle the language switch (or load with `?lang=pl` / `?lang=en`) and
  confirm there's no flash of the wrong language before the page settles —
  that's the pre-paint script's entire job.
- **Balance-check every bilingual page**: count `lang="en"` occurrences vs
  `lang="pl"` occurrences. They won't be exactly equal — the `<html>` tag's
  `data-lang` and the two switch buttons each nudge the count on one side
  without a matching nudge on the other — but any *other* imbalance is
  almost certainly a missing translation. This exact method caught three
  real missing-translation bugs in `renderman_guide`'s rollout that
  otherwise looked completely fine in the browser (the page rendered
  correctly in one language and only broke when a reader actually switched).
  Don't skip this check just because a page "looks fine."
- Disable WebGL in the browser (if using `viz.js`) and confirm
  `.viz__fallback` renders instead of a blank canvas, and the surrounding
  prose still reads as a complete argument without the widget.
- Confirm `prefers-reduced-motion: reduce` still suppresses any animation
  loop.
