#!/usr/bin/env node
// marble.mjs: ASCII marble diagram (the DSL) -> calm HTML + standalone SVG.
// Zero dependencies. Usage: node docs/tools/marble.mjs <in.marble>... (writes <in>.html and <in>.svg next to each)
//
// Source format (see docs/tools/README.md):
//   # comment                      ignored
//   title: / caption: / note:      page text
//   time     0    5    10          axis: each label sits at its column
//   lane     -a---[====b---x   |   one lane per line; lane name, 2+ spaces, marbles
//   legend                         then lines:  <sym>  <label[ — sub]>  [hue]
// Marbles: '-' time passes, ' ' lane idle, '|' lane ends, '[' opens a span,
//   '=' or '~' span fill, ']' closes, 'x' cancels (closes a span), '>' span runs on,
//   any other char is an event; an event closes an open span, and opens one if fill follows.
// Columns are instants: all lanes share one origin (the leftmost marble column).

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FILL = new Set(['=', '~'])
const HUES = new Set(['ink', 'sky', 'sage', 'sand', 'rose', 'plum', 'mute'])

export function parse(src) {
  const doc = { title: '', caption: '', note: '', axis: [], lanes: [], legend: {}, cols: 0 }
  const raw = [] // [{name, start, line}] before origin is known
  let mode = 'lanes'
  for (const line of src.split('\n').map(l => l.replace(/\s+$/, ''))) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const kv = line.match(/^(title|caption|note):\s*(.*)$/)
    if (kv) { doc[kv[1]] = doc[kv[1]] ? doc[kv[1]] + ' ' + kv[2] : kv[2]; continue }
    if (/^legend:?$/.test(line.trim())) { mode = 'legend'; continue }
    if (mode === 'legend') {
      const m = line.trim().match(/^(\S)\s{2,}(.+?)(?:\s{2,}(\w+))?$/)
      if (!m) throw new Error(`bad legend line: ${line}`)
      const [label, sub = ''] = m[2].split(/\s+—\s+/)
      const hue = m[3] || 'ink'
      if (!HUES.has(hue)) throw new Error(`unknown hue "${hue}" (use ${[...HUES].join(', ')})`)
      doc.legend[m[1]] = { label, sub, hue }
      continue
    }
    const m = line.match(/^(\S+(?: \S+)*)\s{2,}/)
    if (!m) throw new Error(`bad lane line (need name, 2+ spaces, marbles): ${line}`)
    raw.push({ name: m[1], start: m[0].length, line })
  }
  const origin = Math.min(...raw.map(r => r.start))
  for (const r of raw) {
    const cells = r.line.slice(origin)
    doc.cols = Math.max(doc.cols, cells.length)
    if (r.name === 'time') {
      for (const t of cells.matchAll(/\S+/g)) doc.axis.push({ col: t.index, text: t[0] })
    } else doc.lanes.push({ name: r.name, ...lane(cells) })
  }
  return doc
}

export function lane(cells) {
  const items = [], segs = []
  let span = null, seg = null
  const close = (col, end) => { items.push({ kind: 'span', ...span, to: col, end }); span = null }
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (c === ' ') { if (seg) { segs.push(seg); seg = null } continue }
    if (!seg) seg = { from: i, to: i }
    seg.to = i
    if (c === '-' || (span && FILL.has(c))) continue
    if (c === '[') { span = { fill: FILL.has(cells[i + 1]) ? cells[i + 1] : '=', from: i }; continue }
    if (c === ']') { if (span) close(i, 'close'); continue }
    if (c === '>') { if (span) close(i, 'open'); continue }
    if (c === '|') { items.push({ kind: 'end', col: i }); segs.push(seg); seg = null; continue }
    if (c === 'x') { if (span) close(i, 'cancel'); items.push({ kind: 'cancel', sym: 'x', col: i }); continue }
    if (span) close(i, 'close')
    items.push({ kind: 'event', sym: c, col: i })
    if (FILL.has(cells[i + 1])) span = { fill: cells[i + 1], from: i }
  }
  if (span) close(cells.length - 1, 'open')
  if (seg) segs.push(seg)
  return { items, segs }
}

// ---------- render ----------

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const textW = (s, px) => s.length * px * 0.56 // close enough for Inter at small sizes

export function svg(doc, { css = '' } = {}) {
  const W = 920, L = 112, R = 40, top = 28
  const cell = (W - L - R) / Math.max(1, doc.cols - 1)
  const x = col => L + col * cell
  const legend = s => doc.legend[s] || { label: s, sub: '', hue: 'ink' }
  const out = []
  let y = top + 18

  const lanes = doc.lanes.map(ln => {
    // stagger event labels into rows so none collide
    const rows = [], placed = []
    for (const it of ln.items.filter(i => i.kind === 'event' || i.kind === 'cancel').sort((a, b) => a.col - b.col)) {
      const g = legend(it.sym)
      const w = Math.max(textW(g.label, 13), textW(g.sub, 12))
      const cx = Math.min(Math.max(x(it.col), L + w / 2 - 14), W - 8 - w / 2)
      let r = 0
      while (rows[r] !== undefined && rows[r] > cx - w / 2 - 14) r++
      rows[r] = cx + w / 2
      placed.push({ it, g, cx, r })
    }
    // row 0 sits below the lane, row 1 above it, rows 2+ further below
    const above = rows.length > 1, below = rows.length === 0 ? 0 : rows.length === 1 ? 1 : rows.length - 1
    const up = above ? 46 : 22, down = 22 + below * 40
    const res = { ln, placed, y: y + up, h: up + down }
    y += up + down
    return res
  })
  const H = y + 4

  if (css) out.push(`<style>${css}</style>`, `<rect class="d-bg" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16"/>`)
  // axis + quiet grid
  for (const a of doc.axis) {
    out.push(`<line class="d-grid" x1="${x(a.col)}" y1="${top + 12}" x2="${x(a.col)}" y2="${H - 20}" stroke-dasharray="2 5"/>`)
    out.push(`<text class="d-tick" x="${x(a.col)}" y="${top}" text-anchor="middle">${esc(a.text)}</text>`)
  }
  for (const { ln, placed, y: ly } of lanes) {
    out.push(`<text class="d-lane" x="${L - 36}" y="${ly + 4}" text-anchor="end">${esc(ln.name)}</text>`)
    for (const s of ln.segs) if (s.to > s.from) out.push(`<line class="d-line" x1="${x(s.from)}" y1="${ly}" x2="${x(s.to)}" y2="${ly}"/>`)
    for (const it of ln.items) {
      if (it.kind === 'span') {
        const g = legend(it.fill), x1 = x(it.from), x2 = x(it.to), w = x2 - x1
        out.push(`<g class="h-${g.hue}">`)
        out.push(`<rect class="d-span" x="${x1}" y="${ly - 12}" width="${w}" height="24" rx="12"/>`)
        if (it.end === 'open') out.push(`<path class="d-arrow" d="M${x2 - 16} ${ly - 5} l5 5 l-5 5 M${x2 - 10} ${ly - 5} l5 5 l-5 5"/>`)
        if (g.label && it.fill in doc.legend) {
          const fits = textW(g.label, 12) + 40 < w
          const lx = (x1 + x2) / 2 - (it.end === 'open' ? 10 : 0)
          // too short for its label: leave it unlabelled; the key below names it
          if (fits) out.push(`<text class="d-span-label" x="${lx}" y="${ly + 4.5}" text-anchor="middle">${esc(g.label)}</text>`)
        }
        out.push(`</g>`)
      } else if (it.kind === 'end') {
        out.push(`<line class="d-end" x1="${x(it.col)}" y1="${ly - 9}" x2="${x(it.col)}" y2="${ly + 9}"/>`)
      }
    }
    for (const { it, g, cx, r } of placed) {
      const px = x(it.col), ty = r === 1 ? ly - 40 : ly + 34 + Math.max(0, r - 1) * 40
      out.push(`<g class="h-${it.kind === 'cancel' && !(it.sym in doc.legend) ? 'rose' : g.hue}">`)
      if (r > 1) out.push(`<line class="d-grid" x1="${px}" y1="${ly + 14}" x2="${px}" y2="${ty - 14}"/>`)
      if (it.kind === 'cancel') {
        out.push(`<circle class="d-halo" cx="${px}" cy="${ly}" r="12"/>`)
        out.push(`<path class="d-cancel" d="M${px - 5} ${ly - 5} L${px + 5} ${ly + 5} M${px + 5} ${ly - 5} L${px - 5} ${ly + 5}"/>`)
      } else {
        out.push(`<circle class="d-halo" cx="${px}" cy="${ly}" r="13"/>`)
        out.push(`<circle class="d-dot" cx="${px}" cy="${ly}" r="6.5"/>`)
        out.push(`<circle class="d-dot-core" cx="${px}" cy="${ly}" r="2.5"/>`)
      }
      out.push(`</g>`)
      out.push(`<text class="d-label" x="${cx}" y="${ty}" text-anchor="middle">${esc(g.label)}</text>`)
      if (g.sub) out.push(`<text class="d-sub" x="${cx}" y="${ty + 17}" text-anchor="middle">${esc(g.sub)}</text>`)
    }
  }
  const title = doc.title ? `<title>${esc(doc.title)}</title>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Math.ceil(H)}" width="${W}" height="${Math.ceil(H)}" role="img" font-family="Inter, system-ui, sans-serif">${title}\n${out.join('\n')}\n</svg>`
}

// "How to read this diagram": built from the marks this diagram actually uses
export function key(doc) {
  const all = doc.lanes.flatMap(l => l.items)
  const uniq = xs => [...new Set(xs)]
  const g = s => doc.legend[s] || { label: s, sub: '', hue: 'ink' }
  const icon = body => `<svg viewBox="0 0 34 18" aria-hidden="true">${body}</svg>`
  const line = '<line class="d-line" x1="1" y1="9" x2="33" y2="9"/>'
  const dot = h => icon(`${line}<g class="h-${h}"><circle class="d-halo" cx="17" cy="9" r="8.5"/><circle class="d-dot" cx="17" cy="9" r="4.5"/><circle class="d-dot-core" cx="17" cy="9" r="1.8"/></g>`)
  const cap = h => icon(`<g class="h-${h}"><rect class="d-span" x="1" y="2" width="32" height="14" rx="7"/></g>`)
  const sub = x => x.sub ? ` — ${esc(x.sub)}` : ''
  const li = (ic, label, rest = '') => `<li>${ic}<span><b>${esc(label)}</b>${rest}</span></li>`
  const events = uniq(all.filter(i => i.kind === 'event').map(i => i.sym))
  const spans = uniq(all.filter(i => i.kind === 'span').map(i => i.fill))
  const parts = [`<p>Each row is a <b>lane</b>: the timeline of one actor (${doc.lanes.map(l => esc(l.name)).join(', ')}), read left to right.${doc.axis.length ? ' The numbers along the top mark elapsed time; the faint dotted lines let you line moments up across lanes.' : ''}</p>`]
  if (events.length) parts.push(`<p>A <b>dot</b> is a moment, something that happens at one instant:</p><ul>${events.map(s => li(dot(g(s).hue), g(s).label, sub(g(s)))).join('')}</ul>`)
  if (spans.length) parts.push(`<p>A soft <b>capsule</b> is a span, something that lasts. Its length is its duration:</p><ul>${spans.map(s => li(cap(g(s).hue), g(s).label || 'span', sub(g(s)))).join('')}</ul>`)
  const extra = []
  if (all.some(i => i.kind === 'cancel')) extra.push(li(icon(`<g class="h-${doc.legend.x ? g('x').hue : 'rose'}"><circle class="d-halo" cx="17" cy="9" r="8.5"/><path class="d-cancel" d="M13.5 5.5 L20.5 12.5 M20.5 5.5 L13.5 12.5"/></g>`), 'Cross', ' — a cancellation: the span ends here, before it ran its course.'))
  if (all.some(i => i.kind === 'span' && i.end === 'open')) extra.push(li(icon(`<g class="h-sand"><path class="d-arrow" d="M10 4 l5 5 l-5 5 M17 4 l5 5 l-5 5"/></g>`), 'Chevrons', ' — the span is still running past the right edge.'))
  if (all.some(i => i.kind === 'end')) extra.push(li(icon('<line class="d-end" x1="17" y1="2" x2="17" y2="16"/>'), 'Bar', ' — the lane ends.'))
  extra.push(li(icon('<line class="d-line" x1="1" y1="9" x2="33" y2="9"/>'), 'Thin line', ' — time passing with nothing happening. A gap in a lane means that actor is inactive.'))
  parts.push(`<ul>${extra.join('')}</ul>`)
  return `<details class="key"><summary>How to read this diagram</summary>${parts.join('\n')}</details>`
}

export function html(doc, src, css) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title || 'Timeline')}</title>
<style>${css}</style>
</head>
<body>
<main class="page">
<p class="eyebrow">idle-compact · timeline</p>
<h1>${esc(doc.title)}</h1>
${doc.caption ? `<p class="lede">${esc(doc.caption)}</p>` : ''}
<figure class="figure">${svg(doc)}</figure>
${doc.note ? `<p class="note">${esc(doc.note)}</p>` : ''}
${key(doc)}
<details class="source"><summary>ASCII source</summary><pre>${esc(src.trim())}</pre></details>
</main>
</body>
</html>
`
}

// standalone SVG keeps only tokens + svg vocabulary, so it renders on its own (e.g. inline on GitHub)
const svgCss = css => css.replace(/\/\* page \*\/[\s\S]*?\/\* svg vocabulary/, '/* svg vocabulary').replace(/\/\* "How to read[\s\S]*$/, '')

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const files = process.argv.slice(2)
  if (!files.length) { console.error('usage: node marble.mjs <file.marble>...'); process.exit(2) }
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../style/style.css'), 'utf8')
  for (const f of files) {
    const src = readFileSync(f, 'utf8'), doc = parse(src), base = f.replace(/\.marble$/, '')
    writeFileSync(base + '.html', html(doc, src, css))
    writeFileSync(base + '.svg', svg(doc, { css: svgCss(css) }) + '\n')
    console.log(`${f} -> ${base}.html, ${base}.svg`)
  }
}
