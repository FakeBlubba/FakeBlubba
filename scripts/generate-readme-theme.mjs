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
const SANS_CHAR_WIDTH_RATIO = 0.52; // IBM Plex Sans average advance width relative to font-size, for line-wrap estimates

function monoTextWidth(text, fontSize) {
  return Math.ceil(text.length * fontSize * MONO_CHAR_WIDTH_RATIO);
}

function wrapText(text, fontSize, maxWidth) {
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * SANS_CHAR_WIDTH_RATIO)));
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function hex(tokens, name) {
  return tokens[name].replace('#', '');
}

const MONO_FONT = "'IBM Plex Mono', ui-monospace, monospace";
const SANS_FONT = "'IBM Plex Sans', system-ui, sans-serif";

// Icon path data copied verbatim from @fakeblubba/terminal-noir/assets/icons.svg —
// inlined so each generated file is self-contained (no external asset reference).
const ICON_DATA_PIPELINE = '<circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/><path d="M7.2 12h2.6M14.2 12h2.6"/>';
const ICON_STATUS_SPARKLE = '<path d="M11 4l1.7 4.6L17 10l-4.3 1.4L11 16l-1.7-4.6L5 10l4.3-1.4zM18.5 15l.7 1.9 1.8.6-1.8.6-.7 1.9-.7-1.9-1.8-.6 1.8-.6z"/>';
const ICON_DATA_CLOUD = '<path d="M7 18a4.5 4.5 0 0 1 .4-9 6 6 0 0 1 11.3 2 3.8 3.8 0 0 1-.7 7z"/>';
const ICON_DATA_SERVER = '<path d="M4 4h16v6H4zM4 14h16v6H4z"/><circle cx="7.5" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="7.5" cy="17" r="1.1" fill="currentColor" stroke="none"/>';
const ICON_STATUS_INFO_CIRCLE = '<circle cx="12" cy="12" r="8"/><path d="M12 11.2v5"/><circle cx="12" cy="8.4" r="1.1" fill="currentColor" stroke="none"/>';

function buildIcon(pathMarkup, x, y, size, color) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" color="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${pathMarkup}</svg>`;
}

// --- Divider (B4): 8x8 checker tile, terminal-noir Divider component reinterpreted ---

function buildDividerSvg(tokens) {
  const width = 820;
  const height = 8;
  const squareSize = 8;
  const count = Math.ceil(width / squareSize);
  const squares = Array.from({ length: count }, (_, i) => {
    const x = i * squareSize;
    return i % 2 === 0
      ? `<rect x="${x}" y="0" width="${squareSize}" height="${height}" fill="${tokens['color-bg-surface']}"/>`
      : `<rect x="${x}" y="0" width="${squareSize}" height="${height}" fill="${tokens['color-action-primary']}" fill-opacity="0.2"/>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="section divider">
  ${squares}
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

// --- Chip (Fase 3, 3.6 CHIPS): tone drives colour. "selected" is the schema's
// filled-accent state; every other tone is an outline on the surface colour. ---

function chipToneColors(tokens, tone) {
  if (tone === 'selected') {
    return { bg: tokens['color-action-primary'], border: tokens['color-action-primary'], text: tokens['color-text-on-accent'] };
  }
  const borderToken = {
    neutral: 'color-border-interactive',
    success: 'color-feedback-success',
    warning: 'color-feedback-warning',
    danger: 'color-feedback-danger',
    info: 'color-feedback-info',
  }[tone];
  return { bg: tokens['color-bg-surface-raised'], border: tokens[borderToken], text: tokens['color-text-primary'] };
}

function buildChipRowSvg(tokens, items) {
  const fontSize = 12;
  const paddingX = 12;
  const height = 26;
  const gap = 8;

  let x = 0;
  const chips = items.map((item) => {
    const c = chipToneColors(tokens, item.tone);
    const textWidth = monoTextWidth(item.label, fontSize);
    const chipWidth = textWidth + paddingX * 2;
    const chipX = x;
    x += chipWidth + gap;
    return `<g transform="translate(${chipX},0)">
  <rect x="0.5" y="0.5" width="${chipWidth - 1}" height="${height - 1}" rx="${height / 2}" fill="${c.bg}" stroke="${c.border}"/>
  <text x="${chipWidth / 2}" y="${height / 2 + fontSize / 3}" text-anchor="middle" font-family="${MONO_FONT}" font-size="${fontSize}" fill="${c.text}">${escapeXml(item.label)}</text>
</g>`;
  }).join('\n');

  const width = x - gap;
  const ariaLabel = items.map((i) => i.label).join(', ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}">
${chips}
</svg>`;
}

// --- Button (Fase 6): variant drives colour. "link" renders as bare coloured
// text (no box) — used where the button IS the clickable element's whole label. ---

function buttonVariantStyle(tokens, variant) {
  switch (variant) {
    case 'primary':
      return { bg: tokens['color-action-primary'], border: tokens['color-border-accent'], text: tokens['color-text-on-accent'] };
    case 'secondary':
      return { bg: tokens['color-bg-surface-raised'], border: tokens['color-border-default'], text: tokens['color-text-primary'] };
    case 'link':
      return { bg: null, border: null, text: tokens['color-text-link'] };
    default:
      throw new Error(`Unknown button variant: ${variant}`);
  }
}

function buildButtonSvg(tokens, label, variant) {
  const style = buttonVariantStyle(tokens, variant);

  if (variant === 'link') {
    const fontSize = 20;
    const paddingY = 4;
    const width = monoTextWidth(label, fontSize);
    const height = fontSize + paddingY * 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">
  <text x="0" y="${height / 2 + fontSize / 3}" font-family="${MONO_FONT}" font-size="${fontSize}" font-weight="600" fill="${style.text}">${escapeXml(label)}</text>
</svg>`;
  }

  const fontSize = 13;
  const paddingX = 16;
  const height = 36;
  const width = monoTextWidth(label, fontSize) + paddingX * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" fill="${style.bg}" stroke="${style.border}"/>
  <text x="${width / 2}" y="${height / 2 + fontSize / 3}" text-anchor="middle" font-family="${MONO_FONT}" font-size="${fontSize}" font-weight="500" fill="${style.text}">${escapeXml(label)}</text>
</svg>`;
}

// --- Alert (Fase 5, 5.3): level=section, severity=info. A custom title is only
// possible because this is a generated image — GitHub's native `> [!NOTE]`
// syntax fixes its own header text and can't be recoloured at all. ---

function buildAlertSvg(tokens, title, description) {
  const width = 820;
  const paddingX = 20;
  const paddingTop = 18;
  const iconSize = 20;
  const titleFontSize = 14;
  const bodyFontSize = 14;
  const lineHeight = 22;
  const textX = paddingX + iconSize + 12;
  const textMaxWidth = width - textX - paddingX;
  const accent = tokens['color-feedback-info'];

  const lines = wrapText(description, bodyFontSize, textMaxWidth);
  const titleY = paddingTop + 14;
  const firstLineY = titleY + 26;
  const bodyLines = lines
    .map((line, i) => `<text x="${textX}" y="${firstLineY + i * lineHeight}" font-family="${SANS_FONT}" font-size="${bodyFontSize}" fill="${tokens['color-text-secondary']}">${escapeXml(line)}</text>`)
    .join('\n  ');
  const height = firstLineY + (lines.length - 1) * lineHeight + 20;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}: ${escapeXml(description)}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" fill="${tokens['color-bg-surface']}" stroke="${tokens['color-border-subtle']}"/>
  <rect x="0" y="0" width="4" height="${height}" fill="${accent}"/>
  ${buildIcon(ICON_STATUS_INFO_CIRCLE, paddingX, paddingTop, iconSize, accent)}
  <text x="${textX}" y="${titleY}" font-family="${MONO_FONT}" font-size="${titleFontSize}" font-weight="600" letter-spacing="0.04em" fill="${accent}">${escapeXml(title)}</text>
  ${bodyLines}
</svg>`;
}

// --- Data table (Fase 8, 8.1): 2 columns, icon + label cell / plain detail cell ---

const WORK_ITEMS = [
  { label: 'RAG pipelines', detail: 'embedding indexing, vector stores, retrieval orchestration', icon: ICON_DATA_PIPELINE },
  { label: 'LLM agents', detail: 'multi-agent systems, tool use, monitoring agents', icon: ICON_STATUS_SPARKLE },
  { label: 'Cloud infra', detail: 'AWS Lambda · DynamoDB · Bedrock · Terraform · Packer', icon: ICON_DATA_CLOUD },
  { label: 'Backend services', detail: 'FastAPI · document ingestion · entity extraction', icon: ICON_DATA_SERVER },
];

function buildWorkRowsSvg(tokens) {
  const width = 820;
  const rowHeight = 46;
  const topPadding = 18;
  const bottomPadding = 18;
  const height = topPadding + WORK_ITEMS.length * rowHeight + bottomPadding;
  const iconX = 24;
  const labelX = 56;
  const detailX = 264;

  const rows = WORK_ITEMS.map((item, index) => {
    const rowTop = topPadding + index * rowHeight;
    const textY = rowTop + rowHeight / 2 + 5;
    const divider = index > 0
      ? `<line x1="24" y1="${rowTop}" x2="${width - 24}" y2="${rowTop}" stroke="${tokens['color-border-subtle']}" stroke-width="1"/>`
      : '';
    return `${divider}
  ${buildIcon(item.icon, iconX, textY - 14, 18, tokens['color-text-link'])}
  <text x="${labelX}" y="${textY}" font-family="${MONO_FONT}" font-size="13" font-weight="500" letter-spacing="0.06em" fill="${tokens['color-text-link']}">${escapeXml(item.label)}</text>
  <text x="${detailX}" y="${textY}" font-family="${SANS_FONT}" font-size="13" fill="${tokens['color-text-secondary']}">${escapeXml(item.detail)}</text>`;
  }).join('\n');

  const ariaLabel = `What I work on: ${WORK_ITEMS.map((i) => i.label).join(', ')}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(ariaLabel)}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" fill="${tokens['color-bg-surface']}" stroke="${tokens['color-border-subtle']}"/>
  ${rows}
</svg>`;
}

// --- Content data ---

const IDENTITY_CHIPS = [
  { label: 'AI ENGINEER', tone: 'selected' },
  { label: 'TORINO', tone: 'neutral' },
  { label: 'RAG · LLM', tone: 'neutral' },
];

const SOCIAL_LINKS = [
  { label: 'GitHub', url: 'https://github.com/FakeBlubba', variant: 'primary' },
  { label: 'LinkedIn', url: 'https://www.linkedin.com/in/federico-bianchetti-6b5464204/', variant: 'secondary' },
];

const TECH_GROUPS = [
  { group: 'AI/ML', items: ['Python', 'FastAPI', 'TensorFlow', 'scikit-learn'] },
  { group: 'Cloud & Infra', items: ['AWS', 'Terraform', 'Docker'] },
  { group: 'Databases', items: ['PostgreSQL', 'MongoDB', 'DynamoDB'] },
];

const PROJECTS = [
  {
    name: 'FrameDeployer',
    url: 'https://github.com/FakeBlubba/FrameDeployer',
    what: 'Automated video generation from trending topics: NLP summarization, sentiment analysis, TTS, subtitle sync',
    tags: [{ label: 'Python', tone: 'info' }, { label: 'NLP', tone: 'success' }],
  },
  {
    name: 'depression-pre-diagnose-model',
    url: 'https://github.com/FakeBlubba/depression-pre-diagnose-model',
    what: 'BERT-based NLP classifier for depression symptom detection from text and audio',
    tags: [{ label: 'BERT', tone: 'warning' }, { label: 'Research', tone: 'neutral' }],
  },
  {
    name: 'MAADB',
    url: 'https://github.com/FakeBlubba/MAADB',
    what: 'Sentiment analysis on tweets: MongoDB MapReduce vs PostgreSQL performance comparison',
    tags: [{ label: 'MongoDB', tone: 'success' }, { label: 'PostgreSQL', tone: 'info' }],
  },
];

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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
  return `https://komarev.com/ghpvc/?username=${username}&label=SCORE&style=flat&color=${color}`;
}

// --- Assembly: everything visual is a generated file using terminal-noir's
// own component contracts and IBM Plex fonts — nothing here falls back to
// GitHub's default markdown theme or a third-party badge service's font. ---

function buildAssets(tokens) {
  const files = [
    { path: path.join(ASSETS_DIR, 'divider.svg'), svg: buildDividerSvg(tokens) },
    { path: path.join(ASSETS_DIR, 'section-label-projects.svg'), svg: buildSectionLabelSvg(tokens, '$ ls projects/') },
    { path: path.join(ASSETS_DIR, 'work-rows.svg'), svg: buildWorkRowsSvg(tokens) },
    { path: path.join(ASSETS_DIR, 'alert-bio.svg'), svg: buildAlertSvg(tokens, '$ cat about.md', 'I build AI-powered backend systems for enterprise clients. My day-to-day is RAG pipelines, LLM orchestration, agentic architectures, and cloud infrastructure on AWS.') },
    { path: path.join(ASSETS_DIR, 'chips-identity.svg'), svg: buildChipRowSvg(tokens, IDENTITY_CHIPS) },
  ];

  for (const link of SOCIAL_LINKS) {
    files.push({ path: path.join(ASSETS_DIR, `action-${slug(link.label)}.svg`), svg: buildButtonSvg(tokens, link.label, link.variant) });
  }

  for (const group of TECH_GROUPS) {
    const items = group.items.map((label) => ({ label, tone: 'neutral' }));
    files.push({ path: path.join(ASSETS_DIR, `chips-tech-${slug(group.group)}.svg`), svg: buildChipRowSvg(tokens, items) });
  }

  for (const project of PROJECTS) {
    files.push({ path: path.join(ASSETS_DIR, `project-name-${slug(project.name)}.svg`), svg: buildButtonSvg(tokens, project.name, 'link') });
    files.push({ path: path.join(ASSETS_DIR, `project-tags-${slug(project.name)}.svg`), svg: buildChipRowSvg(tokens, project.tags) });
  }

  return files;
}

function buildHeaderMarkdown() {
  const chips = `<img src=".github/assets/chips-identity.svg" alt="${escapeXml(IDENTITY_CHIPS.map((c) => c.label).join(', '))}"/>`;
  const actions = SOCIAL_LINKS
    .map((link) => `<a href="${link.url}"><img src=".github/assets/action-${slug(link.label)}.svg" alt="${escapeXml(link.label)}"/></a>`)
    .join(' ');

  return `<table>
<tr>
<td width="140" align="center">
  <img src=".github/assets/avatar-8bit.png" width="120" height="120" alt="Avatar 8-bit di Federico Bianchetti"/>
</td>
<td>

\`\`\`
$ whoami
\`\`\`

# Federico Bianchetti
**AI Engineer · RAG & LLM Systems · Cloud Infrastructure**

${chips}

${actions}

</td>
</tr>
</table>`;
}

function buildTechMarkdown() {
  return TECH_GROUPS
    .map((group) => `**LOADOUT · ${group.group}**\n\n<img src=".github/assets/chips-tech-${slug(group.group)}.svg" alt="${escapeXml(group.items.join(', '))}"/>`)
    .join('\n\n');
}

function buildProjectsMarkdown() {
  const cards = PROJECTS.map((project) => {
    const nameSlug = slug(project.name);
    return `<a href="${project.url}"><img src=".github/assets/project-name-${nameSlug}.svg" alt="${escapeXml(project.name)}"/></a>

${project.what}

<img src=".github/assets/project-tags-${nameSlug}.svg" alt="${escapeXml(project.tags.map((t) => t.label).join(', '))}"/>`;
  }).join('\n\n');

  return `<img src=".github/assets/section-label-projects.svg" alt="$ ls projects/"/>

${cards}`;
}

function buildStatsMarkdown(tokens) {
  return `<div align="center">
  <img height="160" alt="GitHub stats for FakeBlubba" src="${statsCardUrl(tokens, 'FakeBlubba')}"/>
  <img height="160" alt="Most used languages for FakeBlubba" src="${topLangsUrl(tokens, 'FakeBlubba')}"/>
</div>`;
}

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

  const generatedFiles = buildAssets(tokens);

  const markerNames = ['HEADER', 'TECH', 'PROJECTS', 'STATS'];
  let readme = readFileSync(README_PATH, 'utf8');
  readme = replaceMarkerRegion(readme, 'HEADER', buildHeaderMarkdown());
  readme = replaceMarkerRegion(readme, 'TECH', buildTechMarkdown());
  readme = replaceMarkerRegion(readme, 'PROJECTS', buildProjectsMarkdown());
  readme = replaceMarkerRegion(readme, 'STATS', buildStatsMarkdown(tokens));

  verify(readme, generatedFiles, markerNames);

  mkdirSync(ASSETS_DIR, { recursive: true });
  for (const file of generatedFiles) {
    writeFileSync(file.path, file.svg, 'utf8');
  }
  writeFileSync(README_PATH, readme, 'utf8');

  console.log('Generated:', generatedFiles.length, 'assets and updated README.md');
}

main();
