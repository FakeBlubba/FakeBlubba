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

const MONO_FONT = "'IBM Plex Mono', ui-monospace, monospace";

// B4 in the "Profilo GitHub 8-bit" design (Terminal Noir Claude Design project,
// projectId 8f18d26f-a7f9-495b-9bc0-463801aa77c7): an 8x8 checker tile repeated
// across the width, alternating the surface colour with the brand red at low
// opacity. The design calls for a PNG tile; a generated SVG achieves the same
// pixel-grid look without needing a rasterizer in this pipeline.
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

// B2: role / location / focus chips — static, not links (design intent: readers
// understand the profile before they click anything). "Availability" from the
// original design brief is deliberately omitted — that's a status claim about
// the person, not a fact this generator has any business asserting.
const IDENTITY_CHIPS = ['AI ENGINEER', 'TORINO', 'RAG · LLM'];

const SOCIAL_LINKS = [
  { label: 'LinkedIn', logo: 'linkedin', url: 'https://www.linkedin.com/in/federico-bianchetti-6b5464204/' },
  { label: 'GitHub', logo: 'github', url: 'https://github.com/FakeBlubba' },
];

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

// Maps the data-table contract's `tone` enum onto terminal-noir feedback tokens,
// so a project tag's colour carries the same meaning it would inside the real
// component, instead of being picked for decoration.
const TONE_TOKEN = {
  neutral: 'color-bg-surface-raised',
  success: 'color-feedback-success',
  warning: 'color-feedback-warning',
  danger: 'color-feedback-danger',
  info: 'color-feedback-info',
};

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

function shieldsLabelEncode(label) {
  return encodeURIComponent(label.replace(/-/g, '--'));
}

function shieldsBadgeUrl(tokens, label, logo) {
  const bg = hex(tokens, 'color-bg-surface-raised');
  const logoColor = hex(tokens, 'color-text-primary');
  return `https://img.shields.io/badge/${shieldsLabelEncode(label)}-${bg}?style=flat-square&logo=${logo}&logoColor=${logoColor}`;
}

// B2's exact spec: solid brand red, flat-square (sharp corners match the 8-bit assets).
function identityBadgeUrl(tokens, text) {
  const color = hex(tokens, 'color-action-primary');
  return `https://img.shields.io/badge/${shieldsLabelEncode(text)}-${color}?style=flat-square`;
}

function toneTagUrl(tokens, label, tone) {
  const color = hex(tokens, TONE_TOKEN[tone]);
  return `https://img.shields.io/badge/${shieldsLabelEncode(label)}-${color}?style=flat-square`;
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

// B3's playful touch: relabel the visit counter like an arcade score. The number
// itself is still the real count komarev reports — only the label changes.
function komarevUrl(tokens, username) {
  const color = hex(tokens, 'color-action-primary');
  return `https://komarev.com/ghpvc/?username=${username}&label=SCORE&style=flat&color=${color}`;
}

// B1 (avatar + "$ whoami" + name + role) and B2/B3 (identity chips + action
// badges) combined into one header block, laid out with a two-column HTML
// table so the avatar sits beside the text instead of stacked above it.
function buildHeaderMarkdown(tokens) {
  const chips = IDENTITY_CHIPS
    .map((text) => `<img alt="${escapeXml(text)}" src="${identityBadgeUrl(tokens, text)}"/>`)
    .join(' ');
  const actions = SOCIAL_LINKS
    .map((link) => `<a href="${link.url}"><img alt="${escapeXml(link.label)}" src="${shieldsBadgeUrl(tokens, link.label, link.logo)}"/></a>`)
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

${actions} <img alt="Profile views" src="${komarevUrl(tokens, 'FakeBlubba')}"/>

</td>
</tr>
</table>`;
}

function buildTechMarkdown(tokens) {
  const groups = [...new Set(TECH_ITEMS.map((item) => item.group))];
  return groups
    .map((group) => {
      const badges = TECH_ITEMS.filter((item) => item.group === group)
        .map((item) => `![${item.label}](${shieldsBadgeUrl(tokens, item.label, item.logo)})`)
        .join('\n');
      return `**LOADOUT · ${group}**\n\n${badges}`;
    })
    .join('\n\n');
}

// B8: project cards instead of a table — name is the header, not squeezed into
// a narrow column next to a long description. Real repo links stay real links.
function buildProjectsMarkdown(tokens) {
  const cards = PROJECTS.map((project) => {
    const tags = project.tags
      .map((tag) => `![${tag.label}](${toneTagUrl(tokens, tag.label, tag.tone)})`)
      .join(' ');
    return `### [${project.name}](${project.url})

${project.what}

${tags}`;
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

  const generatedFiles = [
    { path: path.join(ASSETS_DIR, 'divider.svg'), svg: buildDividerSvg(tokens) },
    { path: path.join(ASSETS_DIR, 'section-label-projects.svg'), svg: buildSectionLabelSvg(tokens, '$ ls projects/') },
  ];

  const markerNames = ['HEADER', 'TECH', 'PROJECTS', 'STATS'];
  let readme = readFileSync(README_PATH, 'utf8');
  readme = replaceMarkerRegion(readme, 'HEADER', buildHeaderMarkdown(tokens));
  readme = replaceMarkerRegion(readme, 'TECH', buildTechMarkdown(tokens));
  readme = replaceMarkerRegion(readme, 'PROJECTS', buildProjectsMarkdown(tokens));
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
