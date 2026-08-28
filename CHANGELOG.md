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
