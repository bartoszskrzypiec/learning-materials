# Pattern: SVG + slider live diagram

Proven at scale in `raytracing_book` — 26 sliders across 17 chapters, live
since the book's early commits. Not a shared library (each instance is
bespoke to its own diagram's element IDs), but a consistent recipe worth
copying deliberately rather than reinventing per page. Reference
implementation: `raytracing_book/raytracing-book/rozdzialy/rozdzial-02-wektory-i-przeciecia.html`
(the ray–sphere discriminant demo — `d` slider driving a HIT/TANGENT/MISS
classification with live-repositioned intersection markers).

## When to reach for this vs. the WebGL/Canvas engine (`viz.js`)

- **This pattern** — a 2D geometric or algorithmic relationship where the
  *shape* of a diagram changes with a parameter: ray/plane geometry, angle
  relationships (Fresnel, Snell), a bias/epsilon threshold, a sample-count
  effect, a BVH traversal step. Cheap, no WebGL context needed, degrades
  gracefully (a static SVG is still a correct diagram at its default value
  even with JS disabled).
- **`viz.js`'s shaderball/Canvas2D engine** — anything that needs to show
  actual rendered *light* behaviour: a lit sphere's highlight shape, a BRDF
  lobe, a colour/absorption gradient, anything where the point is "look at
  what this actually renders like," not "look at how this geometric
  relationship changes."

They compose fine on the same page — a chapter can have both.

## The recipe

1. **Markup**: a labelled `<input type="range">` (with a readout `<span>`
   or the label text itself updated live) immediately followed by a
   `<div class="diagram-frame">` (or your book's equivalent) containing an
   inline `<svg>`. Give every SVG element the diagram's *state* will touch
   an explicit `id` — circles for markers, a `<line>` for a ray, `<text>`
   for labels, an element whose `stroke`/`fill` encodes a classification.

   ```html
   <label for="myParam">Parameter description</label>
   <input type="range" id="myParam" min="0" max="3" step="0.05" value="1">

   <div class="diagram-frame">
     <svg viewBox="0 0 480 240">
       <!-- static furniture: axes, fixed geometry -->
       <line id="myParamRay" x1="..." y1="..." x2="..." y2="..." stroke="..."/>
       <circle id="myParamMarkerA" cx="0" cy="0" r="4" opacity="0"/>
       <text id="myParamStatus" x="..." y="...">—</text>
     </svg>
   </div>
   ```

2. **Script**: one self-contained IIFE, placed right after the diagram,
   grabbing every element by ID once, registering an `input` listener on
   the slider, and calling `update()` once immediately so the diagram is
   correct on page load (not just after the first drag).

   ```html
   <script>
   (function () {
     var slider = document.getElementById('myParam');
     var ray = document.getElementById('myParamRay');
     var markerA = document.getElementById('myParamMarkerA');
     var status = document.getElementById('myParamStatus');

     // Diagram-space constants: pixel origin, scale, physical thresholds.
     var cx = 240, cy = 120, scale = 40, eps = 0.05;

     function update() {
       var value = parseFloat(slider.value);

       // Recompute whatever the underlying relationship actually is —
       // this is the one part that's genuinely different every time.
       var result = /* ... the actual math for this diagram ... */ 0;

       // Push the result into the SVG via plain attribute writes.
       ray.setAttribute('y1', cy - value * scale);
       markerA.setAttribute('opacity', result > eps ? 1 : 0);
       status.textContent = result > eps ? 'HIT' : 'MISS';
       status.setAttribute('fill', result > eps ? 'var(--amber)' : 'var(--raster)');
     }

     slider.addEventListener('input', update);
     update();
   })();
   </script>
   ```

3. **No shared runtime is involved** — this is plain DOM/SVG API, works
   with zero imports, zero build step. That's the whole point: it's cheap
   enough to hand-write per diagram without needing an abstraction layer.

## Bilingual notes

The slider's label text and any `textContent` the script writes (like the
`status` classification above) need the same `lang="en"`/`lang="pl"`
treatment as any other page content — either two labelled `<span>`s that
the language-gate CSS shows/hides, or (if the script writes the text) a
small `{ en: '...', pl: '...' }` lookup keyed by `currentLang()` from
`i18n.js`, re-run on the page's `langchange` event so a mid-session language
switch updates any diagram currently showing a language-dependent status
string. See `docs/INTEGRATION.md` for the full bilingual content rule.

## A future improvement, not required for v1

If a fifth or sixth diagram of the same *shape* shows up (e.g. several
"draw a line whose endpoint follows a slider" diagrams), it may be worth
extracting a tiny `bindSvgSlider(el, update)` helper into `viz.js` — but
don't do this speculatively. The 26 existing instances in `raytracing_book`
work fine as independent, bespoke scripts; only generalize once a genuine,
repeated shape emerges across pages that would benefit from it.
