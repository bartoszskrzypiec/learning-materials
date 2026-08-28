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
