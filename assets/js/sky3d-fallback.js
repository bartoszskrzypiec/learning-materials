/* sky3d-fallback.js — the watchdog that guarantees a 3D widget never renders
 * as a silent empty rectangle.
 *
 * Promoted from `atmosfera_chmury_book`, where it lived at the bottom of that
 * book's own assets/interactive.js. It ships here as a SEPARATE classic script
 * rather than being merged into assets/js/interactive.js, for two reasons: a
 * book that uses formula modals but no 3D shouldn't carry it, and a book that
 * uses 3D but no formula modals shouldn't have to load interactive.js to get it.
 *
 * WHY A CLASSIC SCRIPT AND NOT A MODULE: sky3d.js is an ES module. Open a page
 * straight off disk (file://) and the browser never loads it at all — so the
 * check for "the module never ran" cannot itself live in that module. Load this
 * file with a plain <script src="..."> (no type="module") BEFORE the module, so
 * window.__sky3dPokazBrak exists by the time sky3d.js boots.
 *
 * Division of labour:
 *   - sky3d.js's boot() calls window.__sky3dPokazBrak(host, 'webgl' | 'shader')
 *     and sets host.dataset.sky3d for the cases it can see itself.
 *   - the sweep below covers the case the module cannot report, because it
 *     never executed (host.dataset.sky3d still empty) — file:// or a failed
 *     network fetch.
 *
 * MESSAGES: the defaults below are English. Override before this script loads:
 *
 *   <script>
 *     window.SKY3D_MESSAGES = {
 *       file: { title: 'Widget 3D nie uruchamia się z pliku na dysku',
 *               why:   'Otwórz książkę przez lokalny serwer.' }
 *     };
 *   </script>
 *
 * Each title/why may also be a { en: '...', pl: '...' } object — it is then
 * resolved against document.documentElement's data-lang, so a bilingual book
 * using i18n.js gets the right language without extra wiring.
 *
 * The chapter's own sentence inside .viz3d__fallback > span is never touched;
 * this only rewrites the <strong> headline and prepends a .viz3d__why line
 * naming the cause.
 */
(function () {
  var DEFAULTS = {
    file: {
      title: 'This 3D widget cannot start from a file on disk',
      why: 'The page was opened over file://, and the browser will not load the 3D '
         + 'engine from there. Open it through a local server instead — for example '
         + 'the "Live Server" extension in VS Code.'
    },
    siec: {
      title: 'The 3D engine failed to load',
      why: 'assets/js/sky3d.js or three.js did not arrive. The rest of the page is '
         + 'complete without the widget.'
    },
    webgl: {
      title: 'This widget needs WebGL',
      why: 'The browser is not providing WebGL.'
    },
    shader: {
      title: 'The graphics driver rejected this widget',
      why: 'The scene shader did not compile. The full message is in the console.'
    }
  };

  /* A message may be a plain string or { en, pl } — resolve against data-lang so
     a bilingual book (see i18n.js) needs no extra wiring. */
  function tekst(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    var lang = document.documentElement.getAttribute('data-lang') || 'en';
    return v[lang] || v.en || v.pl || '';
  }

  function komunikat(powod) {
    var over = window.SKY3D_MESSAGES || {};
    var d = DEFAULTS[powod] || DEFAULTS.siec;
    var o = over[powod] || {};
    return {
      title: tekst(o.title != null ? o.title : d.title),
      why: tekst(o.why != null ? o.why : d.why)
    };
  }

  function sky3dPokazBrak(host, powod) {
    var box = komunikat(powod);
    var fb = host.querySelector('.viz3d__fallback');
    if (fb) {
      var mocny = fb.querySelector('strong');
      if (mocny) mocny.textContent = box.title;
      var czemu = fb.querySelector('.viz3d__why');
      if (!czemu) {
        czemu = document.createElement('span');
        czemu.className = 'viz3d__why';
        if (mocny && mocny.nextSibling) fb.insertBefore(czemu, mocny.nextSibling);
        else fb.appendChild(czemu);
      }
      czemu.textContent = box.why;
    }
    host.classList.add('no-webgl');
  }

  /* Global on purpose — sky3d.js is a module and calls this from inside boot(). */
  window.__sky3dPokazBrak = sky3dPokazBrak;

  function sky3dPrzeglad() {
    var hosty = document.querySelectorAll('.viz3d');
    for (var i = 0; i < hosty.length; i++) {
      /* Empty dataset = the ES module never executed at all (usually file://). */
      if (!hosty[i].dataset.sky3d) {
        sky3dPokazBrak(hosty[i], location.protocol === 'file:' ? 'file' : 'siec');
      }
    }
  }

  window.addEventListener('load', function () {
    sky3dPrzeglad();
    /* Second sweep: a widget far below the fold initialises late. */
    setTimeout(sky3dPrzeglad, 1200);
  });
})();
