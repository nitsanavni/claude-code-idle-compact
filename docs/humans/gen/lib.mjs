// Shared page shell for the generators in this folder: reads docs/style/style.css,
// wraps one SVG in a calm HTML page with a "How to read this diagram" key, and
// writes <name>.html and <name>.svg. Each generator owns its DSL and its drawing.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
export const r = n => Math.round(n * 10) / 10

// Extra vocabulary for box, plot and graph diagrams, on top of style.css's tokens.
export const EXTRA = `
.g-box    { fill: var(--t); stroke: var(--h); stroke-width: 1.25; stroke-opacity: .55; }
.g-box.dashed, .g-group { stroke-dasharray: 5 5; }
.g-group  { fill: none; stroke: var(--ink-3); stroke-width: 1.25; stroke-opacity: .6; }
.g-title  { font: 600 14px var(--sans); fill: var(--ink); }
.g-sub    { font: 400 12px var(--sans); fill: var(--ink-2); }
.g-mono   { font: 500 12px var(--mono); fill: var(--ink); }
.g-cap    { font: 600 11px var(--sans); fill: var(--ink-3); letter-spacing: .12em; text-transform: uppercase; }
.g-edge   { fill: none; stroke: var(--ink-3); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.g-edge.dashed { stroke-dasharray: 4 5; }
.g-head   { fill: none; stroke: var(--ink-3); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.g-elabel { font: 500 12px var(--sans); fill: var(--ink-2); paint-order: stroke; stroke: var(--surface); stroke-width: 5px; stroke-linejoin: round; }
.g-axis   { stroke: var(--ink-3); stroke-width: 1; }
.g-zone   { fill: var(--t); }
.g-zone.dashed { fill: url(#hatch); }
.g-edge-h { fill: none; stroke: var(--h); stroke-width: 2; stroke-linecap: round; }
.g-hatch  { stroke: var(--h); stroke-width: 1.25; stroke-opacity: .35; }
.g-unset  { fill: var(--ink-3); opacity: .5; }
.g-rule   { stroke: var(--rule); stroke-width: 1; }
.g-start  { fill: var(--ink-3); }
`

const css = readFileSync(join(here, '../../style/style.css'), 'utf8')
// the standalone SVG keeps only tokens + svg vocabulary (same trim as docs/tools/marble.mjs)
const svgCss = css.replace(/\/\* page \*\/[\s\S]*?\/\* svg vocabulary/, '/* svg vocabulary').replace(/\/\* "How to read[\s\S]*$/, '')

/** An <svg> with a paper background; `inner` is the drawing. */
export function svg({ W, H, title, inner, standalone = false, defs = '' }) {
  const style = standalone ? `<style>${svgCss}${EXTRA}</style>` : ''
  const bg = standalone ? `<rect class="d-bg" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" font-family="Inter, system-ui, sans-serif"><title>${esc(title)}</title>${style}${defs ? `<defs>${defs}</defs>` : ''}\n${bg}${inner}\n</svg>`
}

/** Header lines `title:`, `caption:`, `note:` and the rest of the source. */
export function header(src) {
  const meta = {}, body = []
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim() || line.trim().startsWith('#')) continue
    const m = line.match(/^(title|caption|note|eyebrow):\s*(.*)$/)
    if (m) meta[m[1]] = m[2]
    else body.push(line.trim())
  }
  return { meta, body }
}

/** Split a DSL line into fields on runs of 2+ spaces. */
export const cols = line => line.split(/\s{2,}/)

/** A legend icon: 34x18 svg. */
export const icon = body => `<svg viewBox="0 0 34 18" aria-hidden="true">${body}</svg>`
export const li = (ic, label, rest = '') => `<li>${ic}<span><b>${esc(label)}</b>${rest ? ' — ' + rest : ''}</span></li>`

export function page({ meta, figure, key, src, kind }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)}</title>
<style>${css}${EXTRA}</style>
</head>
<body>
<main class="page">
<p class="eyebrow">idle-compact · ${esc(meta.eyebrow || kind)}</p>
<h1>${esc(meta.title)}</h1>
${meta.caption ? `<p class="lede">${esc(meta.caption)}</p>` : ''}
<figure class="figure">${figure}</figure>
${meta.note ? `<p class="note">${esc(meta.note)}</p>` : ''}
<details class="key"><summary>How to read this diagram</summary>${key}</details>
<details class="source"><summary>Diagram source</summary><pre>${esc(src.trim())}</pre></details>
</main>
</body>
</html>
`
}

/** CLI: node gen/<x>.mjs <source>... -> <source minus ext>.html and .svg */
export function main(metaUrl, ext, build) {
  if (fileURLToPath(metaUrl) !== process.argv[1]) return
  const files = process.argv.slice(2)
  if (!files.length) { console.error(`usage: node ${process.argv[1]} <file${ext}>...`); process.exit(2) }
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const { html, svg } = build(src)
    const base = f.replace(new RegExp(`\\${ext}$`), '')
    writeFileSync(base + '.html', html)
    writeFileSync(base + '.svg', svg + '\n')
    console.log(`${f} -> ${base}.html, ${base}.svg`)
  }
}
