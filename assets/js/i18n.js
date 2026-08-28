/* Language switch (EN / PL) — shared across the book projects.
 *
 * Both languages ship in the HTML as sibling elements marked lang="en" and
 * lang="pl". Two CSS rules (in widgets.css) hide whichever doesn't match
 * <html data-lang="...">, so the correct language is on screen before this
 * file runs, and stays correct if it never runs at all. This script's job
 * is to flip that one attribute, persist the choice, and tell any widgets
 * that draw their own text (canvas labels, etc.) to redraw.
 *
 * Zero hardcoded, book-specific strings. Every consuming book configures
 * this purely via two attributes on its own <html> tag — never by editing
 * this file:
 *
 *   <html lang="pl" data-lang="pl"
 *         data-i18n-storage="ldb-lang"   <- localStorage key, pick one per book
 *         data-i18n-default="pl">        <- language for a first-time visitor
 *                                            whose browser locale doesn't match
 *                                            either supported language
 *
 * Both attributes are optional — omitting them falls back to a neutral
 * 'i18n-lang' storage key and 'en' as the default language.
 *
 * Every bilingual page must also author BOTH title variants explicitly:
 *
 *   <title data-title-en="..." data-title-pl="...">...</title>
 *
 * (An earlier version of this file auto-derived the English title from the
 * bare <title> text. That silently broke for a Polish-default book, whose
 * bare text is Polish — switching to English showed the Polish title. This
 * version never guesses; an unauthored variant is simply left unswapped.)
 */

const root = document.documentElement;
const STORE_KEY = root.dataset.i18nStorage || 'i18n-lang';
const DEFAULT_LANG = root.dataset.i18nDefault === 'pl' ? 'pl' : 'en';
const SUPPORTED = ['en', 'pl'];

function readStored() {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch (e) {
    // Private mode / blocked site data. Not worth failing over.
    return null;
  }
}

function writeStored(lang) {
  try {
    localStorage.setItem(STORE_KEY, lang);
  } catch (e) {
    /* ignore */
  }
}

function pickInitial() {
  const fromQuery = new URLSearchParams(location.search).get('lang');
  if (SUPPORTED.includes(fromQuery)) return fromQuery;

  const stored = readStored();
  if (SUPPORTED.includes(stored)) return stored;

  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('pl')) return 'pl';
  if (nav.startsWith('en')) return 'en';

  return DEFAULT_LANG;
}

function apply(lang, { persist = true } = {}) {
  if (!SUPPORTED.includes(lang)) lang = DEFAULT_LANG;

  root.dataset.lang = lang;
  root.lang = lang;

  // Swap the tab title only if this exact language variant was authored.
  const titleEl = document.querySelector('title');
  if (titleEl) {
    const alt = lang === 'pl' ? titleEl.dataset.titlePl : titleEl.dataset.titleEn;
    if (alt) titleEl.textContent = alt;
  }

  document.querySelectorAll('[data-set-lang]').forEach((btn) => {
    const active = btn.dataset.setLang === lang;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  if (persist) writeStored(lang);

  // Canvas widgets draw their own labels, so they need telling.
  document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
}

/** Current language, for widgets that draw text into a canvas. */
export function currentLang() {
  return root.dataset.lang === 'pl' ? 'pl' : 'en';
}

/** Pick from a { en, pl } string table. */
export function t(table) {
  return table[currentLang()] ?? table.en ?? '';
}

// The switch is display:none until this class lands, so it is never inert.
root.classList.add('js');

/* Only take over the document language on pages that actually ship both
   languages. A monolingual page that loads viz.js for its widgets (and so
   this module transitively) must keep declaring its own single lang —
   otherwise a reader with a different browser locale, or anyone who picked
   a language on a *different* bilingual page on the same site, would get
   that page's only language announced as something it isn't. */
if (document.querySelector('[data-set-lang]')) {
  apply(pickInitial(), { persist: false });
}

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-set-lang]');
  if (btn) apply(btn.dataset.setLang);
});
