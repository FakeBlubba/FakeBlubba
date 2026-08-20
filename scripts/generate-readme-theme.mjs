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

// Icon path data copied from @fakeblubba/terminal-noir/assets/icons.svg
// (symbols icon-data-pipeline, icon-status-sparkle, icon-data-cloud, icon-data-server).
const ICON_DATA_PIPELINE = '<circle cx="5" cy="12" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="19" cy="12" r="2.2"/><path d="M7.2 12h2.6M14.2 12h2.6"/>';
const ICON_STATUS_SPARKLE = '<path d="M11 4l1.7 4.6L17 10l-4.3 1.4L11 16l-1.7-4.6L5 10l4.3-1.4zM18.5 15l.7 1.9 1.8.6-1.8.6-.7 1.9-.7-1.9-1.8-.6 1.8-.6z"/>';
const ICON_DATA_CLOUD = '<path d="M7 18a4.5 4.5 0 0 1 .4-9 6 6 0 0 1 11.3 2 3.8 3.8 0 0 1-.7 7z"/>';
const ICON_DATA_SERVER = '<path d="M4 4h16v6H4zM4 14h16v6H4z"/><circle cx="7.5" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="7.5" cy="17" r="1.1" fill="currentColor" stroke="none"/>';

const WORK_ITEMS = [
  { label: 'RAG pipelines', detail: 'embedding indexing, vector stores, retrieval orchestration', icon: ICON_DATA_PIPELINE },
  { label: 'LLM agents', detail: 'multi-agent systems, tool use, monitoring agents', icon: ICON_STATUS_SPARKLE },
  { label: 'Cloud infra', detail: 'AWS Lambda · DynamoDB · Bedrock · Terraform · Packer', icon: ICON_DATA_CLOUD },
  { label: 'Backend services', detail: 'FastAPI · document ingestion · entity extraction', icon: ICON_DATA_SERVER },
];

const MONO_FONT = "'IBM Plex Mono', ui-monospace, monospace";
const SANS_FONT = "'IBM Plex Sans', system-ui, sans-serif";

function buildIcon(pathMarkup, x, y, size, color) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" color="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${pathMarkup}</svg>`;
}

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
// so a tag's colour carries the same meaning it would inside the real component.
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

const SOCIAL_LINKS = [
  { label: 'LinkedIn', logo: 'linkedin', url: 'https://www.linkedin.com/in/federico-bianchetti-6b5464204/' },
  { label: 'GitHub', logo: 'github', url: 'https://github.com/FakeBlubba' },
];

function shieldsLabelEncode(label) {
  return encodeURIComponent(label.replace(/-/g, '--'));
}

function shieldsBadgeUrl(tokens, label, logo) {
  const bg = hex(tokens, 'color-bg-surface-raised');
  const logoColor = hex(tokens, 'color-text-primary');
  return `https://img.shields.io/badge/${shieldsLabelEncode(label)}-${bg}?style=flat-square&logo=${logo}&logoColor=${logoColor}`;
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

function komarevUrl(tokens, username) {
  const color = hex(tokens, 'color-action-primary');
  return `https://komarev.com/ghpvc/?username=${username}&style=flat&color=${color}`;
}

function buildHeaderMarkdown(tokens) {
  const links = SOCIAL_LINKS
    .map((link) => `  <a href="${link.url}"><img alt="${escapeXml(link.label)}" src="${shieldsBadgeUrl(tokens, link.label, link.logo)}"/></a>`)
    .join('\n');

  return `<h1 align="center">Federico Bianchetti</h1>
<p align="center"><code>AI Engineer &nbsp;·&nbsp; RAG &amp; LLM Systems &nbsp;·&nbsp; Cloud Infrastructure</code></p>
<p align="center">
${links}
  <img alt="Profile views" src="${komarevUrl(tokens, 'FakeBlubba')}"/>
</p>`;
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

function buildProjectsMarkdown(tokens) {
  const rows = PROJECTS.map((project) => {
    const tags = project.tags
      .map((tag) => `![${tag.label}](${toneTagUrl(tokens, tag.label, tag.tone)})`)
      .join(' ');
    return `| [**${project.name}**](${project.url}) | ${project.what} | ${tags} |`;
  }).join('\n');

  return `<img src=".github/assets/section-label-projects.svg" alt="$ ls projects/"/>

| Repo | What it does | Stack |
|---|---|---|
${rows}`;
}

function buildStatsMarkdown(tokens) {
  return `<div align="center">
  <img height="160" src="${statsCardUrl(tokens, 'FakeBlubba')}"/>
  <img height="160" src="${topLangsUrl(tokens, 'FakeBlubba')}"/>
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
    { path: path.join(ASSETS_DIR, 'work-rows.svg'), svg: buildWorkRowsSvg(tokens) },
    { path: path.join(ASSETS_DIR, 'section-label-projects.svg'), svg: buildSectionLabelSvg(tokens, '$ ls projects/') },
  ];

  const markerNames = ['HEADER', 'WORK', 'TECH', 'PROJECTS', 'STATS'];
  let readme = readFileSync(README_PATH, 'utf8');
  readme = replaceMarkerRegion(readme, 'HEADER', buildHeaderMarkdown(tokens));
  readme = replaceMarkerRegion(readme, 'WORK', buildWorkMarkdown());
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
