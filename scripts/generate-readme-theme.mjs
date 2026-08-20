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
