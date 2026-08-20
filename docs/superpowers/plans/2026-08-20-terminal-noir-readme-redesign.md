# Terminal Noir README Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recolor the `FakeBlubba/FakeBlubba` GitHub profile README to `@fakeblubba/terminal-noir`'s design tokens, regenerated automatically by a GitHub Action, without breaking any link or losing any information.

**Architecture:** A Node script (`scripts/generate-readme-theme.mjs`) parses `@fakeblubba/terminal-noir`'s built CSS token file, uses the resolved hex/font values to (a) build a handful of static SVG assets for non-linked decorative elements and (b) rewrite recolored URLs for the external image services (shields.io, github-readme-stats, komarev) already used in the README. It rewrites only the content between paired `<!-- TN:NAME --> ... <!-- /TN:NAME -->` HTML-comment markers in `README.md`, leaving the bio paragraph and the Featured Projects table (with its real links) untouched. A GitHub Actions workflow runs this script on demand and whenever `package-lock.json` changes, committing the result if it differs.

**Tech Stack:** Node.js (built-ins only: `node:fs`, `node:path`, `node:assert` — no new npm dependencies), plain SVG 1.1, GitHub Actions.

## Global Constraints

- GitHub strips `<style>`, `<link rel="stylesheet">`, inline `style="..."`, and `<script>` from any rendered README — visual restyling can only happen through `<img>` content (external service URLs with color query params, or committed SVG files). [source: design spec, "Constraint that shapes everything"]
- Any element the user can currently click (LinkedIn link, project repo links) must remain a real `<a href>` — never baked into a flat image. [source: design spec, Goals]
- The bio paragraph and the Featured Projects table's rows/links stay outside the generated marker regions and are never rewritten by the script. [source: design spec, Architecture]
- `node_modules/` (contains the privately-registered `@fakeblubba/terminal-noir`) must never be committed. [source: design spec, Housekeeping]
- No new npm dependencies — the generator script uses only Node built-ins. [ponytail/YAGNI: SVG output here is simple rectangles and text; a templating or SVG-building library is not warranted]
- **Commit at the end of each task** (superseding this plan's earlier "stage only" steps — the user explicitly approved per-task local commits for this subagent-driven execution run on 2026-08-20). These are local commits on `main`, not pushed anywhere; the user can reset/squash before ever sharing them. Each task's "Stage for review" step should be read as "commit with a message describing the task."

---

## File structure

| File | Responsibility |
|---|---|
| `.gitignore` (new) | Excludes `node_modules/` from version control |
| `package.json` (modified) | Adds a `generate:readme-theme` script entry |
| `scripts/generate-readme-theme.mjs` (new) | Token parsing, SVG builders, URL builders, marker-based README rewrite, self-check, `main()` |
| `README.md` (modified) | Gains `<!-- TN:* -->` marker pairs around the header, work list, tech badges, projects label, and stats sections |
| `.github/assets/banner.svg`, `.github/assets/work-rows.svg`, `.github/assets/section-label-projects.svg` (generated) | Decorative, non-linked images referenced by `README.md` |
| `.github/workflows/refresh-terminal-noir.yml` (new) | Runs the generator on `workflow_dispatch` and on `package-lock.json` changes, commits if the output differs |

---

### Task 1: Repo hygiene — `.gitignore` and npm script entry

**Files:**
- Create: `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Produces: an `npm run generate:readme-theme` command that later tasks rely on to invoke `scripts/generate-readme-theme.mjs`.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
```

- [ ] **Step 2: Add the script entry to `package.json`**

Change:
```json
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
```
to:
```json
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1",
    "generate:readme-theme": "node scripts/generate-readme-theme.mjs"
  },
```

- [ ] **Step 3: Verify `node_modules` drops out of git status**

Run: `git status --short`
Expected: `node_modules/` no longer appears in the untracked list (it's now ignored); `.gitignore` and `package.json` show as changed/new.

- [ ] **Step 4: Stage for review**

```bash
git add .gitignore package.json
```

---

### Task 2: Token parser + script skeleton

**Files:**
- Create: `scripts/generate-readme-theme.mjs`

**Interfaces:**
- Produces: `parseTokens(cssText: string): Record<string, string>` — maps a token's dash-cased name (e.g. `color-bg-canvas`) to its fully-resolved value (e.g. `#141414`), resolving one or more levels of `var(--x)` indirection.
- Produces: `escapeXml(str: string): string`, `monoTextWidth(text: string, fontSize: number): number` — used by every SVG builder added in Task 4.
- Consumes: `node_modules/@fakeblubba/terminal-noir/tokens/build/css/tokens.css` (already installed in this repo; read directly by file path — the package's `./tokens` export points at a `.ts` file Node cannot import without a TypeScript loader, so the built CSS is the source of truth instead).

- [ ] **Step 1: Write the script skeleton with the token parser**

```javascript
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import path from 'node:path';

const TOKENS_CSS_PATH = 'node_modules/@fakeblubba/terminal-noir/tokens/build/css/tokens.css';
const README_PATH = 'README.md';
const ASSETS_DIR = '.github/assets';

function parseTokens(cssText) {
  const raw = new Map();
  const declRe = /--([\w-]+):\s*([^;]+);/g;
  let match;
  while ((match = declRe.exec(cssText)) !== null) {
    raw.set(match[1], match[2].trim());
  }

  const resolved = new Map();
  function resolve(name, depth = 0) {
    if (resolved.has(name)) return resolved.get(name);
    if (depth > 5) throw new Error(`Token reference too deep: --${name}`);
    const value = raw.get(name);
    if (value === undefined) throw new Error(`Unknown token referenced: --${name}`);
    const varMatch = value.match(/^var\(--([\w-]+)\)$/);
    const finalValue = varMatch ? resolve(varMatch[1], depth + 1) : value;
    resolved.set(name, finalValue);
    return finalValue;
  }

  const tokens = {};
  for (const name of raw.keys()) {
    tokens[name] = resolve(name);
  }
  return tokens;
}

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MONO_CHAR_WIDTH_RATIO = 0.6; // IBM Plex Mono average advance width relative to font-size

function monoTextWidth(text, fontSize) {
  return Math.ceil(text.length * fontSize * MONO_CHAR_WIDTH_RATIO);
}

function hex(tokens, name) {
  return tokens[name].replace('#', '');
}
```

- [ ] **Step 2: Run a smoke check against the real installed package**

The module has no top-level execution yet (`main()` is added in Task 5), so append a temporary probe, run it, then delete the probe:

```bash
cat >> scripts/generate-readme-theme.mjs <<'EOF'

// TEMPORARY PROBE — deleted after this check
const __probeTokens = parseTokens(readFileSync(TOKENS_CSS_PATH, 'utf8'));
console.log(__probeTokens['color-bg-canvas'], __probeTokens['color-text-primary'], __probeTokens['color-action-primary']);
EOF
node scripts/generate-readme-theme.mjs
```
Expected output: `#141414 #f0f0f0 #8a0000`

If this fails with `Unknown token referenced`, the regex or the var-resolution has a bug — fix before moving on. Once it passes, remove the two probe lines (the comment and the `console.log`/`__probeTokens` lines) from the end of the file — `main()` will call `parseTokens` for real once Task 5 adds it.

- [ ] **Step 3: Stage for review**

```bash
git add scripts/generate-readme-theme.mjs
```

---

### Task 3: README marker placement

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: five marker pairs (`HEADER`, `WORK`, `TECH`, `PROJECTS_LABEL`, `STATS`) that Task 5's `replaceMarkerRegion` will target by name.

- [ ] **Step 1: Replace the header block (lines 1-11)**

Find:
```html
<!-- Header -->
<div align="center">
  <h1>Federico Bianchetti</h1>
  <p><strong>AI Engineer · RAG & LLM Systems · Cloud Infrastructure</strong></p>
  <p>
    <a href="https://www.linkedin.com/in/federico-bianchetti-6b5464204/">
      <img src="https://img.shields.io/badge/LinkedIn-0077B5?style=flat&logo=linkedin&logoColor=white"/>
    </a>
    <img src="https://komarev.com/ghpvc/?username=FakeBlubba&style=flat&color=grey"/>
  </p>
</div>
```

Replace with:
```html
<!-- Header -->
<!-- TN:HEADER -->
<!-- regenerated by scripts/generate-readme-theme.mjs -->
<!-- /TN:HEADER -->
```

- [ ] **Step 2: Replace the "What I work on" code fence**

Find:
````
## What I work on

```
RAG pipelines          →  embedding indexing, vector stores, retrieval orchestration
LLM agents             →  multi-agent systems, tool use, monitoring agents
Cloud infra             →  AWS Lambda · DynamoDB · Bedrock · Terraform · Packer
Backend services        →  FastAPI · document ingestion · entity extraction
```
````

Replace with:
```
## What I work on

<!-- TN:WORK -->
<!-- regenerated by scripts/generate-readme-theme.mjs -->
<!-- /TN:WORK -->
```

- [ ] **Step 3: Replace the Tech section body**

Find (everything after the `## Tech` heading and its blank line, through the DynamoDB badge):
```markdown
**AI/ML**

![Python](https://img.shields.io/badge/Python-3776AB?style=flat&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)
![TensorFlow](https://img.shields.io/badge/TensorFlow-FF6F00?style=flat&logo=tensorflow&logoColor=white)
![scikit-learn](https://img.shields.io/badge/scikit--learn-F7931E?style=flat&logo=scikit-learn&logoColor=white)

**Cloud & Infra**

![AWS](https://img.shields.io/badge/AWS-232F3E?style=flat&logo=amazon-aws&logoColor=white)
![Terraform](https://img.shields.io/badge/Terraform-623CE4?style=flat&logo=terraform&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)

**Databases**

![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=flat&logo=mongodb&logoColor=white)
![DynamoDB](https://img.shields.io/badge/DynamoDB-4053D6?style=flat&logo=amazon-dynamodb&logoColor=white)
```

Replace with:
```
<!-- TN:TECH -->
<!-- regenerated by scripts/generate-readme-theme.mjs -->
<!-- /TN:TECH -->
```

- [ ] **Step 4: Insert the projects label marker (table itself untouched)**

Find:
```markdown
## Featured projects

| Repo | What it does |
```

Replace with:
```markdown
## Featured projects

<!-- TN:PROJECTS_LABEL -->
<!-- regenerated by scripts/generate-readme-theme.mjs -->
<!-- /TN:PROJECTS_LABEL -->

| Repo | What it does |
```

- [ ] **Step 5: Replace the Stats image block**

Find:
```html
<div align="center">
  <img height="160" src="https://github-readme-stats.vercel.app/api?username=FakeBlubba&show_icons=true&theme=dark&hide_border=true&count_private=false"/>
  <img height="160" src="https://github-readme-stats.vercel.app/api/top-langs/?username=FakeBlubba&theme=dark&hide_border=true&layout=compact"/>
</div>
```

Replace with:
```
<!-- TN:STATS -->
<!-- regenerated by scripts/generate-readme-theme.mjs -->
<!-- /TN:STATS -->
```

- [ ] **Step 6: Verify every marker pair is present exactly once**

Run:
```bash
grep -o '<!-- /\?TN:[A-Z_]*' README.md | sort | uniq -c
```
Expected: each of `<!-- TN:HEADER`, `<!-- /TN:HEADER`, `<!-- TN:WORK`, `<!-- /TN:WORK`, `<!-- TN:TECH`, `<!-- /TN:TECH`, `<!-- TN:PROJECTS_LABEL`, `<!-- /TN:PROJECTS_LABEL`, `<!-- TN:STATS`, `<!-- /TN:STATS` appears with count `1`.

- [ ] **Step 7: Stage for review**

```bash
git add README.md
```

---

### Task 4: SVG builders

**Files:**
- Modify: `scripts/generate-readme-theme.mjs`

**Interfaces:**
- Consumes: `escapeXml`, `monoTextWidth` from Task 2.
- Produces: `buildBannerSvg(tokens): string`, `buildWorkRowsSvg(tokens): string`, `buildSectionLabelSvg(tokens, text: string): string` — each returns a complete `<svg>...</svg>` string. Task 5 writes these strings to `.github/assets/*.svg`.

- [ ] **Step 1: Append the work items data and the three SVG builders**

```javascript
const WORK_ITEMS = [
  { label: 'RAG pipelines', detail: 'embedding indexing, vector stores, retrieval orchestration' },
  { label: 'LLM agents', detail: 'multi-agent systems, tool use, monitoring agents' },
  { label: 'Cloud infra', detail: 'AWS Lambda · DynamoDB · Bedrock · Terraform · Packer' },
  { label: 'Backend services', detail: 'FastAPI · document ingestion · entity extraction' },
];

const MONO_FONT = "'IBM Plex Mono', ui-monospace, monospace";
const SANS_FONT = "'IBM Plex Sans', system-ui, sans-serif";

function buildBannerSvg(tokens) {
  const width = 820;
  const height = 170;
  const name = 'Federico Bianchetti';
  const role = 'AI Engineer · RAG & LLM Systems · Cloud Infrastructure';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(name)} — ${escapeXml(role)}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${tokens['color-bg-canvas']}" stroke="${tokens['color-border-default']}"/>
  <circle cx="28" cy="28" r="6" fill="${tokens['color-feedback-danger']}"/>
  <circle cx="48" cy="28" r="6" fill="${tokens['color-feedback-warning']}"/>
  <circle cx="68" cy="28" r="6" fill="${tokens['color-feedback-success']}"/>
  <text x="${width / 2}" y="88" text-anchor="middle" font-family="${MONO_FONT}" font-size="42" font-weight="600" letter-spacing="-0.015em" fill="${tokens['color-text-primary']}">${escapeXml(name)}</text>
  <text x="${width / 2}" y="120" text-anchor="middle" font-family="${SANS_FONT}" font-size="16" fill="${tokens['color-text-secondary']}">${escapeXml(role)}</text>
</svg>`;
}

function buildWorkRowsSvg(tokens) {
  const width = 820;
  const rowHeight = 44;
  const topPadding = 20;
  const bottomPadding = 20;
  const height = topPadding + WORK_ITEMS.length * rowHeight + bottomPadding;
  const labelX = 24;
  const detailX = 240;

  const rows = WORK_ITEMS.map((item, index) => {
    const rowTop = topPadding + index * rowHeight;
    const textY = rowTop + rowHeight / 2 + 5;
    const divider = index > 0
      ? `<line x1="24" y1="${rowTop}" x2="${width - 24}" y2="${rowTop}" stroke="${tokens['color-border-subtle']}" stroke-width="1"/>`
      : '';
    return `${divider}
  <text x="${labelX}" y="${textY}" font-family="${MONO_FONT}" font-size="13" font-weight="500" letter-spacing="0.06em" fill="${tokens['color-text-link']}">${escapeXml(item.label)}</text>
  <text x="${detailX}" y="${textY}" font-family="${SANS_FONT}" font-size="13" fill="${tokens['color-text-secondary']}">${escapeXml(item.detail)}</text>`;
  }).join('\n');

  const ariaLabel = `What I work on: ${WORK_ITEMS.map((i) => i.label).join(', ')}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" fill="${tokens['color-bg-surface']}" stroke="${tokens['color-border-subtle']}"/>
  ${rows}
</svg>`;
}

function buildSectionLabelSvg(tokens, text) {
  const fontSize = 13;
  const paddingX = 12;
  const paddingY = 8;
  const textWidth = monoTextWidth(text, fontSize);
  const width = textWidth + paddingX * 2;
  const height = fontSize + paddingY * 2 + 4;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(text)}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="4" fill="${tokens['color-bg-surface-raised']}" stroke="${tokens['color-border-subtle']}"/>
  <text x="${paddingX}" y="${height / 2 + fontSize / 3}" font-family="${MONO_FONT}" font-size="${fontSize}" fill="${tokens['color-text-link']}">${escapeXml(text)}</text>
</svg>`;
}
```

- [ ] **Step 2: Smoke-check the builders produce well-formed SVG**

Same pattern as Task 2 Step 2 — append a temporary probe, run, delete it:
```bash
cat >> scripts/generate-readme-theme.mjs <<'EOF'

// TEMPORARY PROBE — deleted after this check
const __probeTokens = parseTokens(readFileSync(TOKENS_CSS_PATH, 'utf8'));
const __svg = buildBannerSvg(__probeTokens);
assert(__svg.startsWith('<svg') && __svg.trim().endsWith('</svg>'), 'buildBannerSvg did not produce a well-formed SVG string');
console.log('banner.svg length:', __svg.length);
EOF
node scripts/generate-readme-theme.mjs
```
Expected: prints `banner.svg length: <some number>` with no assertion error. Then remove the temporary probe block (the four lines from `// TEMPORARY PROBE` through the `console.log` line) before continuing.

- [ ] **Step 3: Stage for review**

```bash
git add scripts/generate-readme-theme.mjs
```

---

### Task 5: URL builders, marker rewrite, and `main()`

**Files:**
- Modify: `scripts/generate-readme-theme.mjs`

**Interfaces:**
- Consumes: `hex`, `escapeXml` (Task 2); `buildBannerSvg`, `buildWorkRowsSvg`, `buildSectionLabelSvg` (Task 4); the five `TN:*` marker pairs in `README.md` (Task 3).
- Produces: a runnable script — `node scripts/generate-readme-theme.mjs` writes `.github/assets/*.svg` and rewrites `README.md` in place.

- [ ] **Step 1: Append the tech items data and URL builders**

```javascript
const TECH_ITEMS = [
  { group: 'AI/ML', label: 'Python', logo: 'python' },
  { group: 'AI/ML', label: 'FastAPI', logo: 'fastapi' },
  { group: 'AI/ML', label: 'TensorFlow', logo: 'tensorflow' },
  { group: 'AI/ML', label: 'scikit-learn', logo: 'scikit-learn' },
  { group: 'Cloud & Infra', label: 'AWS', logo: 'amazon-aws' },
  { group: 'Cloud & Infra', label: 'Terraform', logo: 'terraform' },
  { group: 'Cloud & Infra', label: 'Docker', logo: 'docker' },
  { group: 'Databases', label: 'PostgreSQL', logo: 'postgresql' },
  { group: 'Databases', label: 'MongoDB', logo: 'mongodb' },
  { group: 'Databases', label: 'DynamoDB', logo: 'amazon-dynamodb' },
];

function shieldsLabelEncode(label) {
  return encodeURIComponent(label.replace(/-/g, '--'));
}

function shieldsBadgeUrl(tokens, label, logo) {
  const bg = hex(tokens, 'color-bg-surface-raised');
  const logoColor = hex(tokens, 'color-text-primary');
  return `https://img.shields.io/badge/${shieldsLabelEncode(label)}-${bg}?style=flat-square&logo=${logo}&logoColor=${logoColor}`;
}

function statsCardUrl(tokens, username) {
  const bg = hex(tokens, 'color-bg-canvas');
  const title = hex(tokens, 'color-text-link');
  const text = hex(tokens, 'color-text-secondary');
  const border = hex(tokens, 'color-border-default');
  return `https://github-readme-stats.vercel.app/api?username=${username}&show_icons=true&hide_border=false&count_private=false&bg_color=${bg}&title_color=${title}&text_color=${text}&icon_color=${title}&border_color=${border}&border_radius=8`;
}

function topLangsUrl(tokens, username) {
  const bg = hex(tokens, 'color-bg-canvas');
  const title = hex(tokens, 'color-text-link');
  const text = hex(tokens, 'color-text-secondary');
  const border = hex(tokens, 'color-border-default');
  return `https://github-readme-stats.vercel.app/api/top-langs/?username=${username}&hide_border=false&layout=compact&bg_color=${bg}&title_color=${title}&text_color=${text}&border_color=${border}&border_radius=8`;
}

function komarevUrl(tokens, username) {
  const color = hex(tokens, 'color-action-primary');
  return `https://komarev.com/ghpvc/?username=${username}&style=flat&color=${color}`;
}
```

- [ ] **Step 2: Append the marker builders**

```javascript
function buildHeaderMarkdown(tokens) {
  return `<div align="center">
  <img src=".github/assets/banner.svg" alt="Federico Bianchetti — AI Engineer · RAG & LLM Systems · Cloud Infrastructure" width="820"/>
  <p>
    <a href="https://www.linkedin.com/in/federico-bianchetti-6b5464204/">
      <img src="${shieldsBadgeUrl(tokens, 'LinkedIn', 'linkedin')}"/>
    </a>
    <img src="${komarevUrl(tokens, 'FakeBlubba')}"/>
  </p>
</div>`;
}

function buildWorkMarkdown() {
  return `<div align="center">
  <img src=".github/assets/work-rows.svg" alt="What I work on: ${escapeXml(WORK_ITEMS.map((i) => i.label).join(', '))}" width="820"/>
</div>`;
}

function buildTechMarkdown(tokens) {
  const groups = [...new Set(TECH_ITEMS.map((item) => item.group))];
  return groups
    .map((group) => {
      const badges = TECH_ITEMS.filter((item) => item.group === group)
        .map((item) => `![${item.label}](${shieldsBadgeUrl(tokens, item.label, item.logo)})`)
        .join('\n');
      return `**${group}**\n\n${badges}`;
    })
    .join('\n\n');
}

function buildProjectsLabelMarkdown() {
  return '<img src=".github/assets/section-label-projects.svg" alt="$ ls projects/"/>';
}

function buildStatsMarkdown(tokens) {
  return `<div align="center">
  <img height="160" src="${statsCardUrl(tokens, 'FakeBlubba')}"/>
  <img height="160" src="${topLangsUrl(tokens, 'FakeBlubba')}"/>
</div>`;
}
```

- [ ] **Step 3: Append the marker-replace helper, `verify()`, and `main()`**

```javascript
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceMarkerRegion(content, name, innerMarkdown) {
  const start = `<!-- TN:${name} -->`;
  const end = `<!-- /TN:${name} -->`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (!pattern.test(content)) {
    throw new Error(`Marker region not found in README.md: ${name}`);
  }
  return content.replace(pattern, `${start}\n${innerMarkdown}\n${end}`);
}

function verify(readmeContent, generatedFiles, markerNames) {
  for (const name of markerNames) {
    const start = `<!-- TN:${name} -->`;
    const end = `<!-- /TN:${name} -->`;
    const startCount = readmeContent.split(start).length - 1;
    const endCount = readmeContent.split(end).length - 1;
    assert.equal(startCount, 1, `Marker ${name} start must appear exactly once, found ${startCount}`);
    assert.equal(endCount, 1, `Marker ${name} end must appear exactly once, found ${endCount}`);
  }
  for (const file of generatedFiles) {
    assert.ok(file.svg.startsWith('<svg'), `${file.path} does not start with <svg`);
    assert.ok(file.svg.trim().endsWith('</svg>'), `${file.path} does not end with </svg>`);
  }
}

function main() {
  const cssText = readFileSync(TOKENS_CSS_PATH, 'utf8');
  const tokens = parseTokens(cssText);

  const generatedFiles = [
    { path: path.join(ASSETS_DIR, 'banner.svg'), svg: buildBannerSvg(tokens) },
    { path: path.join(ASSETS_DIR, 'work-rows.svg'), svg: buildWorkRowsSvg(tokens) },
    { path: path.join(ASSETS_DIR, 'section-label-projects.svg'), svg: buildSectionLabelSvg(tokens, '$ ls projects/') },
  ];

  const markerNames = ['HEADER', 'WORK', 'TECH', 'PROJECTS_LABEL', 'STATS'];
  let readme = readFileSync(README_PATH, 'utf8');
  readme = replaceMarkerRegion(readme, 'HEADER', buildHeaderMarkdown(tokens));
  readme = replaceMarkerRegion(readme, 'WORK', buildWorkMarkdown());
  readme = replaceMarkerRegion(readme, 'TECH', buildTechMarkdown(tokens));
  readme = replaceMarkerRegion(readme, 'PROJECTS_LABEL', buildProjectsLabelMarkdown());
  readme = replaceMarkerRegion(readme, 'STATS', buildStatsMarkdown(tokens));

  verify(readme, generatedFiles, markerNames);

  mkdirSync(ASSETS_DIR, { recursive: true });
  for (const file of generatedFiles) {
    writeFileSync(file.path, file.svg, 'utf8');
  }
  writeFileSync(README_PATH, readme, 'utf8');

  console.log('Generated:', generatedFiles.map((f) => f.path).join(', '), 'and updated README.md');
}

main();
```

- [ ] **Step 4: Run the full script for the first time**

Run: `npm run generate:readme-theme`

Expected output:
```
Generated: .github/assets/banner.svg, .github/assets/work-rows.svg, .github/assets/section-label-projects.svg and updated README.md
```

If it throws `Marker region not found`, Task 3 wasn't completed correctly for that section — go back and fix the marker text in `README.md` (it must match `<!-- TN:NAME -->` exactly, including spacing).

- [ ] **Step 5: Confirm idempotency (running it twice produces identical output)**

Run:
```bash
npm run generate:readme-theme
git diff --stat README.md .github/assets
```
Expected: `git diff --stat` shows no changes from the second run (the first run's `git add` in the next step hasn't happened yet, so compare by running twice in a row and checking the files are byte-identical):
```bash
npm run generate:readme-theme
md5sum README.md .github/assets/*.svg > /tmp/run1.md5
npm run generate:readme-theme
md5sum -c /tmp/run1.md5
```
Expected: all four files report `OK`.

- [ ] **Step 6: Stage for review**

```bash
git add scripts/generate-readme-theme.mjs README.md .github/assets
```

---

### Task 6: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/refresh-terminal-noir.yml`

**Interfaces:**
- Consumes: `npm run generate:readme-theme` (Task 1 + Task 5), the repo's existing `.npmrc` (registry mapping already committed), the built-in `secrets.GITHUB_TOKEN`.

- [ ] **Step 1: Write the workflow**

```yaml
name: Refresh Terminal Noir README theme

on:
  workflow_dispatch: {}
  push:
    paths:
      - package-lock.json

permissions:
  contents: write
  packages: read

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Generate README theme
        run: npm run generate:readme-theme

      - name: Commit changes if any
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add README.md .github/assets
          if git diff --cached --quiet; then
            echo "No changes to commit"
          else
            git commit -m "chore: refresh README theme from terminal-noir tokens"
            git push
          fi
```

- [ ] **Step 2: Confirm the required permissions are present**

A full YAML parse isn't available without adding a dependency; this check catches the one mistake that would silently break the workflow — forgetting `packages: read`, which the default `GITHUB_TOKEN` needs to install a package from `npm.pkg.github.com`, and which explicitly declaring `permissions:` at all removes unless listed.

Run:
```bash
grep -q "packages: read" .github/workflows/refresh-terminal-noir.yml && grep -q "contents: write" .github/workflows/refresh-terminal-noir.yml && echo OK
```
Expected: `OK`

- [ ] **Step 3: Stage for review**

```bash
git add .github/workflows/refresh-terminal-noir.yml
```

---

### Task 7: End-to-end verification on the real page

**Files:** none (verification only)

**Interfaces:** none — this task confirms Tasks 1–6 together produce a working result.

- [ ] **Step 1: Confirm the generated README renders correctly via GitHub's own markdown API**

Run (requires `GITHUB_TOKEN` in the environment, already set per this session):
```bash
node -e "
const fs = require('node:fs');
const readme = fs.readFileSync('README.md', 'utf8');
fetch('https://api.github.com/markdown', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ text: readme, mode: 'gfm', context: 'FakeBlubba/FakeBlubba' }),
})
  .then((r) => r.text())
  .then((html) => {
    fs.writeFileSync('/tmp/readme-preview.html', html);
    const hasScript = /<script/i.test(html);
    const hasStyleTag = /<style/i.test(html);
    console.log('script stripped:', !hasScript, '| style stripped:', !hasStyleTag, '| output bytes:', html.length);
  });
"
```
Expected: `script stripped: true | style stripped: true | output bytes: <some number>` — confirming the sanitizer behavior the whole design is built around, on the actual generated file.

- [ ] **Step 2: Visually confirm the SVGs read correctly**

Open each of `.github/assets/banner.svg`, `.github/assets/work-rows.svg`, `.github/assets/section-label-projects.svg` in a browser tab (`file://` path) or an image viewer. Confirm: dark background, light text, no clipped/overflowing text, three colored dots visible in the banner's top-left corner.

- [ ] **Step 3: Confirm every link in the regenerated README still resolves to the right place**

Run:
```bash
grep -oE 'href="[^"]+"' README.md
```
Expected: exactly two `href` values — the LinkedIn profile URL and (inside the Featured Projects table, untouched by this change) the three `github.com/FakeBlubba/...` repo URLs — five total, all unchanged from before this plan.

- [ ] **Step 4: Leave everything staged, uncommitted, for the user to review and push**

Run: `git status --short`
Expected: `.gitignore`, `package.json`, `scripts/generate-readme-theme.mjs`, `README.md`, `.github/assets/`, `.github/workflows/refresh-terminal-noir.yml` all show as staged (`A`/`M` in the index column). Nothing is committed. Report this final status to the user instead of committing it.
