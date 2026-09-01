# Changelog

Plain dated log, no version numbers — consuming books check this before
re-copying a file to see what changed since their last copy.

## 2026-08-28 — initial promotion

- **`assets/js/viz.js`** — promoted from `pxrsurface-guide`
  (`assets/js/viz.js`, 903 lines) as-is. WebGL2 shaderball, Canvas2D
  plotting, `bindControls`/`onDrag`/`animate`/`makeRng`, and the BRDF/
  Fresnel/thin-film math (`dBeckmann`, `dGGX`, `dFuzzCone`, `dSheen`,
  `fresnelConductor`, `fresnelSchlick`, `fresnelArtistic`, `thinFilmRGB`).
- **`assets/js/i18n.js`** — promoted from `pxrsurface-guide`
  (`assets/js/i18n.js`, 94 lines) with two hardening changes:
  - The `localStorage` key is no longer the hardcoded literal `'rmg-lang'`
    (renderman_guide's own initials) — it now reads
    `document.documentElement.dataset.i18nStorage`, falling back to the
    neutral `'i18n-lang'`.
  - The default-language fallback and `<title>` mechanism no longer assume
    English is the default. The old version auto-derived `data-title-en`
    from the bare `<title>` text, which would silently show the wrong
    title on a Polish-default book. The new version reads
    `data-i18n-default` and requires both `data-title-en` and
    `data-title-pl` to be authored explicitly — no auto-derivation.
  - See `docs/INTEGRATION.md` for the full configuration contract.
- **`assets/js/interactive.js`** — promoted from `raytracing-book`
  (`assets/interactive.js`, 116 lines) as-is — this is the version
  actually wired into 272 live tooltips across that book, not the
  byte-identical but unused copies sitting in `pipeline-book` and
  `lookdev-book`.
- **`assets/css/widgets.css`** — extracted from `pxrsurface-guide`'s
  `assets/css/style.css` lines 449–784, with a new header comment
  documenting the CSS custom-property contract. No rule changes.
- **`patterns/svg-slider-widget.md`** — new. Documents the SVG+slider
  live-diagram recipe proven at scale in `raytracing-book` (26 instances)
  as a template, not a shared library, since each instance is bespoke to
  its own diagram.

## 2026-08-28 — first two consumer pilots, and a CSS contract gap fixed

Surveyed `raytracing_book` and `lookdev_book` for where `viz.js`'s lit-3D
shaderball could be reused (full candidate lists live in each repo's own
`HANDOFF-viz-system.md`), then built exactly one real, working pilot in
each — chosen because both needed **zero changes to `viz.js` itself**,
just a copy-in:

- **`raytracing_book`, rozdział 11 (PBR/GGX)** — added a `MODEL.GGX`
  shaderball right under the chapter's existing D(H) curve, sharing the
  same `#ggxRoughness` slider, so the abstract curve and the rendered
  result move together.
- **`lookdev_book`, rozdział 14 (Dielektryki i metale)** — ported
  `pxrsurface-guide`'s split-sphere metalness widget (Arnold Metalness vs.
  PxrSurface Face/Edge Color) into the chapter's own "Workflow" section,
  translated to this book's monolingual Polish.

Both books copied in `assets/js/viz.js`, `assets/js/i18n.js` (a hard
dependency of `viz.js` even on a monolingual book — it no-ops without a
`[data-set-lang]` element on the page) and `assets/css/widgets.css`
unmodified, then aliased their own CSS tokens onto the contract in their
own `assets/style.css`.

**Real bug found and fixed while doing this**: `docs/INTEGRATION.md`'s CSS
token worked example only listed the 6 custom properties `viz.js`'s *JS*
`theme()` function reads — it missed `--bg-elevated` and `--radius`, which
`widgets.css`'s `.viz`/`.ctl` *CSS* rules also need. Both pilots hit this
gap building against the doc as written; fixed in `docs/INTEGRATION.md` now
so the next consumer doesn't repeat the discovery.

Also added a new "what `createShaderball()` can and can't do" section to
`docs/INTEGRATION.md`, based on a close read of the shader itself: it's a
single analytic sphere with no orbit camera and no real image-based
lighting. A second analytic primitive (e.g. a plane) is a bounded,
moderate addition; a multi-object scene (camera frustums, BVH boxes,
Cornell-box path bounces) is a genuinely different rendering architecture,
not an extension of this module. Written down so the next "can we use this
for X" question doesn't need to re-derive it from the shader source.

## 2026-09-01 — fourth tool: `sky3d.js`, the three.js scene engine

A fifth book exists — **Atmosfera i chmury dla ciekawych**
(`atmosfera_chmury_book`, live at
https://bartoszskrzypiec.github.io/atmosfera_chmury_book/) — and it brought
a genuinely new capability with it: 3D scenes a reader can turn in their
hands. `index.html` now lists five books instead of four.

Promoted, per the bar in `CLAUDE.md` (proven in real use first, wanted by
more than one book): it drives eleven live widgets across that book, and
the next planned book — optics from the lens/sensor/cinematography side —
is the second consumer, since `viz.js` structurally cannot draw a camera.

- **`assets/js/sky3d.js`** — promoted from `atmosfera_chmury_book`
  (`assets/sky3d.js`, 1240 lines). Same factory contract as `viz.js`
  (`createX(host, cfg) -> { ok, set, render, dispose }`) and it already
  read only the shared CSS token contract, never that book's private
  `--amber`/`--cyan`, so the promotion needed almost nothing. Two hardening
  changes and one comment fix:
  - `createScatterLobe()`'s two axis labels were hardcoded Polish strings
    (`'światło pada'`, `'do przodu'`). They now come from
    `cfg.labels = { incident, forward }`, defaulting to those same Polish
    strings so `atmosfera_chmury_book` can re-copy the file with zero page
    changes. Passing `null` for either drops that label.
  - Header comment rewritten for this repo: the CSS token contract, the
    vendoring rule, and the fact that the Polish comments throughout are
    the source book's, while the API and every reader-visible string are
    language-neutral.
  - The four `if (!st) return { ok: false, ... }` failure stubs were missing
    `render()`, and `createDiagram3D`'s also missed `parts`/`add`/`labels`/
    `controls`. A page that called `widget.render()` — or read
    `widget.parts.length` — after a WebGL failure threw, which then took out
    every later widget on the page (the second widget would report "engine
    failed to load" instead of "needs WebGL", because the script died before
    creating it). Found by running the promoted copy in a headless browser
    with `--disable-3d-apis`. The stubs now mirror the success shape, so a
    WebGL-less browser costs the widgets and nothing else.
  - The comment above `FACTORIES` described an auto-mount entry point
    ("finds `.viz3d[data-widget]` and starts the right factory") that does
    not exist in the code — `FACTORIES` is just a name→factory map, and
    pages import their factory directly. Comment corrected rather than the
    function invented, since the map is what's actually proven.
- **`assets/js/vendor/`** — three.js r180 (`three.module.js`,
  `three.core.min.js`, `VERSION`), copied verbatim from
  `atmosfera_chmury_book/assets/vendor/`. **This is the first dependency
  this repo has ever carried**, and it is deliberately vendored, never from
  a CDN: no external request, no version drift, works offline. `sky3d.js`
  imports `./vendor/three.module.js` by bare relative path with no import
  map, so the folder must stay adjacent to it wherever it's copied. The
  other three tools remain dependency-free, and a book that doesn't use
  `sky3d.js` copies none of this.
- **`assets/js/sky3d-fallback.js`** — new file, extracted from the bottom
  of `atmosfera_chmury_book`'s own `assets/interactive.js` (73 lines
  appended there beyond this repo's copy). Kept **separate** rather than
  merged into `assets/js/interactive.js`: a book with formula modals but no
  3D shouldn't carry it, and a book with 3D but no modals shouldn't have to
  load `interactive.js` to get it. It must stay a classic script (not a
  module) — its whole job includes catching "the ES module never ran at
  all", which a module cannot report about itself. Hardened on promotion:
  the four messages were hardcoded Polish, and are now English defaults
  overridable via `window.SKY3D_MESSAGES`, where each `title`/`why` may be
  a string or an `{ en, pl }` object resolved against `<html data-lang>` —
  so a bilingual book gets the right language with no extra wiring.
- **`assets/css/viz3d.css`** — new file, extracted from
  `atmosfera_chmury_book/assets/style.css` (the `.viz3d` block plus its two
  narrow-screen rules), with that book's private tokens remapped onto the
  shared contract: `--bg-panel`→`--bg-elevated`,
  `--bg-panel-alt`→`--viz-bg`, `--text-dim`→`--text-muted`,
  `--amber`→`--accent`, the hardcoded 10px radius→`--radius`. Three
  optional tokens with built-in fallbacks (`--mono`, `--display`,
  `--viz3d-badge-bg`) so a book that defines none of them still renders
  correctly; the badge plate defaults to a dark translucent fill, which is
  wrong on a light theme and is called out as an override point. Dropped
  the `.sim__stage` selector from the `@supports` rule — that's the source
  book's Canvas2D simulation frame, not part of this tool. Like
  `widgets.css`, no `prefers-color-scheme` opinion of its own.
- **`docs/INTEGRATION.md`** — the tool table is now four tools, with a
  one-line rule for choosing between `viz.js` and `sky3d.js` (*one
  material, fixed camera → `viz.js`; a scene, or a camera the reader moves
  → `sky3d.js`*), and a full `sky3d.js` section: the vendoring terms, the
  three failure modes and the `host.dataset.sky3d` fallback contract, the
  `.viz3d` markup skeleton, the `data-sky`/`data-sky-out`/`data-preset`
  binder conventions, what each of the four factories is and which two are
  atmosphere-specific, and the six performance/touch rules baked into
  `boot()`/`orbit()` that were each a real bug fixed in the source book
  (render-on-demand rather than a loop — the 1 FPS bug; `IntersectionObserver`;
  ~12 fps animation cap; adaptive render scale; Ctrl/Cmd-gated wheel zoom;
  touch drag yielding to page scroll). The verification checklist gains four
  3D-specific checks, the `file://` one included.

Verified by serving this repo and driving it in headless Chrome, in the new
`assets/js/` + `assets/js/vendor/` layout (the source book had the pair one
level higher, so the relative import path was the thing most likely to break
in the move):

- `createDiagram3D` renders real geometry — a lens-stack scene of two
  elements, two amber rays, a sensor plane, an arrow and projected labels —
  with `ok=true`, `host.dataset.sky3d="ok"` and `setLayer()` round-tripping.
- `createScatterLobe` renders too: `readPixels` on its canvas counts ~27.9k
  drawn pixels from the fourth frame on. Worth knowing for anyone verifying
  these by screenshot: a widget that renders on demand shows up **blank** in
  a headless screenshot, because the drawing buffer is cleared after
  compositing. That is an artifact of the capture, not a broken widget —
  read the pixels back, or give the widget a spinning camera, before
  concluding anything from an empty stage.
- `cfg.labels` on the lobe, and `bindSliders`' `fmt` override, both take
  effect (English labels, `0.60` readout instead of the Polish default).
- Both failure paths produce the right English default message and no
  exceptions: `--disable-3d-apis` gives "This widget needs WebGL" on both
  widgets with `dataset.sky3d="webgl"`, and opening the same page over
  `file://` gives "This 3D widget cannot start from a file on disk" from the
  `sky3d-fallback.js` sweep, with the dataset still empty.
