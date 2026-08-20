# Terminal Noir GitHub profile README redesign

## Overview

`FakeBlubba/FakeBlubba` is GitHub's special profile repository: its
`README.md` is rendered on the public profile page. The goal is to make that
page visually match the `@fakeblubba/terminal-noir` design system (dark
neutral palette, red accent, IBM Plex Mono/Sans typography) while keeping
the exact same information currently in the README.

## Constraint that shapes everything

GitHub sanitizes any HTML embedded in a rendered README (profile or repo):
`<style>`, `<link rel="stylesheet">`, inline `style="..."`, and `<script>`
are all stripped server-side, regardless of whether the source is Markdown
or raw HTML. `terminal-noir`'s actual components are live Svelte/web
components (CSS + JS) and cannot run on the page at all.

The only thing that survives untouched is `<img>`. Visual restyling is
therefore only achievable through images: either external services that
already accept custom colors as URL parameters (shields.io,
github-readme-stats, the komarev counter), or SVG files generated from the
design system's tokens and committed to the repo.

A second constraint: an `<img>` cannot contain a working hyperlink when
embedded via `<img src="...">` in Markdown. Anything the user can currently
click (project repo links, the LinkedIn link) must remain a real `<a href>`
element — it cannot be baked into a flat raster/SVG image.

## Goals

- Recolor every visual element on the profile page to `terminal-noir`'s
  token values, without changing the information content.
- Keep every existing link clickable.
- Keep the bio paragraph as selectable, searchable plain text.
- Regenerate automatically when `@fakeblubba/terminal-noir` is bumped, via
  a GitHub Action (per user's explicit choice over a one-off static set of
  files or a manually-run script).

## Non-goals

- Embedding live `terminal-noir` components (impossible per the constraint
  above).
- Restructuring the information architecture of the README — sections and
  their content stay the same; only their visual rendering changes.
- Cross-repo automation that reacts to a new `terminal-noir` publish event
  in the `design-systems` repo. Out of scope for v1; the workflow re-runs
  on `workflow_dispatch` and on pushes that touch `package-lock.json` in
  this repo.

## Architecture

```
@fakeblubba/terminal-noir tokens.ts
        │
        ▼
scripts/generate-readme-theme.mjs
        │
        ├─→ .github/assets/*.svg        (decorative, non-linked elements)
        └─→ README.md                    (rewritten between marker comments)
        │
.github/workflows/refresh-terminal-noir.yml
        │
        └─→ runs the script, commits README.md / .github/assets if changed
```

### `scripts/generate-readme-theme.mjs`

A Node script, run by the workflow (and runnable locally). It:

1. Imports token values from `@fakeblubba/terminal-noir/tokens`
   (`node_modules/@fakeblubba/terminal-noir/tokens/build/ts/tokens.ts`).
2. Computes recolored URLs for the elements that are already external
   image services, substituting `terminal-noir` hex values for their
   existing hardcoded colors:
   - shields.io tech badges (`color`, `labelColor` params)
   - github-readme-stats cards (`bg_color`, `title_color`, `text_color`,
     `icon_color`, `border_color` params)
   - the komarev profile-view counter (`color` param)
3. Generates SVG files for the elements that have no external service and
   carry no links, writing them to `.github/assets/`:
   - `banner.svg` — identity block (name, role) as a terminal-window-style
     lockup, using `--color-bg-canvas`, `--color-text-primary`,
     `--color-action-primary`, `--font-family-mono`.
   - `chip-<slug>.svg` — one per "What I work on" row, replacing the plain
     fenced code block, styled after the `chip` component contract
     (`--color-bg-surface`, `--color-border-subtle`, `--radius-full`,
     `--typography-label-md`).
   - `divider.svg` — replaces the plain `---` horizontal rules with a
     thin rule in `--color-border-accent`.
   - `section-label-projects.svg` — small decorative label
     (`$ ls projects/`) placed above the Featured Projects table.
4. Rewrites `README.md` in place, replacing only the content between
   `<!-- TERMINAL-NOIR:START -->` and `<!-- TERMINAL-NOIR:END -->` markers,
   leaving the bio paragraph and the Featured Projects table (both outside
   the markers, or the table's rows specifically preserved verbatim) untouched.

### `.github/workflows/refresh-terminal-noir.yml`

- Triggers: `workflow_dispatch` (manual) and `push` on `package-lock.json`
  (catches a version bump of `@fakeblubba/terminal-noir`).
- Permissions: `contents: write` (needed to commit back to the repo).
- Steps: checkout → setup-node → `npm ci` (uses the existing `.npmrc` +
  `GITHUB_TOKEN` for the private `npm.pkg.github.com` registry) → run the
  generator script → commit `README.md` and `.github/assets/` only if
  `git status --porcelain` is non-empty → push.

### Featured Projects table

Stays a native Markdown table. Only change: a decorative `section-label`
SVG is placed above it. Row content and repo links are untouched by the
generator.

### Bio paragraph

Stays plain Markdown text outside the generated markers, for the same
reason described in the constraint section: GitHub cannot recolor prose
text anyway, so rendering it as an image would only lose selectability and
searchability with no visual gain.

## Housekeeping

`node_modules/`, which now contains the privately-registered
`@fakeblubba/terminal-noir` package, is currently untracked but has no
`.gitignore` entry — a `.gitignore` excluding `node_modules/` is added as
part of this change so it never gets committed by accident.

## Testing / verification

No unit tests — this is asset generation and Markdown templating, not
business logic. Verification is:

1. Run the generator script locally and visually diff the resulting
   `README.md` and SVGs.
2. Push to a branch and open the rendered README on GitHub (or preview
   via GitHub's Markdown API) to confirm the sanitizer doesn't strip
   anything unexpected and that all links still resolve.
3. Trigger the workflow via `workflow_dispatch` once merged, confirm it
   commits only when output actually changed (idempotency check: running
   it twice in a row with no token changes produces no second commit).

## Rollout

Single PR/commit sequence: `.gitignore`, generator script, workflow file,
generated assets, and the rewritten `README.md`, in this repo's `main`
branch (no separate branch protection or review process currently in
place for this repo).
