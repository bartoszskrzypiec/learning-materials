/**
 * sky3d.js — three.js widget engine: 3D scenes a reader can turn in their hands.
 *
 * Promoted from `atmosfera_chmury_book` (assets/sky3d.js), where it drives the
 * eleven 3D widgets of "Atmosfera i chmury dla ciekawych". The comments below
 * are in Polish, as written in that book; the API and every string a reader
 * can see are configurable and language-neutral.
 *
 * Same shape as viz.js: a factory takes a DOM element plus a config object and
 * returns { ok, set(patch), render, dispose }. Nothing assumes anything about
 * the page it stands on.
 *
 * THE ONE DEPENDENCY: three.js, vendored in ./vendor/ (see ./vendor/VERSION),
 * never loaded from a CDN. `sky3d.js` imports `./vendor/three.module.js` by
 * relative path, so keep the two adjacent when you copy them into a book. No
 * import map, no package.json, no build step — copy both, done.
 *
 * Kontrakt tokenów CSS — moduł czyta WYŁĄCZNIE te nazwy, nigdy --amber/--cyan
 * bezpośrednio, żeby dało się go przenieść do innej książki bez edycji:
 *   --text  --text-muted  --border  --accent  --viz-a  --viz-b  --viz-grid  --viz-bg
 * (assets/css/viz3d.css, the matching component layer, additionally reads
 * --bg-elevated and --radius — the same contract widgets.css uses.)
 *
 * Trzy rzeczy, które robi każdy widget, i o których łatwo zapomnieć:
 *  1. Każda awaria pokazuje .viz3d__fallback ze zdaniem, co zawiodło — brak
 *     WebGL, błąd shadera, a przy otwarciu strony z dysku także niewczytany
 *     moduł (tego boot() nie widzi, bo w ogóle nie rusza — łapie to wartownik
 *     w assets/js/sky3d-fallback.js). boot() ustawia host.dataset.sky3d na
 *     'ok' / 'webgl' / 'shader' i woła window.__sky3dPokazBrak. Czytelnik
 *     nigdy nie ogląda pustego czarnego prostokąta.
 *  2. IntersectionObserver → poza ekranem nie renderujemy w ogóle. Przy jedenastu
 *     widgetach w książce to nie optymalizacja, tylko warunek używalności na telefonie.
 *  3. prefers-reduced-motion → pętla animacji milczy, render tylko na zmianę parametru.
 */

import * as THREE from './vendor/three.module.js';

/* ============================================================
   1. WSPÓLNY RDZEŃ
   ============================================================ */

/** Odczyt palety ze stylów strony. Wywoływane raz na widget, przy starcie. */
export function theme(el) {
  const cs = getComputedStyle(el || document.documentElement);
  const pick = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  return {
    text: pick('--text', '#ecebe4'),
    muted: pick('--text-muted', '#8b909b'),
    border: pick('--border', '#2a2f38'),
    accent: pick('--accent', '#e8a33d'),
    a: pick('--viz-a', '#9c82d8'),
    b: pick('--viz-b', '#4fc3c0'),
    grid: pick('--viz-grid', '#2a2f38'),
    bg: pick('--viz-bg', '#20242c'),
  };
}

const reducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Uruchamia scenę three.js wewnątrz .viz3d__stage znalezionego w `host`.
 *
 * Zwraca null, jeśli WebGL2 jest niedostępny — wtedy host dostaje .no-webgl
 * i CSS przejmuje pokazanie fallbacku. Każda funkcja createX() sprawdza ten
 * null i zwraca { ok:false }, więc strona nigdy nie wywali się na widgecie.
 */
function boot(host, opts = {}) {
  const stage = host.querySelector('.viz3d__stage');
  if (!stage) return null;
  const canvas = stage.querySelector('canvas');
  if (!canvas) return null;

  /* Jedno miejsce na "widget się nie uda": stan na host.dataset.sky3d (czyta go
     wartownik w interactive.js), klasa .no-webgl (CSS pokazuje fallback) i zdanie
     z powodem. przerwij() dokłada return null dla wczesnego wyjścia z boot(). */
  function oznaczBrak(powod) {
    host.dataset.sky3d = powod;
    host.classList.add('no-webgl');
    if (window.__sky3dPokazBrak) window.__sky3dPokazBrak(host, powod);
  }
  function przerwij(powod) { oznaczBrak(powod); return null; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: opts.antialias !== false,
      alpha: false,
      powerPreference: 'low-power',
    });
  } catch (e) {
    return przerwij('webgl');
  }
  if (!renderer.getContext()) {
    return przerwij('webgl');
  }

  /* Błąd kompilacji/linkowania shadera nie rzuca wyjątku — three.js tylko
     loguje. Bez tego haka raymarchowane niebo/chmura zostawiłyby pusty
     prostokąt w kolorze czyszczenia. */
  renderer.debug.onShaderError = (gl, prog, glVertexShader, glFragmentShader) => {
    oznaczBrak('shader');
    console.error('sky3d: shader nie skompilowany\n',
      gl.getShaderInfoLog(glFragmentShader) || gl.getProgramInfoLog(prog));
  };

  const t = theme(host);
  renderer.setClearColor(new THREE.Color(opts.clear || t.bg), 1);

  /* Skala renderowania. Shadery raymarchowane (niebo, chmura) liczą tysiące
     operacji na piksel, więc renderujemy je w obnizonej rozdzielczosci i
     pozwalamy CSS je rozciagnac. Na miekkim, chmurnym obrazie tego nie widac,
     a koszt spada z kwadratem skali. Widgety geometryczne zostaja przy 1. */
  let skala = opts.renderScale != null ? opts.renderScale : 1;
  const maxDpr = opts.maxPixelRatio != null ? opts.maxPixelRatio : 2;
  function ustawSkale(v) {
    skala = Math.max(0.28, Math.min(1, v));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr) * skala);
    resize();
  }

  const scene = new THREE.Scene();
  const camera = opts.ortho
    ? new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 500)
    : new THREE.PerspectiveCamera(opts.fov || 45, 16 / 9, 0.05, 4000);

  const state = {
    host, stage, canvas, renderer, scene, camera, theme: t,
    visible: false, disposed: false, needsRender: true,
    frameCbs: [], animating: false,
  };

  /* Rozmiar. ResizeObserver zamiast window.resize — kolumna tekstu potrafi
     zmienić szerokość bez zmiany rozmiaru okna (np. po otwarciu modala). */
  function resize() {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    if (camera.isPerspectiveCamera) {
      camera.aspect = w / h;
    } else {
      const s = opts.orthoSize || 1;
      const ar = w / h;
      camera.left = -s * ar; camera.right = s * ar;
      camera.top = s; camera.bottom = -s;
    }
    camera.updateProjectionMatrix();
    state.needsRender = true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr) * skala);
  resize();

  /* Widoczność. Poza ekranem pętla w ogóle nie chodzi. */
  const io = new IntersectionObserver((entries) => {
    state.visible = entries.some((e) => e.isIntersecting);
    if (state.visible) { state.needsRender = true; tick(); }
  }, { rootMargin: '0px' });
  io.observe(stage);

  let raf = 0;
  let zmierzone = 0;          // ile klatek juz zmierzylismy
  let ostatniaAnim = 0;       // do ograniczenia animacji do ~12 kl./s

  function tick(teraz) {
    if (state.disposed || !state.visible) { raf = 0; return; }
    const now = teraz || performance.now();
    const chceAnimowac = state.animating && !reducedMotion();
    /* Animacja dławiona do ~12 klatek na sekundę. Dryf chmury to powolny ruch,
       nikt nie zauważy różnicy wobec 60 kl./s, a koszt spada pięciokrotnie. */
    const czasNaAnim = chceAnimowac && (now - ostatniaAnim) >= 80;

    if (state.needsRender || czasNaAnim) {
      const start = performance.now();
      for (const cb of state.frameCbs) cb(now);
      renderer.render(scene, camera);
      state.needsRender = false;
      if (czasNaAnim) ostatniaAnim = now;

      /* Adaptacyjna jakość. Mierzymy kilka pierwszych klatek i jeśli sprzęt
         nie wyrabia, schodzimy z rozdzielczością. Lepiej lekko rozmyta chmura
         niż strona, która nie reaguje na kliknięcia. */
      if (zmierzone < 3 && opts.adaptive !== false) {
        const koszt = performance.now() - start;
        zmierzone++;
        if (koszt > 45 && skala > 0.3) {
          ustawSkale(skala * (koszt > 160 ? 0.5 : 0.72));
          zmierzone = 0;
        }
      }
    }
    raf = (chceAnimowac || state.needsRender) ? requestAnimationFrame(tick) : 0;
  }
  state.invalidate = () => {
    state.needsRender = true;
    if (state.visible && !raf) raf = requestAnimationFrame(tick);
  };
  state.onFrame = (cb) => state.frameCbs.push(cb);
  state.setRenderScale = ustawSkale;
  state.animate = (on) => {
    state.animating = on;
    if (on) state.invalidate();
  };

  state.dispose = () => {
    state.disposed = true;
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect(); io.disconnect();
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    renderer.dispose();
  };

  host.dataset.sky3d = 'ok';
  return state;
}

/**
 * Kamera orbitalna. Własna, minimalna implementacja zamiast OrbitControls
 * z examples/jsm — trzy powody: nie chcemy wciągać do repo całego katalogu
 * addons, potrzebujemy tylko obrotu i zoomu, i chcemy pełnej kontroli nad
 * tym, że dotyk nie blokuje przewijania strony w pionie.
 */
function orbit(state, cfg = {}) {
  const cam = state.camera;
  const target = cfg.target ? cfg.target.clone() : new THREE.Vector3(0, 0, 0);
  const s = {
    theta: cfg.theta != null ? cfg.theta : 0.7,
    phi: cfg.phi != null ? cfg.phi : 1.15,  // liczone od osi +Y: >pi/2 = kamera pod celem, patrzy w gore
    dist: cfg.dist != null ? cfg.dist : 6,
    minPhi: cfg.minPhi != null ? cfg.minPhi : 0.08,
    maxPhi: cfg.maxPhi != null ? cfg.maxPhi : Math.PI - 0.08,
    minDist: cfg.minDist != null ? cfg.minDist : 1.5,
    maxDist: cfg.maxDist != null ? cfg.maxDist : 60,
    spin: cfg.spin || 0,
    target,
  };

  function apply() {
    const sp = Math.sin(s.phi), cp = Math.cos(s.phi);
    cam.position.set(
      target.x + s.dist * sp * Math.sin(s.theta),
      target.y + s.dist * cp,
      target.z + s.dist * sp * Math.cos(s.theta)
    );
    cam.lookAt(target);
    state.needsRender = true;
  }
  apply();

  if (cfg.interactive !== false) {
    state.stage.classList.add('is-grab');
    let drag = null;
    const el = state.canvas;

    el.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      /* Dotyk: dopóki gest wygląda na pionowe przewijanie strony, nie
         przechwytujemy go. Inaczej widget zjadałby scroll na telefonie. */
      if (e.pointerType === 'touch' && drag.moved < 12 && Math.abs(dy) > Math.abs(dx)) return;
      if (e.pointerType === 'touch') e.preventDefault();
      s.theta -= dx * 0.008;
      s.phi = Math.min(s.maxPhi, Math.max(s.minPhi, s.phi - dy * 0.006));
      drag.x = e.clientX; drag.y = e.clientY;
      apply(); state.invalidate();
    }, { passive: false });
    const end = (e) => {
      if (drag && e.pointerId === drag.id) { try { el.releasePointerCapture(drag.id); } catch (_) {} drag = null; }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    /* Zoom kolkiem TYLKO z wcisnietym Ctrl/Cmd, jak w mapach. Bez tego widget
       wysoki na 450 px przechwytywal przewijanie strony: czytelnik przewijajacy
       tekst zatrzymywal sie na widgecie i strona przestawala reagowac na kolko. */
    el.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;   // zwykle kolko przewija strone
      e.preventDefault();
      s.dist = Math.min(s.maxDist, Math.max(s.minDist, s.dist * (1 + Math.sign(e.deltaY) * 0.12)));
      apply(); state.invalidate();
    }, { passive: false });
  }

  if (s.spin) {
    let last = performance.now();
    state.onFrame((now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      s.theta += s.spin * dt;
      apply();
    });
    state.animate(true);
  }

  return { s, apply, setTarget: (v) => { target.copy(v); apply(); } };
}

/**
 * Etykiety 2D przypięte do punktów 3D. Zamiast ładować font i robić TextGeometry
 * (dodatkowy plik, gorsza czytelność na małym ekranie) rzutujemy punkt na ekran
 * i pozycjonujemy zwykły <span>. Tekst zostaje tekstem — da się go zaznaczyć,
 * czytnik ekranu go widzi, i skaluje się z ustawieniami przeglądarki.
 */
function labelLayer(state) {
  const layer = document.createElement('div');
  layer.className = 'viz3d__labels';
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  state.stage.appendChild(layer);
  const items = [];

  function add(text, pos, opts = {}) {
    const span = document.createElement('span');
    span.textContent = text;
    span.style.cssText =
      'position:absolute;transform:translate(-50%,-50%);white-space:nowrap;' +
      'font-family:var(--mono);font-size:' + (opts.size || 10.5) + 'px;letter-spacing:.04em;' +
      'color:' + (opts.color || state.theme.muted) + ';' +
      'text-shadow:0 1px 3px rgba(0,0,0,.85);padding:0 2px;';
    layer.appendChild(span);
    const item = { span, pos: pos.clone(), hidden: false };
    items.push(item);
    return item;
  }

  const v = new THREE.Vector3();
  state.onFrame(() => {
    const cam = state.camera;
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const w = state.stage.clientWidth, h = state.stage.clientHeight;
    for (const it of items) {
      v.copy(it.pos).project(state.camera);
      const behind = v.z > 1;
      it.span.style.display = it.hidden || behind ? 'none' : '';
      it.span.style.left = ((v.x * 0.5 + 0.5) * w).toFixed(1) + 'px';
      it.span.style.top = ((-v.y * 0.5 + 0.5) * h).toFixed(1) + 'px';
    }
  });

  return { add, items, layer };
}

/** Kwadrat na cały kadr — nośnik dla shaderów proceduralnych (niebo, chmury). */
function fullscreenQuad(state, fragmentShader, uniforms) {
  const geo = new THREE.PlaneGeometry(2, 2);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  state.scene.add(mesh);
  return { mesh, mat, uniforms };
}

/* ============================================================
   2. NIEBO — createSkyDome
   ------------------------------------------------------------
   Widget flagowy książki. Prawdziwe pojedyncze rozpraszanie w warstwie
   atmosfery, ray marchowane w shaderze: Rayleigh (cząsteczki gazu) plus
   Mie (aerozole). To nie jest gradient malowany "na oko" — kolory wychodzą
   z całkowania po drodze promienia, więc gdy czytelnik obniża Słońce, niebo
   czerwienieje z tego samego powodu, co naprawdę.
   ============================================================ */

const SKY_FRAG = `
precision highp float;
varying vec2 vUv;

uniform vec2  uRes;
uniform float uSunElev;    // wysokosc Slonca w radianach (moze byc ujemna)
uniform float uSunAzim;    // azymut Slonca wzgledem kierunku patrzenia
uniform float uTurbidity;  // zamet: mnoznik gestosci aerozolu (1 = czyste powietrze)
uniform float uAltitude;   // wysokosc obserwatora w metrach
uniform float uYaw;        // rozgladanie sie w poziomie
uniform float uPitch;      // rozgladanie sie w pionie
uniform float uExposure;
uniform float uFov;

const float R_GROUND = 6371000.0;
const float R_ATMOS  = 6471000.0;
const float H_RAY    = 8000.0;   // skala wysokosci dla czasteczek gazu
const float H_MIE    = 1200.0;   // skala wysokosci dla aerozolu
const vec3  BETA_RAY = vec3(5.5e-6, 13.0e-6, 22.4e-6); // ~1/lambda^4
const float BETA_MIE = 21e-6;
const float MIE_G    = 0.76;
// Kroki marszu. Kazdy krok widzenia odpala wewnetrzna petle swiatla, wiec
// koszt to iloczyn tych dwoch liczb — obniżenie ich jest najtanszym zyskiem.
const int   STEPS_VIEW  = 14;
const int   STEPS_LIGHT = 4;

// Przeciecie promienia ze sfera o srodku w (0,0,0). Zwraca (blizsze, dalsze).
vec2 raySphere(vec3 o, vec3 d, float r){
  float b = dot(o, d);
  float c = dot(o, o) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(1.0, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

float phaseRayleigh(float mu){ return 3.0 / (16.0 * 3.14159265) * (1.0 + mu * mu); }

float phaseMie(float mu){
  float g = MIE_G;
  float gg = g * g;
  float d = 1.0 + gg - 2.0 * g * mu;
  return 3.0 / (8.0 * 3.14159265) * ((1.0 - gg) * (1.0 + mu * mu))
       / ((2.0 + gg) * pow(max(d, 1e-4), 1.5));
}

vec3 scatter(vec3 origin, vec3 dir, vec3 sunDir, float turb){
  vec2 atm = raySphere(origin, dir, R_ATMOS);
  if (atm.y < 0.0) return vec3(0.0);
  atm.x = max(atm.x, 0.0);

  // Jesli promien trafia w planete, konczymy na powierzchni.
  vec2 gnd = raySphere(origin, dir, R_GROUND);
  float end = (gnd.x > 0.0) ? gnd.x : atm.y;

  float segment = (end - atm.x) / float(STEPS_VIEW);
  float t = atm.x + segment * 0.5;

  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  float odR = 0.0;  // droga optyczna wzdluz promienia widzenia
  float odM = 0.0;

  float betaMie = BETA_MIE * turb;

  for (int i = 0; i < STEPS_VIEW; i++){
    vec3 p = origin + dir * t;
    float h = length(p) - R_GROUND;
    float hR = exp(-h / H_RAY) * segment;
    float hM = exp(-h / H_MIE) * segment;
    odR += hR;
    odM += hM;

    // Droga optyczna od punktu p w strone Slonca.
    vec2 la = raySphere(p, sunDir, R_ATMOS);
    float lSeg = la.y / float(STEPS_LIGHT);
    float lt = lSeg * 0.5;
    float lodR = 0.0;
    float lodM = 0.0;
    bool blocked = false;

    for (int j = 0; j < STEPS_LIGHT; j++){
      vec3 lp = p + sunDir * lt;
      float lh = length(lp) - R_GROUND;
      if (lh < 0.0) { blocked = true; break; }
      lodR += exp(-lh / H_RAY) * lSeg;
      lodM += exp(-lh / H_MIE) * lSeg;
      lt += lSeg;
    }

    if (!blocked){
      vec3 tau = BETA_RAY * (odR + lodR) + vec3(betaMie * 1.1 * (odM + lodM));
      vec3 att = exp(-tau);
      sumR += hR * att;
      sumM += hM * att;
    }
    t += segment;
  }

  float mu = dot(dir, sunDir);
  vec3 col = 22.0 * (sumR * BETA_RAY * phaseRayleigh(mu)
                   + sumM * betaMie * phaseMie(mu));
  return col;
}

void main(){
  vec2 uv = (vUv * 2.0 - 1.0);
  uv.x *= uRes.x / uRes.y;
  float f = tan(uFov * 0.5);

  // Kierunek patrzenia: kamera na ziemi, rozgladajaca sie yaw/pitch.
  vec3 d = normalize(vec3(uv.x * f, uv.y * f + uPitch, -1.0));
  float cy = cos(uYaw), sy = sin(uYaw);
  d = normalize(vec3(d.x * cy - d.z * sy, d.y, d.x * sy + d.z * cy));

  // Zamiana na uklad planety: y = w gore od srodka Ziemi.
  vec3 origin = vec3(0.0, R_GROUND + max(uAltitude, 1.0), 0.0);
  vec3 dir = normalize(vec3(d.x, d.y, d.z));

  // Azymut 0 = Slonce dokladnie przed domyslnym kierunkiem patrzenia (-z).
  // Bez minusa przy z Slonce startuje ZA obserwatorem i czytelnik widzi
  // puste niebo, nie rozumiejac, czemu suwak "wysokosc Slonca" nic nie robi.
  vec3 sunDir = normalize(vec3(
    cos(uSunElev) * sin(uSunAzim),
    sin(uSunElev),
    -cos(uSunElev) * cos(uSunAzim)
  ));

  vec3 col = scatter(origin, dir, sunDir, uTurbidity);

  // Tarcza Slonca. Srednica katowa ~0.53 stopnia; miekka krawedz, zeby nie
  // robic aliasingu na ostrym kole.
  float sunCos = dot(dir, sunDir);
  float disc = smoothstep(0.99987, 0.99997, sunCos);
  if (sunDir.y > -0.06) col += vec3(1.0, 0.92, 0.78) * disc * 34.0 * smoothstep(-0.06, 0.02, sunDir.y);

  // Ziemia: ciemny, lekko rozswietlony przedplan zamiast czarnej polowy kadru.
  if (dir.y < 0.0){
    float k = smoothstep(0.0, -0.09, dir.y);
    vec3 ground = mix(col, vec3(0.020, 0.023, 0.028), k * 0.94);
    col = ground;
  }

  col *= uExposure;
  col = vec3(1.0) - exp(-col);          // prosty tonemapping
  col = pow(col, vec3(1.0 / 2.2));      // gamma
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * @param {HTMLElement} host  element .viz3d
 * @param {object} cfg  sunElev (stopnie), sunAzim (stopnie), turbidity, altitude (m),
 *                      yaw/pitch, exposure, fov (stopnie), spin (auto-obrót doby)
 */
export function createSkyDome(host, cfg = {}) {
  const st = boot(host, { clear: '#0b0d12', renderScale: 0.6, maxPixelRatio: 1.5 });
  if (!st) return { ok: false, set() {}, render() {}, dispose() {} };

  const U = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uSunElev: { value: THREE.MathUtils.degToRad(cfg.sunElev != null ? cfg.sunElev : 25) },
    uSunAzim: { value: THREE.MathUtils.degToRad(cfg.sunAzim != null ? cfg.sunAzim : 0) },
    uTurbidity: { value: cfg.turbidity != null ? cfg.turbidity : 1 },
    uAltitude: { value: cfg.altitude != null ? cfg.altitude : 2 },
    uYaw: { value: THREE.MathUtils.degToRad(cfg.yaw || 0) },
    uPitch: { value: cfg.pitch != null ? cfg.pitch : 0.16 },
    uExposure: { value: cfg.exposure != null ? cfg.exposure : 1.0 },
    uFov: { value: THREE.MathUtils.degToRad(cfg.fov != null ? cfg.fov : 70) },
  };

  const quad = fullscreenQuad(st, SKY_FRAG, U);
  st.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  st.onFrame(() => {
    U.uRes.value.set(st.stage.clientWidth || 1, st.stage.clientHeight || 1);
  });

  /* Rozglądanie się w poziomie. Niebo jest jedyną sceną, w której obracamy
     kierunek patrzenia zamiast obiektu — bo obiektem jest cała kopuła. */
  if (cfg.look !== false) {
    st.stage.classList.add('is-grab');
    let drag = null;
    const el = st.canvas;
    el.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (e.pointerType === 'touch' && drag.moved < 12 && Math.abs(dy) > Math.abs(dx)) return;
      if (e.pointerType === 'touch') e.preventDefault();
      U.uYaw.value -= dx * 0.004;
      U.uPitch.value = Math.min(0.75, Math.max(-0.35, U.uPitch.value + dy * 0.0022));
      drag.x = e.clientX; drag.y = e.clientY;
      st.invalidate();
    }, { passive: false });
    const end = (e) => {
      if (drag && e.pointerId === drag.id) { try { el.releasePointerCapture(drag.id); } catch (_) {} drag = null; }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  if (cfg.spin) {
    let last = performance.now();
    st.onFrame((now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      U.uSunElev.value += dt * cfg.spin;
      if (U.uSunElev.value > Math.PI * 0.55) U.uSunElev.value = -0.22;
    });
    st.animate(true);
  }

  const api = {
    ok: true,
    uniforms: U,
    set(patch) {
      if (patch.sunElev != null) U.uSunElev.value = THREE.MathUtils.degToRad(patch.sunElev);
      if (patch.sunAzim != null) U.uSunAzim.value = THREE.MathUtils.degToRad(patch.sunAzim);
      if (patch.turbidity != null) U.uTurbidity.value = patch.turbidity;
      if (patch.altitude != null) U.uAltitude.value = patch.altitude;
      if (patch.exposure != null) U.uExposure.value = patch.exposure;
      if (patch.yaw != null) U.uYaw.value = THREE.MathUtils.degToRad(patch.yaw);
      if (patch.pitch != null) U.uPitch.value = patch.pitch;
      if (patch.fov != null) U.uFov.value = THREE.MathUtils.degToRad(patch.fov);
      st.invalidate();
    },
    render: () => st.invalidate(),
    dispose: () => st.dispose(),
  };
  st.invalidate();
  return api;
}

/* ============================================================
   3. CHMURA WOLUMETRYCZNA — createCloudVolume
   ------------------------------------------------------------
   Raymarching gęstości opisanej sumą oktaw szumu, oświetlony jednym
   kierunkowym światłem z drugim, krótszym marchem w stronę Słońca.
   Sedno dydaktyczne: WSZYSTKIE rodzaje chmur w tej książce wychodzą
   z tego jednego shadera. Różnica między Stratusem a Cumulusem to
   dosłownie kilka liczb w uniformach.
   ============================================================ */

const CLOUD_FRAG = `
precision highp float;
varying vec2 vUv;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCam;
uniform mat3  uCamBasis;
uniform float uFov;

uniform float uBase;       // wysokosc podstawy (jednostki sceny)
uniform float uThick;      // grubosc
uniform float uDensity;    // gestosc
uniform float uCoverage;   // pokrycie: ile nieba zajmuje chmura
uniform float uLumpy;      // klebiastosc vs warstwowosc (0 = plaska warstwa)
uniform float uIce;        // frakcja lodu: zmiekcza gore i rozmywa krawedzie
uniform float uSpread;     // zasieg poziomy: maly = pojedyncza chmura, duzy = poklad
uniform vec3  uSunDir;
uniform vec3  uSkyTop;
uniform vec3  uSkyBot;
uniform float uAnisotropy; // g funkcji fazowej

float hash(vec3 p){
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}

/* Trzy oktawy zamiast pieciu. Kazda oktawa to osiem wywolan hash, a fbm jest
   wolane 4 razy na krok marszu — piata oktawa kosztowala wiecej niz wnosila
   przy chmurze rozmytej i tak przez rozpraszanie wielokrotne. */
float fbm(vec3 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++){
    s += a * vnoise(p);
    p = p * 2.02 + vec3(1.7, 9.2, 3.3);
    a *= 0.5;
  }
  return s * 1.14;   // wyrownanie zakresu po usunieciu dwoch oktaw
}

/* Gestosc w punkcie. Profil pionowy (miekki dol, miekka gora) razy szum.
   uLumpy miesza plaska warstwe z klebiasta struktura — to jest ten jeden
   parametr, ktory zamienia Stratusa w Cumulusa. */
float density(vec3 p){
  float top = uBase + uThick;
  if (p.y < uBase || p.y > top) return 0.0;

  float h = (p.y - uBase) / max(uThick, 1e-3);
  // Dol tniemy ostro (poziom kondensacji jest ostry), gore miekko.
  float profile = smoothstep(0.0, 0.06 + 0.10 * uLumpy, h)
                * (1.0 - smoothstep(0.55 - 0.35 * uLumpy + 0.25 * uIce, 1.0, h));

  float skala = 1.35 / max(uThick, 0.35);
  vec3 q = p * skala + vec3(uTime * 0.02, 0.0, 0.0);
  float base = fbm(q);
  float detail = fbm(q * 3.1 + vec3(0.0, uTime * 0.05, 0.0));

  // Klebiastosc: przy uLumpy=0 zostaje gladka warstwa, przy 1 pelna struktura.
  float n = mix(0.62, base, 0.35 + 0.65 * uLumpy);
  n -= detail * (0.12 + 0.22 * uLumpy);
  n = mix(n, n * (0.75 + 0.25 * base), uIce);

  // Ograniczenie poziome. Bez niego kazdy preset jest nieskonczona plyta:
  // Cumulus przestaje byc POJEDYNCZA chmura, a to wlasnie jest jego cecha.
  float radial = 1.0 - smoothstep(uSpread * 0.45, uSpread, length(p.xz));

  float d = (n - (1.0 - uCoverage)) * profile * radial;
  return max(d, 0.0) * uDensity;
}

float phaseHG(float mu, float g){
  float gg = g * g;
  return (1.0 - gg) / (4.0 * 3.14159265 * pow(max(1.0 + gg - 2.0 * g * mu, 1e-4), 1.5));
}

void main(){
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x *= uRes.x / uRes.y;
  vec3 dir = normalize(uCamBasis * vec3(uv * tan(uFov * 0.5), -1.0));
  vec3 ro = uCam;

  // Tlo: gradient nieba plus ziemia. Ziemia nie jest ozdobnikiem — bez niej
  // chmura wisi w szarej pustce i czytelnik nie ma skali ani horyzontu.
  float horizon = smoothstep(-0.02, 0.55, dir.y);
  vec3 sky = mix(uSkyBot, uSkyTop, horizon);
  vec3 col = sky;
  if (dir.y < 0.0){
    float k = smoothstep(0.0, -0.05, dir.y);
    col = mix(sky, vec3(0.026, 0.030, 0.036), k * 0.96);
  }

  // Ograniczamy marching do plyty, w ktorej moze byc chmura.
  float top = uBase + uThick;
  float t0, t1;
  if (abs(dir.y) < 1e-4){
    if (ro.y < uBase || ro.y > top) { gl_FragColor = vec4(pow(col, vec3(1.0/2.2)), 1.0); return; }
    t0 = 0.0; t1 = 140.0;
  } else {
    float ta = (uBase - ro.y) / dir.y;
    float tb = (top - ro.y) / dir.y;
    t0 = min(ta, tb); t1 = max(ta, tb);
    t0 = max(t0, 0.0);
    t1 = min(t1, 140.0);
  }
  if (t1 <= t0){ gl_FragColor = vec4(pow(col, vec3(1.0/2.2)), 1.0); return; }

  /* Krok marszu ograniczony od gory. Bez tego Cumulonimbus (10 km grubosci)
     dostawal krok dlugi na 400 m i jitter, ktory mial ukryc banding, zamieniał
     sie w widoczne ziarno. Petla i tak konczy sie wczesniej przez przerwanie
     przy niskiej transmitancji, wiec ograniczenie nie kosztuje w cienkich
     chmurach nic, a w grubych ratuje obraz. */
  const int STEPS = 34;
  float dt = min((t1 - t0) / float(STEPS), 0.5);
  float t = t0 + dt * hash(vec3(gl_FragCoord.xy, 1.0)) * 0.6;

  float transmittance = 1.0;
  vec3 scattered = vec3(0.0);
  float mu = dot(dir, uSunDir);
  float ph = mix(phaseHG(mu, uAnisotropy), phaseHG(mu, -uAnisotropy * 0.4), 0.25);

  for (int i = 0; i < STEPS; i++){
    if (transmittance < 0.01) break;
    vec3 p = ro + dir * t;
    float d = density(p);
    if (d > 0.001){
      // Krotki march w strone Slonca — to on robi jasna gore i ciemny spod.
      float shadow = 0.0;
      float ls = max(0.30, uThick * 0.23);
      for (int j = 1; j <= 3; j++){
        vec3 lp = p + uSunDir * (ls * float(j));
        shadow += density(lp) * ls;
      }
      float lightT = exp(-shadow * 1.35);
      // Wielokrotne rozpraszanie na tanio: dodajemy czlon, ktory nie gasnie
      // tak szybko. Bez niego chmura wyglada jak plastik.
      float multi = exp(-shadow * 0.32) * 0.45;
      vec3 lit = vec3(1.0, 0.97, 0.92) * (lightT * ph * 3.4 + multi)
               + sky * 0.38 * (0.25 + 0.75 * lightT);
      float a = 1.0 - exp(-d * dt * 7.0);   // dt jest teraz wieksze, wiec zostaje
      scattered += transmittance * a * lit;
      transmittance *= 1.0 - a;
    }
    t += dt;
  }

  col = col * transmittance + scattered;
  col = vec3(1.0) - exp(-col * 1.15);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;

/** Presety rodzajów chmur — to jest cała różnica między nimi. */
export const CLOUD_PRESETS = {
  // Jednostka sceny = 1 KILOMETR. Wysokosci i gruboscii sa realne, bo widget
  // podpisuje je liczbami i czytelnik ma je porownywac z prawdziwym niebem.
  //               podstawa grubosc gestosc pokrycie klebiastosc lod  zasieg [km]
  stratus:       { base: 0.3, thick: 0.5, density: 2.6, coverage: 0.97, lumpy: 0.06, ice: 0.0,  spread: 24 },
  stratocumulus: { base: 1.0, thick: 0.7, density: 3.4, coverage: 0.72, lumpy: 0.72, ice: 0.0,  spread: 20 },
  nimbostratus:  { base: 0.6, thick: 3.0, density: 1.9, coverage: 0.99, lumpy: 0.12, ice: 0.15, spread: 26 },
  cumulus:       { base: 1.2, thick: 1.0, density: 3.2, coverage: 0.86, lumpy: 0.92, ice: 0.0,  spread: 2.2 },
  congestus:     { base: 1.2, thick: 4.0, density: 2.4, coverage: 0.88, lumpy: 0.95, ice: 0.10, spread: 3.0 },
  cumulonimbus:  { base: 1.0, thick: 10.0, density: 2.0, coverage: 0.90, lumpy: 0.86, ice: 0.55, spread: 5.5 },
  altocumulus:   { base: 3.5, thick: 0.4, density: 4.4, coverage: 0.66, lumpy: 0.78, ice: 0.05, spread: 16 },
  altostratus:   { base: 3.5, thick: 1.5, density: 1.3, coverage: 0.97, lumpy: 0.06, ice: 0.25, spread: 24 },
  cirrus:        { base: 8.0, thick: 0.8, density: 0.75, coverage: 0.80, lumpy: 0.52, ice: 1.0,  spread: 16 },
  cirrostratus:  { base: 8.0, thick: 0.7, density: 0.40, coverage: 0.95, lumpy: 0.06, ice: 1.0,  spread: 26 },
};

export function createCloudVolume(host, cfg = {}) {
  const st = boot(host, { clear: '#141821', renderScale: 0.55, maxPixelRatio: 1.5 });
  if (!st) return { ok: false, set() {}, render() {}, dispose() {} };

  const p = Object.assign(
    { base: 1.2, thick: 1.0, density: 3.2, coverage: 0.86, lumpy: 0.92, ice: 0.0, spread: 2.2 },
    cfg.preset ? CLOUD_PRESETS[cfg.preset] : null,
    cfg
  );

  const U = {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3(0, 0.6, 7) },
    uCamBasis: { value: new THREE.Matrix3() },
    uFov: { value: THREE.MathUtils.degToRad(cfg.fov || 42) },
    uBase: { value: p.base },
    uThick: { value: p.thick },
    uDensity: { value: p.density },
    uCoverage: { value: p.coverage },
    uLumpy: { value: p.lumpy },
    uIce: { value: p.ice },
    uSpread: { value: p.spread != null ? p.spread : 3.4 },
    uSunDir: { value: new THREE.Vector3(0.45, 0.72, 0.52).normalize() },
    uSkyTop: { value: new THREE.Color(0.16, 0.33, 0.62) },
    uSkyBot: { value: new THREE.Color(0.58, 0.68, 0.80) },
    uAnisotropy: { value: cfg.anisotropy != null ? cfg.anisotropy : 0.62 },
  };

  fullscreenQuad(st, CLOUD_FRAG, U);
  st.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  /* Kamera jest wirtualna (shader), więc orbitę liczymy sami i wsadzamy
     do uniformów jako pozycja + baza ortonormalna. */
  /* Model kamery: obserwator STOI NA ZIEMI i patrzy w gore na chmure.
     To nie jest ozdobnik — orbita swobodna wokol chmury dawala dwa bledy
     naraz: przy pokladach (Stratus, spread 26) kamera schodzila pod ziemie
     i kadr wypelniala jednolita szarosc, a przy Cumulonimbusie (grubosc 5,6)
     staly dystans 8 stawial obserwatora w srodku chmury.
     Odleglosc liczymy z podstawy i grubosci, nie z zasiegu poziomego:
     poklad ogląda sie z bliska od spodu, a nie z 26 jednostek z boku. */
  function frameDist(base, thick) {
    // Wysokosc calej chmury nad obserwatorem podzielona przez tangens polowy
    // kadru — czyli tyle, zeby zmiescila sie w pionie. Cumulonimbus (11 km)
    // musi wyjsc przytlaczajacy, a Stratus (0,8 km) ogladany z bliska.
    return Math.min(46, Math.max(4.5, (base + thick) * 1.9 + 2.6));
  }
  const cam = {
    theta: cfg.theta != null ? cfg.theta : 0.0,
    phi: cfg.phi != null ? cfg.phi : 1.86,
    dist: cfg.dist || frameDist(p.base, p.thick),
  };
  const target = new THREE.Vector3(0, p.base + p.thick * 0.5, 0);
  const EYE = 0.2;  // wysokosc oczu nad ziemia
  const tmpF = new THREE.Vector3(), tmpR = new THREE.Vector3(), tmpU = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  function applyCam() {
    const sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
    U.uCam.value.set(
      target.x + cam.dist * sp * Math.sin(cam.theta),
      // Kamera nigdy nie schodzi pod ziemie — obserwator stoi na lace.
      Math.max(EYE, target.y + cam.dist * cp),
      target.z + cam.dist * sp * Math.cos(cam.theta)
    );
    tmpF.copy(target).sub(U.uCam.value).normalize();
    tmpR.crossVectors(tmpF, UP).normalize();
    tmpU.crossVectors(tmpR, tmpF).normalize();
    U.uCamBasis.value.set(
      tmpR.x, tmpU.x, -tmpF.x,
      tmpR.y, tmpU.y, -tmpF.y,
      tmpR.z, tmpU.z, -tmpF.z
    );
    st.needsRender = true;
  }
  applyCam();

  st.onFrame((now) => {
    U.uRes.value.set(st.stage.clientWidth || 1, st.stage.clientHeight || 1);
    if (cfg.drift === true && !reducedMotion()) U.uTime.value = now / 1000;
  });
  /* Dryf domyslnie WYLACZONY. Chmura licząca się bez przerwy potrafiła zająć
     przeglądarkę tak, że strona przestawała reagować na kliknięcia — a ruch
     wnosił tu bardzo niewiele. Renderujemy raz i przy każdej zmianie suwaka. */
  if (cfg.drift === true) st.animate(true);

  if (cfg.interactive !== false) {
    st.stage.classList.add('is-grab');
    let drag = null;
    const el = st.canvas;
    el.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (e.pointerType === 'touch' && drag.moved < 12 && Math.abs(dy) > Math.abs(dx)) return;
      if (e.pointerType === 'touch') e.preventDefault();
      cam.theta -= dx * 0.008;
      cam.phi = Math.min(2.05, Math.max(0.70, cam.phi - dy * 0.005));
      drag.x = e.clientX; drag.y = e.clientY;
      applyCam(); st.invalidate();
    }, { passive: false });
    const end = (e) => {
      if (drag && e.pointerId === drag.id) { try { el.releasePointerCapture(drag.id); } catch (_) {} drag = null; }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  return {
    ok: true,
    uniforms: U,
    set(patch) {
      const q = patch.preset ? Object.assign({}, CLOUD_PRESETS[patch.preset], patch) : patch;
      if (q.base != null) U.uBase.value = q.base;
      if (q.thick != null) U.uThick.value = q.thick;
      if (q.density != null) U.uDensity.value = q.density;
      if (q.coverage != null) U.uCoverage.value = q.coverage;
      if (q.lumpy != null) U.uLumpy.value = q.lumpy;
      if (q.ice != null) U.uIce.value = q.ice;
      if (q.spread != null) U.uSpread.value = q.spread;
      if (q.anisotropy != null) U.uAnisotropy.value = q.anisotropy;
      if (q.sunElev != null) {
        const a = THREE.MathUtils.degToRad(q.sunElev);
        U.uSunDir.value.set(Math.cos(a) * 0.6, Math.sin(a), Math.cos(a) * 0.72).normalize();
      }
      /* Kadrowanie samo sie dopasowuje. Bez tego Cumulonimbus (grubosc 5,6)
         nie miesci sie w kadrze dobranym pod Cumulusa (grubosc 1,4), a caly
         sens presetow polega na tym, ze da sie je porownac. */
      target.y = U.uBase.value + U.uThick.value * 0.5;
      if (patch.dist == null) cam.dist = frameDist(U.uBase.value, U.uThick.value);
      applyCam();
      st.invalidate();
    },
    render: () => st.invalidate(),
    dispose: () => st.dispose(),
  };
}

/* ============================================================
   4. LOB ROZPRASZANIA — createScatterLobe
   ------------------------------------------------------------
   Bryła obrotowa r(theta) = funkcja fazowa. Sedno: lob jest z definicji
   trójwymiarowy, a rzut na płaszczyznę kłamie — Rayleigh wygląda wtedy
   jak "ósemka", choć naprawdę jest spłaszczoną kulą.
   ============================================================ */

export function createScatterLobe(host, cfg = {}) {
  const st = boot(host, { fov: 40 });
  if (!st) return { ok: false, set() {}, render() {}, dispose() {} };
  const t = st.theme;
  const ctl = orbit(st, { dist: 4.4, phi: 1.35, theta: 0.6, minDist: 2.5, maxDist: 12 });
  const labels = labelLayer(st);

  const SEG_T = 96, SEG_P = 48;
  const geo = new THREE.SphereGeometry(1, SEG_T, SEG_P);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(t.b), wireframe: true, transparent: true, opacity: 0.5,
  });
  const lobe = new THREE.Mesh(geo, mat);
  st.scene.add(lobe);

  const solidMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(t.b), transparent: true, opacity: 0.14,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const solid = new THREE.Mesh(geo.clone(), solidMat);
  st.scene.add(solid);

  // Oś: kierunek padania światła (z lewej) i kierunek "do przodu".
  const axisPts = [new THREE.Vector3(-3.2, 0, 0), new THREE.Vector3(3.2, 0, 0)];
  const axis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(axisPts),
    new THREE.LineBasicMaterial({ color: new THREE.Color(t.accent) })
  );
  st.scene.add(axis);
  const inc = new THREE.Mesh(
    new THREE.ConeGeometry(0.10, 0.30, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(t.accent) })
  );
  inc.rotation.z = -Math.PI / 2;
  inc.position.set(-1.25, 0, 0);
  st.scene.add(inc);

  /* Etykiety osi. Domyślnie polskie, bo stąd ten widget pochodzi — inna
     książka podaje własne przez cfg.labels, nie edytując tego pliku. */
  const L = Object.assign({ incident: 'światło pada', forward: 'do przodu' }, cfg.labels);
  if (L.incident) labels.add(L.incident, new THREE.Vector3(-2.7, 0.3, 0), { color: t.accent });
  if (L.forward) labels.add(L.forward, new THREE.Vector3(2.6, 0.28, 0), { color: t.muted });

  const state = { g: cfg.g != null ? cfg.g : 0.0, mode: cfg.mode || 'rayleigh' };

  function phase(mu) {
    if (state.mode === 'rayleigh') return (3 / 4) * (1 + mu * mu) / 3;
    const g = state.g, gg = g * g;
    return (1 - gg) / Math.pow(1 + gg - 2 * g * mu, 1.5) / 4;
  }

  const base = new THREE.SphereGeometry(1, SEG_T, SEG_P);
  const basePos = base.attributes.position.array.slice();

  function rebuild() {
    for (const m of [lobe, solid]) {
      const pos = m.geometry.attributes.position;
      const arr = pos.array;
      let maxR = 0;
      for (let i = 0; i < arr.length; i += 3) {
        const x = basePos[i], y = basePos[i + 1], z = basePos[i + 2];
        // mu = cos kąta między kierunkiem rozproszenia a kierunkiem padania (+x)
        const r = phase(x);
        if (r > maxR) maxR = r;
        arr[i] = x * r; arr[i + 1] = y * r; arr[i + 2] = z * r;
      }
      // Normalizacja, żeby lob zawsze mieścił się w kadrze niezależnie od g.
      const k = 1.7 / Math.max(maxR, 1e-3);
      for (let i = 0; i < arr.length; i++) arr[i] *= k;
      pos.needsUpdate = true;
      m.geometry.computeBoundingSphere();
    }
    st.invalidate();
  }
  rebuild();

  return {
    ok: true,
    set(patch) {
      if (patch.g != null) state.g = patch.g;
      if (patch.mode) state.mode = patch.mode;
      if (patch.color) { mat.color.set(patch.color); solidMat.color.set(patch.color); }
      rebuild();
    },
    render: () => st.invalidate(),
    dispose: () => st.dispose(),
    controls: ctl,
  };
}

/* ============================================================
   5. DIAGRAM 3D — createDiagram3D
   ------------------------------------------------------------
   Generyczna scena z deklaratywnej listy części. Obsługuje wszystkie
   pozostałe widgety geometryczne książki: kopułę z rodzajami chmur,
   cykl życia komórki burzowej, blok niżu z frontami, anatomię
   superkomórki, stożek tęczy, kryształ lodu, cień Ziemi.
   Jedna implementacja zamiast siedmiu — bo to naprawdę jest jeden
   problem: bryły, strzałki i etykiety w przestrzeni, z warstwami do
   włączania.
   ============================================================ */

const PART_BUILDERS = {
  sphere: (p) => new THREE.SphereGeometry(p.r || 1, p.seg || 40, (p.seg || 40) / 2),
  box: (p) => new THREE.BoxGeometry(p.w || 1, p.h || 1, p.d || 1),
  cone: (p) => new THREE.ConeGeometry(p.r || 1, p.h || 1, p.seg || 32, 1, p.open !== false),
  cylinder: (p) => new THREE.CylinderGeometry(p.rt != null ? p.rt : (p.r || 1), p.rb != null ? p.rb : (p.r || 1), p.h || 1, p.seg || 32, 1, p.open === true),
  plane: (p) => new THREE.PlaneGeometry(p.w || 1, p.h || 1, p.wseg || 1, p.hseg || 1),
  ring: (p) => new THREE.RingGeometry(p.ri || 0.8, p.ro || 1, p.seg || 64),
  torus: (p) => new THREE.TorusGeometry(p.r || 1, p.tube || 0.05, 12, p.seg || 64),
  hexPrism: (p) => new THREE.CylinderGeometry(p.r || 1, p.r || 1, p.h || 1, 6),
  disc: (p) => new THREE.CircleGeometry(p.r || 1, p.seg || 48),
};

export function createDiagram3D(host, cfg = {}) {
  const st = boot(host, { fov: cfg.fov || 42, clear: cfg.clear });
  if (!st) return { ok: false, set() {}, render() {}, dispose() {}, setLayer() {}, add() { return null; }, parts: [], labels: null, controls: null };
  const t = st.theme;
  const palette = Object.assign({
    light: t.accent, water: t.b, ice: t.a, cold: '#6e93be',
    text: t.text, muted: t.muted, grid: t.grid,
  }, cfg.palette);

  const ctl = orbit(st, Object.assign({ dist: 8, phi: 1.2, theta: 0.55 }, cfg.camera));
  const labels = labelLayer(st);
  const layers = new Map();

  function colorOf(c) {
    return new THREE.Color(palette[c] || c || t.muted);
  }

  function addPart(p) {
    let obj = null;

    if (p.type === 'polyline' || p.type === 'ray') {
      const pts = p.points.map((v) => new THREE.Vector3(v[0], v[1], v[2]));
      obj = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: colorOf(p.color),
          transparent: p.opacity != null,
          opacity: p.opacity != null ? p.opacity : 1,
        })
      );
    } else if (p.type === 'arrow') {
      const from = new THREE.Vector3(...p.from);
      const to = new THREE.Vector3(...p.to);
      const dir = to.clone().sub(from);
      const len = dir.length();
      obj = new THREE.ArrowHelper(
        dir.normalize(), from, len,
        colorOf(p.color).getHex(),
        Math.min(0.26, len * 0.24),
        Math.min(0.13, len * 0.12)
      );
    } else if (p.type === 'label') {
      const it = labels.add(p.text, new THREE.Vector3(...p.at), {
        color: palette[p.color] || p.color || palette.muted,
        size: p.size,
      });
      obj = { isLabelOnly: true, label: it };
    } else if (p.type === 'grid') {
      obj = new THREE.GridHelper(p.size || 10, p.divisions || 10, colorOf(p.color), colorOf(p.color));
      obj.material.transparent = true;
      obj.material.opacity = p.opacity != null ? p.opacity : 0.22;
    } else {
      const builder = PART_BUILDERS[p.type];
      if (!builder) return null;
      const geo = builder(p);
      const wire = p.wireframe === true;
      const mat = new THREE.MeshBasicMaterial({
        color: colorOf(p.color),
        wireframe: wire,
        transparent: true,
        opacity: p.opacity != null ? p.opacity : (wire ? 0.5 : 0.32),
        side: p.side === 'front' ? THREE.FrontSide : THREE.DoubleSide,
        depthWrite: p.depthWrite === true,
      });
      obj = new THREE.Mesh(geo, mat);
      if (p.edges) {
        const eg = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, p.edgeAngle || 20),
          new THREE.LineBasicMaterial({ color: colorOf(p.edges === true ? p.color : p.edges) })
        );
        obj.add(eg);
      }
    }

    if (obj && !obj.isLabelOnly) {
      if (p.at) obj.position.set(...p.at);
      if (p.rot) obj.rotation.set(p.rot[0] || 0, p.rot[1] || 0, p.rot[2] || 0);
      if (p.scale) {
        if (Array.isArray(p.scale)) obj.scale.set(...p.scale);
        else obj.scale.setScalar(p.scale);
      }
      st.scene.add(obj);
    }

    if (p.layer) {
      if (!layers.has(p.layer)) layers.set(p.layer, []);
      layers.get(p.layer).push(obj);
    }
    return obj;
  }

  const built = (cfg.parts || []).map(addPart);

  function setLayer(name, on) {
    const group = layers.get(name);
    if (!group) return;
    for (const o of group) {
      if (!o) continue;
      if (o.isLabelOnly) { o.label.hidden = !on; o.label.span.style.display = on ? '' : 'none'; }
      else o.visible = on;
    }
    st.invalidate();
  }

  if (cfg.hiddenLayers) for (const n of cfg.hiddenLayers) setLayer(n, false);
  st.invalidate();

  return {
    ok: true,
    scene: st.scene,
    controls: ctl,
    labels,
    parts: built,
    setLayer,
    add: (p) => { const o = addPart(p); st.invalidate(); return o; },
    set(patch) {
      if (patch.layers) for (const [k, v] of Object.entries(patch.layers)) setLayer(k, v);
      st.invalidate();
    },
    render: () => st.invalidate(),
    dispose: () => st.dispose(),
  };
}

/* ============================================================
   6. POMOCNIKI DLA STRON
   ============================================================ */

/**
 * Spina suwaki z widgetem. Konwencja: <input data-sky="nazwaParametru">
 * plus opcjonalny <span data-sky-out="nazwaParametru"> na odczyt.
 *
 * `fmt` dostaje wartość i zwraca tekst — domyślnie polski przecinek
 * dziesiętny, tak jak w pozostałych książkach serii.
 */
export function bindSliders(root, widget, opts = {}) {
  const fmt = opts.fmt || ((v, el) => {
    const d = parseInt(el.dataset.skyDecimals || '1', 10);
    return v.toFixed(d).replace('.', ',') + (el.dataset.skyUnit || '');
  });
  const inputs = root.querySelectorAll('input[data-sky]');
  const apply = (el) => {
    const key = el.dataset.sky;
    const v = parseFloat(el.value);
    widget.set({ [key]: v });
    const out = root.querySelector('[data-sky-out="' + key + '"]');
    if (out) out.textContent = fmt(v, el);
    if (opts.onChange) opts.onChange(key, v, root);
  };
  inputs.forEach((el) => {
    el.addEventListener('input', () => apply(el));
    apply(el);
  });
  return { refresh: () => inputs.forEach(apply) };
}

/** Spina rząd przycisków-presetów. Konwencja: <button data-preset="cumulus">. */
export function bindPresets(root, widget, opts = {}) {
  const btns = root.querySelectorAll('[data-preset]');
  btns.forEach((b) => {
    b.addEventListener('click', () => {
      btns.forEach((x) => x.classList.toggle('is-active', x === b));
      widget.set({ preset: b.dataset.preset });
      if (opts.onChange) opts.onChange(b.dataset.preset, b);
    });
  });
  const first = root.querySelector('[data-preset].is-active') || btns[0];
  if (first) first.classList.add('is-active');
  return btns;
}

/**
 * Mapa nazwa → fabryka, dla stron, które wybierają widget z danych
 * (np. `FACTORIES[host.dataset.widget](host, cfg)`) zamiast importować
 * konkretną funkcję. Nie ma tu automatycznego montowania — strony w książce
 * źródłowej importują fabrykę wprost, w bloku <script type="module">.
 */
export const FACTORIES = {
  sky: createSkyDome,
  cloud: createCloudVolume,
  lobe: createScatterLobe,
  diagram: createDiagram3D,
};
