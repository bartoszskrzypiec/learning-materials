/* Shared visualisation engine.
 *
 *   createShaderball(canvas, opts)  raw WebGL2 lit sphere, real BRDF maths
 *   createPlot(canvas, draw)        Canvas2D helper (DPI, theming, dragging)
 *   bindControls(root, onChange)    wires sliders + segmented toggles to state
 *
 * No dependencies, no external requests. Everything here is deliberately
 * hand-rolled so the pages keep working offline and with no build step.
 */

import { currentLang } from './i18n.js';

/* =======================================================================
   Theme
   ======================================================================= */

/** Read the site's CSS custom properties so widgets follow light/dark mode. */
export function theme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, fallback) => (cs.getPropertyValue(n).trim() || fallback);
  return {
    text: v('--text', '#232323'),
    muted: v('--text-muted', '#5b5b5b'),
    border: v('--border', '#e2ddd3'),
    accent: v('--accent', '#b5482a'),
    a: v('--viz-a', '#7d4a9e'),
    b: v('--viz-b', '#2f8f6b'),
    arnold: v('--arnold', '#d9752b'),
    pxr: v('--pxr', '#2c6b8f'),
    grid: v('--viz-grid', '#ddd8ce'),
    bg: v('--viz-bg', '#f4f2ec'),
  };
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/** Call fn whenever the theme or the language changes. */
function onThemeOrLang(fn) {
  darkQuery.addEventListener('change', fn);
  document.addEventListener('langchange', fn);
}

/** Widgets may set a value once for both halves, or per half. */
const pair = (v) => (Array.isArray(v) ? v : [v, v]);

function hexToRgb(hex) {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* =======================================================================
   Controls
   ======================================================================= */

function formatValue(input, value) {
  const fmt = input.dataset.fmt || '2';
  if (fmt === 'deg') return `${value.toFixed(1)}°`;
  if (fmt === 'deg0') return `${Math.round(value)}°`;
  if (fmt === 'stops') return `${value > 0 ? '+' : ''}${value.toFixed(1)} EV`;
  if (fmt === 'pct') return `${Math.round(value * 100)}%`;
  if (fmt === 'nm') return `${Math.round(value)} nm`;
  return value.toFixed(parseInt(fmt, 10));
}

/**
 * Collect every range slider and .seg toggle inside `root` into a state
 * object keyed by element id, keep the numeric readouts in sync, and call
 * onChange(state) whenever anything moves.
 */
export function bindControls(root, onChange) {
  const state = {};
  // A page that doesn't carry this widget shouldn't take the others down.
  if (!root) return { state, set() {} };
  const sliders = [...root.querySelectorAll('input[type="range"]')];
  const segs = [...root.querySelectorAll('.seg')];

  function syncReadout(input) {
    const out = root.querySelector(`[data-value-for="${input.id}"]`);
    if (out) out.textContent = formatValue(input, parseFloat(input.value));
  }

  sliders.forEach((input) => {
    state[input.id] = parseFloat(input.value);
    syncReadout(input);
    input.addEventListener('input', () => {
      state[input.id] = parseFloat(input.value);
      syncReadout(input);
      onChange(state, input.id);
    });
  });

  segs.forEach((seg) => {
    state[seg.id] = seg.dataset.value;
    seg.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-val]');
      if (!btn) return;
      seg.dataset.value = btn.dataset.val;
      state[seg.id] = btn.dataset.val;
      seg.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('is-active', b === btn);
      });
      onChange(state, seg.id);
    });
  });

  // Readouts should re-render in the new language (some carry units).
  document.addEventListener('langchange', () => sliders.forEach(syncReadout));

  return {
    state,
    /** Move a slider programmatically without firing its own change. */
    set(id, value) {
      const input = root.querySelector(`#${id}`);
      if (!input) return;
      input.value = String(value);
      state[id] = parseFloat(input.value);
      syncReadout(input);
    },
  };
}

/* =======================================================================
   Canvas2D plots
   ======================================================================= */

/**
 * DPI-correct 2D canvas that redraws on resize, theme change and language
 * change. `draw(ctx, w, h, th)` receives CSS-pixel dimensions.
 */
export function createPlot(canvas, draw) {
  if (!canvas) return { redraw() {}, get size() { return { w: 0, h: 0 }; } };
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width || canvas.clientWidth || 600;
    h = parseFloat(canvas.dataset.h || '0') || w * (parseFloat(canvas.dataset.ratio) || 0.6);
    canvas.style.height = `${h}px`;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function redraw() {
    if (!w) resize();
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h, theme());
  }

  const ro = new ResizeObserver(() => {
    resize();
    redraw();
  });
  ro.observe(canvas);

  onThemeOrLang(redraw);

  resize();
  redraw();

  return { redraw, get size() { return { w, h }; } };
}

/** Pointer dragging on a canvas, reported in CSS pixels. */
export function onDrag(canvas, handler) {
  if (!canvas) return;
  let active = false;

  const pos = (ev) => {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height };
  };

  canvas.addEventListener('pointerdown', (ev) => {
    active = true;
    canvas.setPointerCapture(ev.pointerId);
    handler(pos(ev), true);
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (active) handler(pos(ev), false);
  });
  canvas.addEventListener('pointerup', () => { active = false; });
  canvas.addEventListener('pointercancel', () => { active = false; });
  canvas.style.cursor = 'grab';
}

/* Small drawing helpers shared by the plots ---------------------------- */

export function axes(ctx, box, th) {
  ctx.strokeStyle = th.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y);
  ctx.lineTo(box.x, box.y + box.h);
  ctx.lineTo(box.x + box.w, box.y + box.h);
  ctx.stroke();
}

export function gridLines(ctx, box, th, cols, rows) {
  ctx.strokeStyle = th.grid;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  for (let i = 1; i < cols; i++) {
    const x = box.x + (box.w * i) / cols;
    ctx.moveTo(x, box.y);
    ctx.lineTo(x, box.y + box.h);
  }
  for (let i = 1; i < rows; i++) {
    const y = box.y + (box.h * i) / rows;
    ctx.moveTo(box.x, y);
    ctx.lineTo(box.x + box.w, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export function label(ctx, text, x, y, th, opts = {}) {
  ctx.fillStyle = opts.color || th.muted;
  ctx.font = opts.font || `${opts.size || 11}px -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = opts.align || 'left';
  ctx.textBaseline = opts.baseline || 'alphabetic';
  ctx.fillText(text, x, y);
}

export function arrow(ctx, x0, y0, x1, y1, headLen = 7) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - headLen * Math.cos(a - 0.4), y1 - headLen * Math.sin(a - 0.4));
  ctx.lineTo(x1 - headLen * Math.cos(a + 0.4), y1 - headLen * Math.sin(a + 0.4));
  ctx.closePath();
  ctx.fill();
}

/* =======================================================================
   BRDF maths, shared between the shader and the 2D plots
   ======================================================================= */

export const MODEL = { BECKMANN: 0, GGX: 1, FUZZ: 2, SHEEN: 3 };

/** Isotropic Beckmann NDF, alpha = roughness^2. */
export function dBeckmann(cosTh, alpha) {
  const a2 = alpha * alpha;
  const c2 = cosTh * cosTh;
  if (c2 <= 1e-7) return 0;
  const t2 = (1 - c2) / c2;
  return Math.exp(-t2 / a2) / (Math.PI * a2 * c2 * c2);
}

/** Isotropic GGX / Trowbridge-Reitz NDF, alpha = roughness^2. */
export function dGGX(cosTh, alpha) {
  const a2 = alpha * alpha;
  const c2 = cosTh * cosTh;
  const d = c2 * (a2 - 1) + 1;
  return a2 / (Math.PI * d * d);
}

/** Cone-of-fibres fuzz lobe: peaks in the tangent plane, width set by the cone. */
export function dFuzzCone(cosTh, coneRad) {
  const w = Math.max(Math.sin(coneRad), 0.02);
  const x = cosTh / w;
  return Math.exp(-x * x) / (Math.PI * w);
}

/** Conty-Kulla sheen (the distribution behind Arnold's sheen_bsdf). */
export function dSheen(cosTh, roughness) {
  const a = Math.max(roughness, 0.07);
  const sinTh = Math.sqrt(Math.max(0, 1 - cosTh * cosTh));
  return (2 + 1 / a) * Math.pow(sinTh, 1 / a) / (2 * Math.PI);
}

/* =======================================================================
   WebGL2 shaderball
   ======================================================================= */

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

const float PI = 3.14159265359;

uniform vec2  uRes;
uniform int   uSplit;        // 1 = two models on one sphere
uniform ivec2 uModel;        // model id, left / right
uniform vec2  uRough;        // roughness, left / right
uniform vec2  uAniso;        // anisotropy 0..0.95, left / right
uniform vec2  uExtra;        // fuzz cone (radians) or sheen roughness
uniform vec2  uGain;         // lobe gain, left / right
uniform int   uTangentMode;  // 0 longitude, 1 radial, 2 swirl
uniform float uTangentRot;   // radians, applied about N
uniform vec3  uLightDir;
uniform float uLightCos;     // cosine of the light's angular radius
uniform float uLightPower;
uniform float uExposure;     // stops
uniform int   uTonemap;      // 0 clip, 1 filmic
uniform int   uSamples;
uniform vec3  uBg;
uniform vec3  uSpecColor;
uniform vec2  uDiffuse;        // per side
uniform vec3  uDiffColor;

// Fresnel: 0 = Schlick off uSpecColor, 1 = PxrSurface Artistic (face/edge),
// 2 = Physical (IOR + extinction), 3 = Arnold metalness driving face/edge.
uniform ivec2 uFresnelMode;   // per side
uniform vec3  uFaceColor;
uniform vec3  uEdgeColor;
uniform float uFresnelExp;
uniform vec3  uIor;
uniform vec3  uExtinction;
uniform float uMetalness;
uniform vec3  uBaseColor;

uniform float uEnvGain;       // cheap environment reflection, 0 = off

// Thin film / iridescence
uniform float uFilmThickness;   // nanometres, 0 = off
uniform float uFilmIor;

/* ---- sampling ---- */
float radicalInverse(uint bits) {
  bits = (bits << 16u) | (bits >> 16u);
  bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
  bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
  bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
  bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
  return float(bits) * 2.3283064365386963e-10;
}

void basis(vec3 n, out vec3 t, out vec3 b) {
  float s = n.z >= 0.0 ? 1.0 : -1.0;
  float a = -1.0 / (s + n.z);
  float c = n.x * n.y * a;
  t = vec3(1.0 + s * n.x * n.x * a, s * c, -s * n.x);
  b = vec3(c, s + n.y * n.y * a, -n.y);
}

vec3 sampleCone(vec3 dir, float cosMax, vec2 u) {
  float cosT = mix(cosMax, 1.0, u.x);
  float sinT = sqrt(max(0.0, 1.0 - cosT * cosT));
  float phi = 2.0 * PI * u.y;
  vec3 t, b;
  basis(dir, t, b);
  return normalize(t * (cos(phi) * sinT) + b * (sin(phi) * sinT) + dir * cosT);
}

/* ---- distributions ---- */
float dBeckmann(float NoH, float HoT, float HoB, float ax, float ay) {
  float NoH2 = NoH * NoH;
  if (NoH2 <= 1e-7) return 0.0;
  float e = -((HoT * HoT) / (ax * ax) + (HoB * HoB) / (ay * ay)) / NoH2;
  return exp(e) / (PI * ax * ay * NoH2 * NoH2);
}

float dGGX(float NoH, float HoT, float HoB, float ax, float ay) {
  float a = HoT / ax;
  float b = HoB / ay;
  float d = a * a + b * b + NoH * NoH;
  return 1.0 / (PI * ax * ay * d * d);
}

/* Cone of fibres: scattering normals sit near the tangent plane, so the lobe
   peaks at grazing. Widening the cone splays the fibres and broadens it. */
float dFuzzCone(float NoH, float cone) {
  float w = max(sin(cone), 0.02);
  float x = NoH / w;
  return exp(-x * x) / (PI * w);
}

/* Conty-Kulla inverted Gaussian - the distribution behind Arnold's sheen. */
float dSheen(float NoH, float rough) {
  float a = max(rough, 0.07);
  float sinTh = sqrt(max(0.0, 1.0 - NoH * NoH));
  return (2.0 + 1.0 / a) * pow(sinTh, 1.0 / a) / (2.0 * PI);
}

/* ---- shadowing / masking ---- */
float lambdaGGX(float VoN, float VoT, float VoB, float ax, float ay) {
  if (VoN <= 1e-5) return 0.0;
  float a2 = (VoT * ax) * (VoT * ax) + (VoB * ay) * (VoB * ay);
  float t2 = a2 / (VoN * VoN);
  return 0.5 * (-1.0 + sqrt(1.0 + t2));
}

float lambdaBeckmann(float VoN, float VoT, float VoB, float ax, float ay) {
  if (VoN <= 1e-5) return 0.0;
  float s = sqrt((VoT * ax) * (VoT * ax) + (VoB * ay) * (VoB * ay));
  if (s <= 1e-6) return 0.0;
  float a = VoN / s;
  if (a >= 1.6) return 0.0;
  return (1.0 - 1.259 * a + 0.396 * a * a) / (3.535 * a + 2.181 * a * a);
}

/* Ashikhmin velvet visibility, standard for sheen-type lobes. */
float visVelvet(float NoL, float NoV) {
  return 1.0 / (4.0 * (NoL + NoV - NoL * NoV) + 1e-4);
}

vec3 fresnelSchlick(vec3 f0, float VoH) {
  return f0 + (vec3(1.0) - f0) * pow(1.0 - VoH, 5.0);
}

/* Full Fresnel for a conductor, per channel. With k = 0 this reduces to the
   dielectric case, so one function covers both metals and non-metals. */
float fresnelConductor(float cosT, float n, float k) {
  float c2 = cosT * cosT;
  float s2 = 1.0 - c2;
  float n2 = n * n;
  float k2 = k * k;
  float t0 = n2 - k2 - s2;
  float a2b2 = sqrt(max(t0 * t0 + 4.0 * n2 * k2, 0.0));
  float t1 = a2b2 + c2;
  float a = sqrt(max(0.5 * (a2b2 + t0), 0.0));
  float t2 = 2.0 * a * cosT;
  float Rs = (t1 - t2) / (t1 + t2 + 1e-7);
  float t3 = c2 * a2b2 + s2 * s2;
  float t4 = t2 * s2;
  float Rp = Rs * (t3 - t4) / (t3 + t4 + 1e-7);
  return clamp(0.5 * (Rs + Rp), 0.0, 1.0);
}

/* Thin-film interference. Light reflecting off the top of the film and off
   the bottom travel different distances; which wavelengths survive that
   round trip depends on thickness AND on viewing angle, which is why the
   colour slides as the surface turns. */
vec3 thinFilm(float cosT, float thicknessNm, float filmIor) {
  if (thicknessNm <= 0.0) return vec3(1.0);
  float sinF2 = (1.0 - cosT * cosT) / (filmIor * filmIor);
  if (sinF2 >= 1.0) return vec3(1.0);
  float cosF = sqrt(1.0 - sinF2);
  float opd = 2.0 * filmIor * thicknessNm * cosF;   // optical path difference
  // Representative wavelengths for R, G, B in nanometres.
  vec3 lambda = vec3(612.0, 549.0, 464.0);
  // pi phase flip on the front surface reflection.
  vec3 phase = 6.2831853 * opd / lambda + 3.14159265;
  return 0.5 + 0.5 * cos(phase);
}

/* The specular colour at this angle, under whichever parameterisation the
   widget is demonstrating. */
vec3 fresnelTerm(float VoH, int mode) {
  vec3 F;
  if (mode == 1) {
    // PxrSurface Artistic: blend face -> edge by the Fresnel exponent.
    F = mix(uFaceColor, uEdgeColor, pow(1.0 - VoH, uFresnelExp));
  } else if (mode == 2) {
    // PxrSurface Physical: derived from IOR (and extinction, for metals).
    F = vec3(fresnelConductor(VoH, uIor.r, uExtinction.r),
             fresnelConductor(VoH, uIor.g, uExtinction.g),
             fresnelConductor(VoH, uIor.b, uExtinction.b));
  } else if (mode == 3) {
    // Arnold: one metalness slider tints F0 with the base colour.
    vec3 f0 = mix(vec3(0.04), uBaseColor, uMetalness);
    F = fresnelSchlick(f0, VoH);
  } else {
    F = fresnelSchlick(uSpecColor, VoH);
  }
  return F * thinFilm(VoH, uFilmThickness, uFilmIor);
}

/* Evaluate one lobe. Returns radiance factor for a single light direction. */
vec3 evalLobe(int model, float rough, float aniso, float extra, int fmode,
              vec3 N, vec3 T, vec3 B, vec3 V, vec3 L) {
  float NoL = dot(N, L);
  float NoV = dot(N, V);
  if (NoL <= 0.0 || NoV <= 0.0) return vec3(0.0);

  vec3 H = normalize(V + L);
  float NoH = dot(N, H);
  float VoH = max(dot(V, H), 1e-4);
  float HoT = dot(H, T);
  float HoB = dot(H, B);

  vec3 F = fresnelTerm(VoH, fmode);

  if (model == 2) {                       // PxrSurface-style fuzz
    float D = dFuzzCone(NoH, extra);
    return uSpecColor * D * visVelvet(NoL, NoV) * NoL;
  }
  if (model == 3) {                       // Arnold-style sheen
    float D = dSheen(NoH, extra);
    return uSpecColor * D * visVelvet(NoL, NoV) * NoL;
  }

  float alpha = max(rough * rough, 1e-4);
  float ax = alpha;
  float ay = max(alpha * (1.0 - aniso), 1e-4);

  float D, G;
  if (model == 0) {
    D = dBeckmann(NoH, HoT, HoB, ax, ay);
    G = 1.0 / (1.0 + lambdaBeckmann(NoV, dot(V, T), dot(V, B), ax, ay)
                   + lambdaBeckmann(NoL, dot(L, T), dot(L, B), ax, ay));
  } else {
    D = dGGX(NoH, HoT, HoB, ax, ay);
    G = 1.0 / (1.0 + lambdaGGX(NoV, dot(V, T), dot(V, B), ax, ay)
                   + lambdaGGX(NoL, dot(L, T), dot(L, B), ax, ay));
  }
  return F * (D * G / (4.0 * NoV)) * NoL;
}

vec3 tangentFor(vec3 N, vec3 P) {
  vec3 T;
  if (uTangentMode == 1) {                // radial, as seen from the camera
    vec3 r = vec3(P.xy, 0.0);
    T = length(r) < 1e-4 ? vec3(1.0, 0.0, 0.0) : normalize(r);
  } else if (uTangentMode == 2) {         // swirl
    vec3 r = vec3(-P.y, P.x, 0.0);
    T = length(r) < 1e-4 ? vec3(1.0, 0.0, 0.0) : normalize(r);
  } else {                                // longitude, the usual dPdu look
    T = cross(vec3(0.0, 1.0, 0.0), N);
    if (length(T) < 1e-4) T = vec3(1.0, 0.0, 0.0);
    T = normalize(T);
  }
  T = T - N * dot(N, T);
  if (length(T) < 1e-4) T = abs(N.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  T = normalize(T);
  vec3 Bv = cross(N, T);
  // This is exactly what Arnold's specular_rotation does to its tangent.
  return normalize(T * cos(uTangentRot) + Bv * sin(uTangentRot));
}

vec3 tonemapFilmic(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  uv.x *= uRes.x / uRes.y;

  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(uv * 0.45, -1.0));

  float b = dot(ro, rd);
  float c = dot(ro, ro) - 1.0;
  float disc = b * b - c;

  if (disc < 0.0) {
    float vig = 1.0 - 0.25 * length(uv);
    fragColor = vec4(uBg * vig, 1.0);
    return;
  }

  float t = -b - sqrt(disc);
  vec3 P = ro + rd * t;
  vec3 N = normalize(P);
  vec3 V = -rd;

  int side = (uSplit == 1 && gl_FragCoord.x > uRes.x * 0.5) ? 1 : 0;
  int model = side == 0 ? uModel.x : uModel.y;
  float rough = side == 0 ? uRough.x : uRough.y;
  float aniso = side == 0 ? uAniso.x : uAniso.y;
  float extra = side == 0 ? uExtra.x : uExtra.y;
  float gain = side == 0 ? uGain.x : uGain.y;
  int  fmode = side == 0 ? uFresnelMode.x : uFresnelMode.y;
  float diffW = side == 0 ? uDiffuse.x : uDiffuse.y;

  vec3 T = tangentFor(N, P);
  vec3 B = cross(N, T);

  vec3 spec = vec3(0.0);
  vec3 diff = vec3(0.0);
  int ns = clamp(uSamples, 1, 256);
  for (int i = 0; i < 256; i++) {
    if (i >= ns) break;
    vec2 u = vec2(float(i) / float(ns), radicalInverse(uint(i)));
    vec3 L = sampleCone(uLightDir, uLightCos, u);
    spec += evalLobe(model, rough, aniso, extra, fmode, N, T, B, V, L);
    if (diffW > 0.0) {
      diff += uDiffColor * diffW * max(dot(N, L), 0.0) / PI;
    }
  }
  float solidAngle = 2.0 * PI * (1.0 - uLightCos);
  float norm = (solidAngle / float(ns)) * uLightPower;
  vec3 col = spec * norm * gain + diff * norm;

  // A whisper of ambient so the unlit side still reads as a sphere.
  col += uDiffColor * diffW * 0.03;

  // Cheap two-tone sky. Without something to reflect, a metal is just black,
  // and its tint - the whole point of Face/Edge colour - never shows.
  if (uEnvGain > 0.0) {
    // Dark ground to bright sky, with real contrast - a flat grey
    // environment gives the sphere no form and washes out its tint.
    float up = smoothstep(-0.75, 0.95, N.y);
    vec3 sky = mix(vec3(0.015, 0.018, 0.025), vec3(0.70, 0.74, 0.82), up);
    col += uEnvGain * fresnelTerm(max(dot(N, V), 0.0), fmode) * sky;
  }

  col *= exp2(uExposure);
  if (uTonemap == 1) col = tonemapFilmic(col);
  col = clamp(col, 0.0, 1.0);
  col = pow(col, vec3(1.0 / 2.2));

  // Divider between the two halves.
  if (uSplit == 1 && abs(gl_FragCoord.x - uRes.x * 0.5) < 0.75) {
    col = mix(col, vec3(1.0), 0.35);
  }

  fragColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
  }
  return sh;
}

const DEFAULTS = {
  split: false,
  model: [MODEL.GGX, MODEL.GGX],
  roughness: [0.3, 0.3],
  aniso: [0, 0],
  extra: [0.2, 0.2],
  gain: [1, 1],
  tangentMode: 0,
  tangentRot: 0,
  lightDir: [0.0, 0.5, 0.86],
  lightAngle: 8,      // degrees
  lightPower: 40,
  exposure: 0,
  tonemap: 1,
  samples: 64,
  specColor: [0.95, 0.93, 0.88],
  diffuse: 0.05,
  diffColor: [0.16, 0.16, 0.17],
  fresnelMode: 0,
  faceColor: [0.04, 0.04, 0.04],
  edgeColor: [1, 1, 1],
  fresnelExp: 5,
  ior: [1.5, 1.5, 1.5],
  extinction: [0, 0, 0],
  metalness: 0,
  baseColor: [0.8, 0.8, 0.8],
  filmThickness: 0,
  filmIor: 1.4,
  envGain: 0,
};

/**
 * A lit sphere rendered by a fragment shader containing the real BRDF maths.
 * Returns { set, render, ok }. If WebGL2 is unavailable, `ok` is false and a
 * fallback message replaces the canvas - the surrounding prose must still
 * make the point on its own.
 */
export function createShaderball(canvas, opts = {}) {
  if (!canvas) return { ok: false, set() {}, render() {}, config: {} };
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });

  if (!gl) {
    const fb = document.createElement('div');
    fb.className = 'viz__fallback';
    fb.innerHTML =
      '<span lang="en">This live render needs WebGL2, which this browser has turned off. ' +
      'The explanation below stands without it.</span>' +
      '<span lang="pl">Ten podgląd wymaga WebGL2, który jest wyłączony w tej ' +
      'przeglądarce. Wyjaśnienie poniżej jest zrozumiałe także bez niego.</span>';
    canvas.replaceWith(fb);
    return { ok: false, set() {}, render() {} };
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || 'link failed');
  }
  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const loc = (n) => gl.getUniformLocation(prog, n);
  const U = {
    res: loc('uRes'), split: loc('uSplit'), model: loc('uModel'),
    rough: loc('uRough'), aniso: loc('uAniso'), extra: loc('uExtra'),
    gain: loc('uGain'), tangentMode: loc('uTangentMode'),
    tangentRot: loc('uTangentRot'), lightDir: loc('uLightDir'),
    lightCos: loc('uLightCos'), lightPower: loc('uLightPower'),
    exposure: loc('uExposure'), tonemap: loc('uTonemap'),
    samples: loc('uSamples'), bg: loc('uBg'), specColor: loc('uSpecColor'),
    diffuse: loc('uDiffuse'), diffColor: loc('uDiffColor'),
    fresnelMode: loc('uFresnelMode'), faceColor: loc('uFaceColor'),
    edgeColor: loc('uEdgeColor'), fresnelExp: loc('uFresnelExp'),
    ior: loc('uIor'), extinction: loc('uExtinction'),
    metalness: loc('uMetalness'), baseColor: loc('uBaseColor'),
    filmThickness: loc('uFilmThickness'), filmIor: loc('uFilmIor'),
    envGain: loc('uEnvGain'),
  };

  let cfg = { ...DEFAULTS, ...opts };
  let queued = false;
  let visible = true;

  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round((rect.width || 480) * dpr));
    const ratio = parseFloat(canvas.dataset.ratio) || 0.72;
    const h = Math.max(1, Math.round((rect.width || 480) * ratio * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.height = `${Math.round((rect.width || 480) * ratio)}px`;
  }

  function draw() {
    queued = false;
    if (!visible) return;
    sizeCanvas();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.bindVertexArray(vao);

    const n = Math.hypot(...cfg.lightDir);
    const ld = cfg.lightDir.map((v) => v / n);

    gl.uniform2f(U.res, canvas.width, canvas.height);
    gl.uniform1i(U.split, cfg.split ? 1 : 0);
    gl.uniform2i(U.model, cfg.model[0], cfg.model[1]);
    gl.uniform2f(U.rough, cfg.roughness[0], cfg.roughness[1]);
    gl.uniform2f(U.aniso, cfg.aniso[0], cfg.aniso[1]);
    gl.uniform2f(U.extra, cfg.extra[0], cfg.extra[1]);
    gl.uniform2f(U.gain, cfg.gain[0], cfg.gain[1]);
    gl.uniform1i(U.tangentMode, cfg.tangentMode);
    gl.uniform1f(U.tangentRot, cfg.tangentRot);
    gl.uniform3f(U.lightDir, ld[0], ld[1], ld[2]);
    gl.uniform1f(U.lightCos, Math.cos((cfg.lightAngle * Math.PI) / 180));
    gl.uniform1f(U.lightPower, cfg.lightPower);
    gl.uniform1f(U.exposure, cfg.exposure);
    gl.uniform1i(U.tonemap, cfg.tonemap);
    gl.uniform1i(U.samples, cfg.samples);
    gl.uniform3f(U.bg, ...hexToRgb(theme().bg));
    gl.uniform3f(U.specColor, ...cfg.specColor);
    gl.uniform2f(U.diffuse, ...pair(cfg.diffuse));
    gl.uniform3f(U.diffColor, ...cfg.diffColor);
    gl.uniform2i(U.fresnelMode, ...pair(cfg.fresnelMode));
    gl.uniform3f(U.faceColor, ...cfg.faceColor);
    gl.uniform3f(U.edgeColor, ...cfg.edgeColor);
    gl.uniform1f(U.fresnelExp, cfg.fresnelExp);
    gl.uniform3f(U.ior, ...cfg.ior);
    gl.uniform3f(U.extinction, ...cfg.extinction);
    gl.uniform1f(U.metalness, cfg.metalness);
    gl.uniform3f(U.baseColor, ...cfg.baseColor);
    gl.uniform1f(U.filmThickness, cfg.filmThickness);
    gl.uniform1f(U.filmIor, cfg.filmIor);
    gl.uniform1f(U.envGain, cfg.envGain);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function render() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(draw);
  }

  // Only draw what is actually on screen.
  const io = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible) render();
  }, { rootMargin: '200px' });
  io.observe(canvas);

  new ResizeObserver(render).observe(canvas);
  darkQuery.addEventListener('change', render);

  render();

  return {
    ok: true,
    get config() { return cfg; },
    set(patch) {
      cfg = { ...cfg, ...patch };
      render();
    },
    render,
  };
}

/** Convenience: the page-level language, re-exported so pages import once. */
export { currentLang };

/* =======================================================================
   Fresnel + thin film, in JS, for the 2D plots
   These mirror the GLSL above so a curve and a sphere never disagree.
   ======================================================================= */

/** Full Fresnel for a conductor. k = 0 gives the dielectric case. */
export function fresnelConductor(cosT, n, k) {
  const c2 = cosT * cosT;
  const s2 = 1 - c2;
  const n2 = n * n;
  const k2 = k * k;
  const t0 = n2 - k2 - s2;
  const a2b2 = Math.sqrt(Math.max(t0 * t0 + 4 * n2 * k2, 0));
  const t1 = a2b2 + c2;
  const a = Math.sqrt(Math.max(0.5 * (a2b2 + t0), 0));
  const t2 = 2 * a * cosT;
  const Rs = (t1 - t2) / (t1 + t2 + 1e-7);
  const t3 = c2 * a2b2 + s2 * s2;
  const t4 = t2 * s2;
  const Rp = (Rs * (t3 - t4)) / (t3 + t4 + 1e-7);
  return Math.min(Math.max(0.5 * (Rs + Rp), 0), 1);
}

/** Schlick's approximation. */
export function fresnelSchlick(f0, cosT) {
  return f0 + (1 - f0) * Math.pow(1 - cosT, 5);
}

/** PxrSurface Artistic mode: blend face -> edge by the Fresnel exponent. */
export function fresnelArtistic(face, edge, exp, cosT) {
  const t = Math.pow(1 - cosT, exp);
  return face + (edge - face) * t;
}

/** Thin-film interference as an RGB multiplier. Matches the GLSL version. */
export function thinFilmRGB(cosT, thicknessNm, filmIor = 1.4) {
  if (thicknessNm <= 0) return [1, 1, 1];
  const sinF2 = (1 - cosT * cosT) / (filmIor * filmIor);
  if (sinF2 >= 1) return [1, 1, 1];
  const cosF = Math.sqrt(1 - sinF2);
  const opd = 2 * filmIor * thicknessNm * cosF;
  return [612, 549, 464].map((lam) => 0.5 + 0.5 * Math.cos((2 * Math.PI * opd) / lam + Math.PI));
}

/** Linear 0-1 RGB triple to a CSS colour, with the usual gamma encode. */
export function rgbCss(rgb, gamma = 2.2) {
  const c = rgb.map((v) => Math.round(255 * Math.pow(Math.min(Math.max(v, 0), 1), 1 / gamma)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/* =======================================================================
   A tiny deterministic RNG, so animated widgets look random but redraw
   identically and never jitter between frames.
   ======================================================================= */

export function makeRng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* =======================================================================
   Animation loop that respects prefers-reduced-motion and stops when the
   canvas scrolls off screen.
   ======================================================================= */

export function animate(canvas, step) {
  if (!canvas) return { start() {}, stop() {}, running: false };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let raf = null;
  let visible = false;
  let t = 0;

  function frame() {
    t += 1;
    step(t);
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (raf === null && visible && !reduced.matches) frame();
  }
  function stop() {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
  }

  new IntersectionObserver((e) => {
    visible = e[0].isIntersecting;
    if (visible) start(); else stop();
  }, { rootMargin: '150px' }).observe(canvas);

  reduced.addEventListener('change', () => { stop(); step(t); start(); });

  return { start, stop, get running() { return raf !== null; } };
}
