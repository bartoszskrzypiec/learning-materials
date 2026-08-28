# CLAUDE.md

Guidance for Claude Code sessions working in this repo.

## What this repo is (and isn't)

This is **not** a book. It's the shared, dependency-free toolkit consumed
by four separate book repos (`pxrsurface-guide`, `lookdev-book`,
`pipeline-book`, `raytracing-book`), each independently deployed to its own
GitHub Pages site. Nothing here gets built or deployed on its own — it
exists to be **copied** into a consuming book's `assets/` folder.

Read `docs/INTEGRATION.md` before changing any of the three shared tools
(`assets/js/viz.js`, `assets/js/i18n.js`, `assets/js/interactive.js`,
`assets/css/widgets.css`) — it documents the exact contract (CSS custom
properties, `data-*` attributes) that every consuming book relies on.
Breaking that contract silently breaks every book that's already copied a
version in, with no build step to catch it.

## No build system

Same as every consuming book: pure static files, no npm, no bundler, no
test suite, no linter, no CI. Changes are validated by hand (open a
consuming page in a browser, or run `node --check` on the JS files to catch
syntax errors) — see the "Verification" pattern used when these tools were
originally built in `pxrsurface-guide`'s development history for the level
of manual testing expected (balance-checking `lang="en"`/`lang="pl"` counts,
WebGL-disabled fallback checks, etc.), documented in
`docs/INTEGRATION.md`'s verification checklist.

## Changing a shared file

1. Make the change here.
2. Add a dated entry to `CHANGELOG.md` describing what changed and why —
   this is the only mechanism consuming books have for knowing a re-copy is
   worth doing, since there's no version number or package manager.
3. Do **not** go update the four consuming repos automatically as part of
   this — each book re-copies on its own schedule, deliberately, since
   they're independently deployed and a forced sync could land mid-way
   through unrelated content work in another repo. If asked to propagate a
   change, treat each consuming repo as its own explicit task.

## Adding a fourth tool / pattern

If a genuinely new, reusable capability emerges (asked for in more than one
book, not just imagined as generically useful), it belongs here following
the same shape as the existing three: a file (or a documented pattern, if
it's more of a recipe than a library — see `patterns/svg-slider-widget.md`
for why the SVG+slider diagrams aren't a shared function), plus a section
in `docs/INTEGRATION.md` explaining when to reach for it versus the
existing tools. Don't build a fourth tool speculatively — the three that
exist were each promoted here only after being proven in real use in a
specific book first.

## Naming

Repo name (`learning-materials`) is a placeholder the user may rename —
nothing in these files depends on the repo's name or URL.
