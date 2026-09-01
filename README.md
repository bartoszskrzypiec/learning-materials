# learning-materials

Shared toolkit for the book projects below. Plain static files — no npm, no
build step. Each book **copies** what it needs from `assets/` into its own
repo (they deploy independently to their own GitHub Pages sites, so there's
no live cross-repo dependency).

Dependency-free except for `assets/js/sky3d.js`, which carries exactly one:
three.js, vendored into `assets/js/vendor/`, never fetched from a CDN. A
book that doesn't use the 3D engine copies none of it.

## The books

| Project | Live site | Repo |
|---|---|---|
| PxrSurface Guide | https://bartoszskrzypiec.github.io/pxrsurface-guide/ | `pxrsurface-guide` |
| Lookdev dla Artystów Technicznych | https://bartoszskrzypiec.github.io/lookdev-book/ | `lookdev-book` |
| Pipeline dla Artystów Technicznych | https://bartoszskrzypiec.github.io/pipeline-book/ | `pipeline-book` |
| Ray Tracing dla Artystów Technicznych | https://bartoszskrzypiec.github.io/raytracing-book/ | `raytracing-book` |
| Atmosfera i chmury dla ciekawych | https://bartoszskrzypiec.github.io/atmosfera_chmury_book/ | `atmosfera_chmury_book` |

## What's here

- `assets/js/viz.js` — WebGL2 shaderball + Canvas2D plotting engine (real
  BRDF/Fresnel/thin-film math rendered live), originally built for
  `pxrsurface-guide`.
- `assets/js/sky3d.js` — three.js scene engine: an orbit camera, labels
  pinned to points in space, raymarched volumetrics, and a declarative
  `createDiagram3D()` that builds a whole scene from a list of parts.
  Where `viz.js` renders one analytic sphere at a fixed camera, this
  renders a scene. Originally built for `atmosfera_chmury_book` (11
  widgets). Needs `assets/js/vendor/` (three.js) beside it and
  `assets/js/sky3d-fallback.js` loaded as a classic script, so a widget
  that can't start says why instead of showing an empty rectangle.
- `assets/js/i18n.js` — the bilingual EN/PL toggle: two languages ship as
  sibling elements in the markup, CSS hides the inactive one, one small
  script flips an attribute. Fully config-driven via `data-*` attributes —
  no book-specific edits needed.
- `assets/js/interactive.js` — formula modals + symbol tooltips, originally
  built for and proven at scale in `raytracing-book` (272 live tooltips).
- `assets/css/widgets.css` — the component styles `viz.js` renders into,
  as an add-on layer for any book's existing stylesheet.
- `assets/css/viz3d.css` — the same, for `sky3d.js`'s `.viz3d` components.
- `patterns/svg-slider-widget.md` — the SVG+slider live-diagram recipe
  proven at scale in `raytracing-book` (26 instances), documented as a
  template rather than a shared function, since each instance is bespoke.
- `docs/INTEGRATION.md` — the full adoption guide: the CSS token contract,
  the i18n configuration contract, the bilingual content rule, and a
  verification checklist.

See `docs/INTEGRATION.md` before copying anything in.

## Why a separate repo instead of one merged monorepo

All five books already have independent, live, public GitHub Pages URLs
with commit history, and most of them cross-link each other with absolute
URLs. Merging them into one physical repo would mean either breaking all
five existing URLs, or standing up GitHub Actions/CI to keep deploying five
separate sites from one repo — both of which contradict the
"no build system, no CI" principle every one of these projects states in
its own `CLAUDE.md`. This repo sidesteps that entirely: it's the one
canonical source for the *shared* pieces, each book keeps consuming a
synced copy exactly the way `style.css` has already been hand-copied and
independently evolved across the trilogy since before this repo existed —
just with one documented source instead of an undocumented copy chain.
