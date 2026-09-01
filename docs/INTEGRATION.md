# Integrating the shared engine into a book project

This repo holds the shared toolkit used across the book projects
(`renderman_guide`/`pxrsurface-guide`, `lookdev_book`, `pipeline_book`,
`raytracing_book`, `atmosfera_chmury_book`, and any future one). It's plain
static files — no npm, no bundler, no build step — meant to be **copied**
into a book's own `assets/` folder, not referenced across repos at runtime
(each book deploys independently to its own GitHub Pages site, so a
cross-repo relative path wouldn't resolve anyway).

Everything here is dependency-free **except `sky3d.js`**, which carries
exactly one: three.js, vendored into `assets/js/vendor/`, never fetched
from a CDN. See "The one dependency" under `sky3d.js` below. A book that
doesn't use `sky3d.js` copies nothing extra and stays dependency-free.

## The four tools, and when to reach for each

| Tool | File(s) | Use for |
|---|---|---|
| WebGL2/Canvas2D physics engine | `assets/js/viz.js` | A lit sphere rendering real BRDF/Fresnel/thin-film math live; Canvas2D plots (NDF curves, polar lobes, falloff profiles) with drag/slider controls. Reach for this when the point is *"look at what this actually renders like."* |
| three.js 3D scene engine | `assets/js/sky3d.js` + `assets/css/viz3d.css` + `assets/js/sky3d-fallback.js` | A **scene** the reader can turn in their hands: several objects at once, an orbit camera, labels pinned to points in space, layers to toggle. Also raymarched volumetrics. Reach for this when the point is *"this is three-dimensional, and a flat projection lies about it."* Proven in `atmosfera_chmury_book` (11 widgets). |
| SVG + slider diagrams | see `../patterns/svg-slider-widget.md` | A 2D geometric/algorithmic relationship that changes shape with a parameter — ray/plane geometry, angle relationships, threshold effects, sample-count convergence. Cheap, no shared runtime needed, proven at scale in `raytracing_book` (26 instances). |
| Formula modals + symbol tooltips | `assets/js/interactive.js` | "Explain this formula" expandable panels, and hover/tap/keyboard tooltips on inline vector/variable symbols (`.vec[data-tip]`). Proven at scale in `raytracing_book` (272 tooltips). |

They compose freely on the same page. None of them require the others.

### `viz.js` or `sky3d.js`? The one-line rule

**One material, fixed camera → `viz.js`. A scene, or a camera the reader
moves → `sky3d.js`.** `viz.js` is a single analytic sphere solved in a
fragment shader with no camera controls (see its own section below);
`sky3d.js` is a real three.js scene graph with an orbit camera. If the
question is "what does this material look like", `viz.js` is smaller and
cheaper. If the question involves *where things are relative to each
other* — a frustum, a stack of elements, an angle in space, a volume —
`viz.js` structurally cannot do it and `sky3d.js` was built for it.

Before either, ask whether an SVG+slider diagram suffices: it's cheaper
than both, needs no runtime, and 3D that adds nothing but a spin is worse
than a clean 2D diagram. `atmosfera_chmury_book` capped itself at eleven 3D
widgets across 54 pages for exactly this reason, and used SVG everywhere
else.

## `viz.js`'s `createShaderball()` — what it can and can't do (2026-08-28)

Before reaching for `createShaderball()` in a new context, know its actual
shape — it's a single hand-rolled analytic ray/sphere intersection in a
fragment shader, not a general 3D renderer:

- **Geometry**: exactly one primitive, a unit sphere, solved analytically
  per pixel. There is no vertex/mesh pipeline at all (the "vertex shader"
  is a 3-vertex fullscreen-triangle trick). Swapping in a second analytic
  primitive that reuses the existing BRDF/lighting math (e.g. a flat plane,
  useful for anisotropy grain-direction or fabric-drape widgets) is a
  contained, moderate change — a new intersection branch plus a new
  tangent-frame branch, roughly a few hours to a day of focused work. A
  scene with *multiple simultaneous objects* (camera frustums, BVH box
  hierarchies, Cornell-box path bounces) is **not** a small extension of
  this module — it needs either a scene-traversal loop in the shader or
  real rasterization with vertex buffers, i.e. a different rendering
  architecture that would only reuse the BRDF math and control/theming
  utilities, not `createShaderball` itself.
- **Camera**: fixed. No orbit, zoom, or pan on the rendered object — every
  existing widget steers the *material*, not the *view*, via sliders.
  `onDrag()` exists but every current use wires it to a separate Canvas2D
  plot, never to the shaderball's own camera. Adding orbit would mean a
  real view/eye uniform and wiring `onDrag` directly to the shaderball
  canvas — not present today.
- **Lighting**: one soft cone/disk light (Monte Carlo sampled for a soft
  highlight) plus a flat ambient term. The `envGain` "sky reflection" is a
  cheap two-tone procedural gradient keyed off the surface normal — it is
  **not** real image-based lighting; there's no `sampler2D`/cubemap uniform
  anywhere in the shader. A book chapter whose whole point is "the same
  material under different HDRIs" (swappable environment lighting) would
  need genuinely new work here, not a config tweak.

None of this blocks the common case — a lit sphere showing a BRDF/Fresnel
effect live, the thing every pilot widget built so far actually needed.
It matters once a book wants a camera/scene diagram (more natural fit for
the SVG+slider pattern above, at least for now) or true environment
lighting.

## `sky3d.js` — the 3D widget engine (2026-09-01)

Promoted from `atmosfera_chmury_book`, where it drives eleven widgets. Same
factory shape as `viz.js`: `createX(hostElement, cfg)` returns
`{ ok, set(patch), render, dispose }`, and nothing in it assumes anything
about the page it stands on.

### The one dependency

three.js, **vendored** into `assets/js/vendor/` (r180 at time of writing —
see `assets/js/vendor/VERSION`), on these terms, inherited verbatim from
`atmosfera_chmury_book`:

- The build files are committed. No CDN, no external request, no version
  drift. A book works offline and will still work in ten years.
- **No import map, no package.json.** `sky3d.js` imports
  `./vendor/three.module.js` by relative path, and that file imports
  `./three.core.min.js`. So **keep `vendor/` as a sibling of `sky3d.js`**
  when you copy them in. Pages only ever import from `sky3d.js` itself,
  with a relative path matching their own directory depth.
- To refresh: `npm pack three@<version>`, unpack, and copy the minified
  pair named in `assets/js/vendor/VERSION`
  (`build/three.module.min.js` → `vendor/three.module.js`,
  `build/three.core.min.js` → `vendor/three.core.min.js`). Nothing is
  installed and there is still no build step.
- three.js is MIT; its licence header stays in the file.

### The ES-module consequence, and the fallback contract

`sky3d.js` is an ES module, so **a page carrying a 3D widget needs a real
server** — opened over `file://` the browser refuses the import entirely.
Every other page in these books opens straight off disk; this is the one
exception, and it must never present as a blank rectangle.

Three failure modes, one visible outcome:

| What failed | Who notices | `host.dataset.sky3d` |
|---|---|---|
| No WebGL2 | `sky3d.js`'s `boot()` | `webgl` |
| Shader didn't compile (three.js only logs, never throws) | `boot()`'s `renderer.debug.onShaderError` hook | `shader` |
| The module never loaded at all (`file://`, failed fetch) | the sweep in `sky3d-fallback.js` | *empty* |

`assets/js/sky3d-fallback.js` is a **classic script, not a module** — that's
the whole point, since the third case is precisely "no module ran". Load it
before the module:

```html
<script src="../assets/js/sky3d-fallback.js"></script>
...
<script type="module">
  import { createSkyDome, bindSliders } from '../assets/js/sky3d.js';
  const w = createSkyDome(document.getElementById('skyLab'), { sunElev: 25 });
  bindSliders(document.getElementById('skyLab'), w);
</script>
```

Its default messages are English. Override any of the four (`file`, `siec`,
`webgl`, `shader`) by setting `window.SKY3D_MESSAGES` before it loads; each
`title`/`why` may be a plain string or an `{ en, pl }` object, which is
resolved against `<html data-lang>` — so a bilingual book using `i18n.js`
needs no extra wiring. The chapter's own sentence inside
`.viz3d__fallback > span` is never touched; only the `<strong>` headline is
rewritten and a `.viz3d__why` cause line prepended.

### The markup skeleton

`sky3d.js` finds `.viz3d__stage` inside the host and expects a `<canvas>`
in it. Everything else is optional but conventional:

```html
<div class="viz3d" id="skyLab">
  <div class="viz3d__head">
    <p class="viz3d__title">Title of the widget</p>
    <p class="viz3d__sub">One line saying what to do with it.</p>
  </div>
  <div class="viz3d__stage">
    <canvas></canvas>
    <div class="viz3d__badge">drag to look around</div>
    <div class="viz3d__fallback">
      <strong>This widget needs WebGL</strong>
      <span>The paragraph beside it is complete without the widget.</span>
    </div>
  </div>
  <div class="viz3d__controls">
    <label for="sunElev">Sun elevation</label>
    <input id="sunElev" type="range" data-sky="sunElev" data-sky-unit="°"
           data-sky-decimals="0" min="-6" max="80" step="1" value="25">
    <span class="value-readout" data-sky-out="sunElev"></span>
  </div>
  <div class="viz3d__presets"><button data-preset="cumulus">Cumulus</button></div>
  <p class="viz3d__note">Why this widget is here, in one paragraph.</p>
</div>
```

- `bindSliders(root, widget)` wires every `input[data-sky="param"]` to
  `widget.set({ param: value })` and writes the formatted value into
  `[data-sky-out="param"]`. Formatting defaults to a **Polish decimal
  comma** plus `data-sky-unit`, with `data-sky-decimals` places; pass
  `{ fmt }` to change that for a book that formats differently.
- `bindPresets(root, widget)` wires `[data-preset="name"]` buttons to
  `widget.set({ preset: name })` and manages `.is-active`.

### The four factories — two generic, two domain-specific

| Factory | Generic? | What it is |
|---|---|---|
| `createDiagram3D(host, cfg)` | **Yes** | A declarative scene: `cfg.parts` is a list, each part a `{ type, at, rot, scale, color, layer, ... }` object. Types: `sphere`, `box`, `cone`, `cylinder`, `plane`, `ring`, `torus`, `hexPrism`, `disc`, plus `polyline`/`ray`, `arrow`, `label`, `grid`. Named `layer`s toggle via `setLayer(name, on)` or `set({ layers: {...} })`. This one function replaced seven bespoke widgets in the source book. |
| `createScatterLobe(host, cfg)` | **Mostly** | A solid of revolution `r(θ)` — a phase function drawn as the 3D body it actually is, since the flat projection lies (Rayleigh looks like a figure-8 but is a squashed sphere). Modes: `rayleigh`, or Henyey–Greenstein via `cfg.g`. Axis labels come from `cfg.labels = { incident, forward }` — the defaults are Polish, so pass your own. |
| `createSkyDome(host, cfg)` | No — atmospheric | Raymarched Rayleigh/Mie sky in a fullscreen quad: `sunElev`, `sunAzim`, `turbidity`, `altitude`, `exposure`, `fov`. Drag looks around; the sky is computed, not painted. |
| `createCloudVolume(host, cfg)` | No — atmospheric | Raymarched cloud volume with ten genus presets (`CLOUD_PRESETS`), driven by `base`, `thick`, `density`, `coverage`, `lumpy`, `ice`, `spread`. Scene unit = 1 km. |

`FACTORIES` maps `sky` / `cloud` / `lobe` / `diagram` onto those, for pages
that pick a widget from data. There is no auto-mount — pages import the
factory they want directly.

The shared core underneath (not exported, but what makes the above cheap to
extend) is `boot()` (renderer, resize, visibility, failure reporting),
`orbit()` (a minimal camera — rotate and zoom only, deliberately not
`OrbitControls` from `examples/jsm`), `labelLayer()` (real `<span>` text
projected onto 3D points, so labels stay selectable, screen-reader-visible
and browser-zoom-aware) and `fullscreenQuad()` (the carrier for raymarched
shaders).

### The performance and touch rules already baked in

These were each a real bug fixed in the source book — don't undo them when
adapting a widget:

- **Render on demand, never in a loop.** `state.invalidate()` schedules one
  frame. A permanent `requestAnimationFrame` loop is what made the first
  version of that book render at 1 FPS with pages that wouldn't scroll.
- **`IntersectionObserver`** — a widget off screen doesn't render at all.
  With many widgets in one book this is a usability condition on a phone,
  not an optimisation.
- **Animation is throttled to ~12 fps**, and `prefers-reduced-motion`
  silences the loop entirely (render only on parameter change).
- **Adaptive resolution** — the first few frames are timed, and the render
  scale drops if the hardware can't keep up. Raymarched widgets start at
  `renderScale` 0.55–0.6 by design.
- **Wheel zoom requires Ctrl/Cmd**, like a map. Without that, a 450px-tall
  widget swallowed the page scroll and the page stopped responding to the
  wheel.
- **Touch drag yields to vertical scrolling** until the gesture clearly
  isn't a scroll (12px of movement, more horizontal than vertical).

### CSS tokens `viz3d.css` needs

The same contract as `widgets.css` — `--text`, `--text-muted`, `--border`,
`--accent`, `--bg-elevated`, `--viz-bg`, `--radius` — plus three optional
ones with built-in fallbacks: `--mono`, `--display` and `--viz3d-badge-bg`.
That last one defaults to a dark translucent plate, which is correct on a
dark stage and wrong on a light one; override it in a light-themed book.
`sky3d.js`'s own `theme()` reads only `--text`, `--text-muted`, `--border`,
`--accent`, `--viz-a`, `--viz-b`, `--viz-grid`, `--viz-bg` — never a book's
private names.

### Choosing tools for a new book

The decision that matters is per-widget, not per-book, but as a shape: a
book about **cameras, lenses and sensors** would lean on `createDiagram3D`
(element stacks, ray paths through glass, a frustum, sensor geometry,
depth-of-field volumes) far more than on `viz.js`, which cannot show a
camera at all; `createScatterLobe` generalises to any polar/spherical
function worth seeing in 3D; and the raymarching core is where a defocus or
volumetric widget would be built, not `viz.js`. Everything flat — an MTF
curve, an f-stop ladder, a circle-of-confusion relationship — is still
cheaper as an SVG+slider diagram.

## Copying in

Copy whichever of `assets/js/viz.js`, `assets/js/i18n.js`,
`assets/js/interactive.js`, `assets/js/sky3d.js` (plus its `vendor/` folder
and `assets/js/sky3d-fallback.js`), `assets/css/widgets.css` and
`assets/css/viz3d.css` your book actually needs into its own `assets/js/`
and `assets/css/`. Check `CHANGELOG.md` in this repo before re-copying an
update, so you know what changed.

`sky3d.js` is the one file with a companion folder: `vendor/` must stay
adjacent to it, since the import is a bare relative path with no import map.

## The CSS token contract (`viz.js` / `widgets.css`)

`viz.js`'s `theme()` function and `widgets.css`'s component rules read these
custom properties from whatever stylesheet your book already loads:

```
--text        --text-muted    --border      --accent
--viz-a       --viz-b         --viz-grid    --viz-bg
--bg-elevated --radius
```

(`assets/css/viz3d.css`, the 3D component layer, reads the same set plus
three optional tokens of its own — see its section above.)

(The last two, `--bg-elevated` and `--radius`, are read only by
`widgets.css`'s `.viz`/`.ctl` rules, not by `viz.js`'s JS `theme()` — easy to
miss if you only check the JS. Both `raytracing_book`'s and `lookdev_book`'s
first real pilot widgets hit this gap before it was added here.)

If your book's palette uses different names, alias them once — don't edit
`viz.js` or `widgets.css` to rename what they read. Worked example, mapping
the `raytracing_book`/`pipeline_book`/`lookdev_book` trilogy's actual tokens
onto this contract:

```css
:root {
  --text-muted:   var(--text-dim);
  --accent:       var(--amber);      /* or --raster — your call */
  --bg-elevated:  var(--bg-panel);
  --radius:       10px;
  --viz-a:        var(--violet);
  --viz-b:        var(--cyan);
  --viz-grid:     var(--border);
  --viz-bg:       var(--bg-panel-alt);
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

If the page carries a `sky3d.js` widget, four more, all of which caught real
bugs in `atmosfera_chmury_book`:

- **Serve the page over http and open it over `file://` as well.** The
  module only runs in the first case; the second must show the
  `.viz3d__fallback` with the "cannot start from a file on disk" line, not a
  blank rectangle. Both are correct outcomes — a silent empty stage is not.
- **Disable WebGL** and confirm the fallback names WebGL as the cause, and
  that the surrounding prose still reads as a complete argument without the
  widget.
- **Scroll the page with the wheel while the pointer is over the widget** —
  the page must keep scrolling. Zoom is Ctrl/Cmd + wheel by design. On a
  phone, a vertical swipe starting on the stage must scroll the page, not
  rotate the camera.
- **Check the page at 360px wide** for horizontal overflow — the slider
  readouts carry worded glosses and were the thing that overflowed.
