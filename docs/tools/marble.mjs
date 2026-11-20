#!/usr/bin/env node
// marble.mjs: ASCII marble diagram (the DSL) -> calm HTML + standalone SVG.
// Zero dependencies. Usage: node docs/tools/marble.mjs <in.marble>... (writes <in>.html and <in>.svg next to each)
//
// Source format (see docs/tools/README.md):
//   # comment                      ignored
//   title: / caption: / note:      page text
//   focus: <sym>                   the one moment that matters most: its first marble gets a halo
//   break: <label>                 label for the next time break, left to right (optional)
//   term: <word> — <meaning>       a word the diagram uses, explained in "How to read this diagram" (repeatable)
//   time     0    5    10          axis: each label sits at its column
//   lane     -a---[====b---x   |   one lane per line; lane name, 2+ spaces, marbles
//   legend                         then lines:  <sym>  <label[ — sub]>  [hue]
// Marbles: '-' time passes, ' ' lane idle, '|' lane ends, '[' opens a span,
//   '=' or '~' span fill, ']' closes, 'x' cancels (closes a span), '>' span runs on,
//   any other char is an event; an event closes an open span, and opens one if fill follows.
//   '≈' is a time break: a column of it, aligned across lanes, skips ahead (time is compressed there).
// Columns are instants: all lanes share one origin (the leftmost marble column).

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nav, selfPath, REPO } from '../style/nav.mjs'

const FILL = new Set(['=', '~'])
export const BREAK = '≈'
// fixed roles: blue = user, violet = timer, green = compact fired, coral = cancel, amber = warning/threshold, teal = system
// (sky, sage, sand, rose, plum are older names for blue, green, amber, coral, violet)
const HUES = new Set(['blue', 'violet', 'green', 'coral', 'amber', 'teal', 'ink', 'mute', 'sky', 'sage', 'sand', 'rose', 'plum'])

export function parse(src) {
  const doc = { title: '', caption: '', note: '', focus: '', axis: [], lanes: [], legend: {}, cols: 0, breaks: [], terms: [] }
  const labels = []
  const raw = [] // [{name, start, line}] before origin is known
  let mode = 'lanes'
  for (const line of src.split('\n').map(l => l.replace(/\s+$/, ''))) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const tm = line.match(/^term:\s*(.+?)\s+—\s+(.*)$/)
    if (tm) { doc.terms.push({ word: tm[1], meaning: tm[2] }); continue }
    const br = line.match(/^break:\s*(.*)$/)
    if (br) { labels.push(br[1]); continue }
    const kv = line.match(/^(title|caption|note|focus):\s*(.*)$/)
    if (kv) { doc[kv[1]] = doc[kv[1]] ? doc[kv[1]] + ' ' + kv[2] : kv[2]; continue }
    if (/^legend:?$/.test(line.trim())) { mode = 'legend'; continue }
    if (mode === 'legend') {
      const m = line.trim().match(/^(\S)\s{2,}(.+?)(?:\s{2,}(\w+))?$/)
      if (!m) throw new Error(`bad legend line: ${line}`)
      const [label, sub = ''] = m[2].split(/\s+—\s+/)
      const hue = m[3] || 'ink'
      if (!HUES.has(hue)) throw new Error(`unknown hue "${hue}" (use ${[...HUES].join(', ')})`)
      doc.legend[m[1]] = { label, sub, hue, glyph: /^\w$/.test(m[1]) ? m[1] : '' }
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
      for (const t of cells.matchAll(/\S+/g)) if (t[0] !== BREAK) doc.axis.push({ col: t.index, text: t[0] })
    } else doc.lanes.push({ name: r.name, ...lane(cells) })
  }
  // a break is a column, so every lane must agree: '≈' or idle (' ') there, nothing else
  const cols = [...new Set(raw.flatMap(r => [...r.line.slice(origin)].flatMap((c, i) => c === BREAK ? [i] : [])))].sort((a, b) => a - b)
  for (const r of raw) for (const col of cols) {
    const c = r.line.slice(origin)[col]
    if (c !== undefined && c !== ' ' && c !== BREAK) throw new Error(`time break at column ${col} is not aligned: lane "${r.name}" has "${c}" there`)
  }
  if (labels.length > cols.length) throw new Error(`${labels.length} break: labels but only ${cols.length} time breaks`)
  doc.breaks = cols.map((col, i) => ({ col, label: labels[i] || '' }))
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
    if (c === '-' || c === BREAK || (span && FILL.has(c))) continue
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
const textW = (s, px, k = 0.58) => s.length * px * k // close enough for Inter at small sizes
const n1 = v => +v.toFixed(1)
const sentence = s => s.charAt(0).toUpperCase() + s.slice(1)
const glyph = g => (g.glyph ?? '')

// a 20px pill from x1 to x2 on the lane at y; flat ends where cut (by a cancel)
const pill = (x1, x2, y, flatR = false) => {
  const r = 10, w = x2 - x1
  if (!flatR) return `<rect class="d-span lv1" x="${n1(x1)}" y="${y - r}" width="${n1(w)}" height="${2 * r}" rx="${r}"/>`
  return `<path class="d-span lv1" d="M${n1(x2)} ${y - r} H${n1(x1 + r)} A${r} ${r} 0 0 0 ${n1(x1 + r)} ${y + r} H${n1(x2)} Z"/>`
}
const marble = (cx, cy, g, r = 9) => `<circle class="d-dot" cx="${n1(cx)}" cy="${cy}" r="${r}"/>` +
  (glyph(g) ? `<text class="d-glyph lv1" x="${n1(cx)}" y="${cy + 3.6}" text-anchor="middle">${esc(glyph(g))}</text>` : '')
const cross = (cx, cy, s = 5) => `<path class="d-cancel" d="M${n1(cx - s)} ${cy - s} L${n1(cx + s)} ${cy + s} M${n1(cx + s)} ${cy - s} L${n1(cx - s)} ${cy + s}"/>`

// the hue a lane is drawn in: the most common hue among its marks
function laneHue(ln, g) {
  const n = {}
  for (const it of ln.items) if (it.kind === 'event' || it.kind === 'span') { const h = g(it.kind === 'span' ? it.fill : it.sym).hue; n[h] = (n[h] || 0) + 1 }
  return Object.keys(n).sort((a, b) => n[b] - n[a])[0] || 'mute'
}

// the diagram's lead hue (the eyebrow): its focus marble, else its first event
export function leadHue(doc) {
  const g = s => doc.legend[s] || { hue: 'ink' }
  if (doc.focus) return g(doc.focus).hue
  const first = doc.lanes.flatMap(l => l.items).filter(i => i.kind === 'event').sort((a, b) => a.col - b.col)[0]
  return first ? g(first.sym).hue : 'ink'
}

// Detail levels: 0 = schematic, no words at all (lanes and beads; a span is a bolder stretch of line), 1 = + lane names and marble letters,
// 2 = + names and the time axis, 3 = + the detail under each name. Level 0 shares level 1's geometry.
// The SVG is drawn at level 3. Each lane is a group placed by a transform, and carries its place at every
// level as CSS variables (--y1 --y2 --y3); marks that only show from a level up are classed lv1 / lv2 / lv3.
// A page can then step between levels with CSS alone (see "detail levels" in style.css); on its own the SVG is level 3.
export function geometry(doc) {
  const W = 920, M = 24, L = M + 120, R = M + 16
  // time breaks compress the axis: the steps into and out of a break column get a fixed small width
  const brk = new Set(doc.breaks.map(b => b.col)), GAP = 14
  const narrow = i => brk.has(i) || brk.has(i + 1)
  const steps = Math.max(1, doc.cols - 1)
  const nNarrow = [...Array(steps).keys()].filter(narrow).length
  const cell = (W - L - R - nNarrow * GAP) / Math.max(1, steps - nNarrow)
  const xs = [L]
  for (let i = 0; i < steps; i++) xs.push(xs[i] + (narrow(i) ? GAP : cell))
  const x = col => xs[Math.min(Math.max(0, col), xs.length - 1)]
  const legend = s => doc.legend[s] || { label: s, sub: '', hue: 'ink' }
  // a break label shares the tick row unless it would touch a tick; then it gets a row of its own above
  const clash = doc.breaks.some(b => b.label && doc.axis.some(a => Math.abs(x(a.col) - x(b.col)) < (textW(b.label, 11) + textW(a.text, 11)) / 2 + 12))
  const top = M + 12 + (clash ? 18 : 0), labelY = clash ? top - 18 : top
  const lanes = doc.lanes.map(ln => {
    // stagger event labels into rows so none collide
    const rows = [], placed = []
    for (const it of ln.items.filter(i => i.kind === 'event' || i.kind === 'cancel').sort((a, b) => a.col - b.col)) {
      const g = legend(it.sym)
      const w = Math.max(textW(g.label, 13, 0.6), textW(g.sub, 12))
      const cx = Math.min(Math.max(x(it.col), L + w / 2 - 14), W - M - w / 2)
      let r = 0
      while (rows[r] !== undefined && rows[r] > cx - w / 2 - 16) r++
      rows[r] = cx + w / 2
      placed.push({ it, g, cx, r })
    }
    return { ln, placed, rows: rows.length, hue: laneHue(ln, legend) }
  })
  // row 0 of labels sits below the lane, row 1 above it, rows 2+ further below. Level 2 has no sub-lines, so it packs tighter.
  const level = lv => {
    const pitch = lv === 3 ? 40 : 24
    let y = lv === 1 ? M - 4 : top + 14
    const ys = lanes.map(l => {
      const above = l.rows > 1, below = l.rows === 0 ? 0 : l.rows === 1 ? 1 : l.rows - 1
      const up = lv === 1 ? 24 : above ? (lv === 3 ? 54 : 40) : 28
      const down = lv === 1 ? 24 : below ? (lv === 3 ? 56 : 42) + (below - 1) * pitch : 28
      const ly = y + up
      y += up + down
      return ly
    })
    return { ys, H: Math.ceil(y + M - 12), labelDy: r => r === 1 ? (lv === 3 ? -40 : -24) : 31 + Math.max(0, r - 1) * pitch }
  }
  return { W, M, L, x, legend, top, labelY, lanes, levels: [null, level(1), level(2), level(3)] }
}

export function svg(doc, { css = '' } = {}) {
  const { W, M, L, x, legend, top, labelY, lanes, levels } = geometry(doc)
  const [, g1, g2, g3] = levels, H = g3.H
  const out = []
  const vars = (k, f) => `--${k}1:${f(g1)}px;--${k}2:${f(g2)}px;--${k}3:${f(g3)}px`

  // marbles appear in time order (only animates where motion is welcome)
  const marks = doc.lanes.flatMap(l => l.items).filter(i => i.kind === 'event' || i.kind === 'cancel')
  const order = new Map([...marks].sort((a, b) => a.col - b.col).map((it, i) => [it, i]))
  let focused = false

  if (css) out.push(`<style>${css}</style>`, `<rect class="d-bg" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16"/>`)
  // axis + light grid (level 2 up); the grid lines shrink with the figure at level 2
  const gridS = n1((g2.H - M - top - 10) / (H - M - top - 10))
  for (const a of doc.axis) {
    out.push(`<line class="d-grid d-stretch lv2" style="--s2:${gridS}" x1="${n1(x(a.col))}" y1="${top + 10}" x2="${n1(x(a.col))}" y2="${H - M}"/>`)
    out.push(`<text class="d-tick lv2" x="${n1(x(a.col))}" y="${top}" text-anchor="middle">${esc(a.text)}</text>`)
  }
  for (const b of doc.breaks) if (b.label) out.push(`<text class="d-break-label lv2" x="${n1(x(b.col))}" y="${labelY}" text-anchor="middle">${esc(b.label)}</text>`)
  lanes.forEach(({ ln, placed, hue }, li) => {
    const ly = 0, front = []
    out.push(`<g class="d-lane-g" transform="translate(0 ${g3.ys[li]})" style="${vars('y', g => g.ys[li])}">`)
    const name = sentence(ln.name), nx = L - 24
    out.push(`<g class="h-${hue}"><rect class="d-lane-bar" x="${n1(nx - textW(name, 12, 0.6) - 11)}" y="${ly - 7}" width="3" height="14" rx="1.5"/></g>`)
    out.push(`<text class="d-lane lv1" x="${nx}" y="${ly + 4}" text-anchor="end">${esc(name)}</text>`)
    for (const s of ln.segs) if (s.to > s.from) out.push(`<line class="d-line" x1="${n1(x(s.from))}" y1="${ly}" x2="${n1(x(s.to))}" y2="${ly}"/>`)
    for (const it of ln.items) {
      if (it.kind === 'span') {
        const g = legend(it.fill), x1 = x(it.from), x2 = it.end === 'cancel' ? x(it.to) - 11 : x(it.to)
        // at level 0 a span is only a bolder stretch of the lane line; from level 1 it is a filled pill
        out.push(`<g class="h-${g.hue}">`, `<line class="d-bold" x1="${n1(x1)}" y1="${ly}" x2="${n1(x2)}" y2="${ly}"/>`, pill(x1, x2, ly, it.end === 'cancel'))
        if (it.end === 'open') out.push(`<path class="d-arrow lv1" d="M${n1(x2 - 15)} ${ly - 5} Q${n1(x2 - 12)} ${ly} ${n1(x2 - 15)} ${ly + 5} L${n1(x2 - 7)} ${ly} Z"/>`)
        if (g.label && it.fill in doc.legend) {
          // a span cut by time breaks: label its widest piece
          const cuts = doc.breaks.map(b => b.col).filter(c => c > it.from && c < it.to)
          const pieces = [...cuts, it.to].map((c, i) => [i ? x(cuts[i - 1]) + 4 : x1, c === it.to ? x2 : x(c) - 4])
          const [p1, p2] = pieces.reduce((m, p) => p[1] - p[0] > m[1] - m[0] ? p : m)
          const shift = it.end === 'open' && p2 === x2 ? 10 : 0
          // too short for its label: leave it unlabelled; the legend names it
          if (textW(g.label, 12, 0.6) + 32 + shift < p2 - p1) out.push(`<text class="d-span-label lv2" x="${n1((p1 + p2) / 2 - shift)}" y="${ly + 4}" text-anchor="middle">${esc(g.label)}</text>`)
        }
        out.push(`</g>`)
      } else if (it.kind === 'end') {
        out.push(`<line class="d-end" x1="${n1(x(it.col))}" y1="${ly - 7}" x2="${n1(x(it.col))}" y2="${ly + 7}"/>`)
      }
    }
    // time breaks: an 8px gap cut through the lane, with a slanted // in it
    for (const b of doc.breaks) {
      if (!ln.segs.some(s => s.from <= b.col && s.to >= b.col)) continue
      const bx = n1(x(b.col))
      out.push(`<g class="d-break"><rect class="d-break-gap" x="${bx - 4}" y="${ly - 12}" width="8" height="24"/>`)
      out.push(`<path class="d-break-mark" d="M${n1(bx - 5.5)} ${ly + 6} L${n1(bx - 0.5)} ${ly - 6} M${n1(bx + 0.5)} ${ly + 6} L${n1(bx + 5.5)} ${ly - 6}"/></g>`)
    }
    for (const { it, g, cx, r } of placed) {
      const px = x(it.col), ty = g3.labelDy(r)
      // a label two or more rows down gets a leader line back to its marble
      if (r > 1) out.push(`<line class="d-grid d-stretch lv2" style="--s2:${n1((g2.labelDy(r) - 28) / (ty - 28))}" x1="${n1(px)}" y1="14" x2="${n1(px)}" y2="${ty - 14}"/>`)
      front.push(`<g class="d-mark h-${g.hue}" style="--i:${order.get(it)}">`)
      if (it.kind === 'cancel') front.push(cross(px, ly))
      else {
        if (doc.focus === it.sym && !focused) { focused = true; front.push(`<circle class="d-halo lv2" cx="${n1(px)}" cy="${ly}" r="16"/>`) }
        front.push(marble(px, ly, g))
      }
      front.push(`</g>`)
      front.push(`<g class="d-lab lv2" transform="translate(0 ${ty})" style="--y2:${g2.labelDy(r)}px;--y3:${ty}px">`)
      front.push(`<text class="d-label lv2" x="${n1(cx)}" y="0" text-anchor="middle">${esc(g.label)}</text>`)
      if (g.sub) front.push(`<text class="d-sub lv3" x="${n1(cx)}" y="16" text-anchor="middle">${esc(g.sub)}</text>`)
      front.push(`</g>`)
    }
    out.push(...front, `</g>`)
  })
  const title = doc.title ? `<title>${esc(doc.title)}</title>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" font-family="Inter, system-ui, sans-serif">${title}\n${out.join('\n')}\n</svg>`
}

// mini marks, shared by the legend row (18px tall) and the key
const mini = {
  dot: (h, g = '') => `<svg viewBox="0 0 18 18" aria-hidden="true"><g class="h-${h}">${marble(9, 9, { glyph: g }, 8)}</g></svg>`,
  span: h => `<svg viewBox="0 0 30 18" aria-hidden="true"><g class="h-${h}"><rect class="d-span" x="1" y="3" width="28" height="12" rx="6"/></g></svg>`,
  cancel: () => `<svg viewBox="0 0 18 18" aria-hidden="true">${cross(9, 9, 4.5)}</svg>`,
  brk: () => `<svg viewBox="0 0 30 18" aria-hidden="true"><line class="d-line" x1="2" y1="9" x2="10" y2="9"/><line class="d-line" x1="20" y1="9" x2="28" y2="9"/><path class="d-break-mark" d="M10 14 L14 4 M16 14 L20 4"/></svg>`,
  end: () => `<svg viewBox="0 0 18 18" aria-hidden="true"><line class="d-line" x1="2" y1="9" x2="9" y2="9"/><line class="d-end" x1="9" y1="3" x2="9" y2="15"/></svg>`,
  open: h => `<svg viewBox="0 0 30 18" aria-hidden="true"><g class="h-${h}"><path class="d-span" d="M1 9 a6 6 0 0 1 6 -6 H29 V15 H7 a6 6 0 0 1 -6 -6 Z" style="stroke:none"/><path class="d-arrow" d="M19 5 Q21.5 9 19 13 L26 9 Z"/></g></svg>`,
}

function used(doc) {
  const all = doc.lanes.flatMap(l => l.items)
  const syms = new Set(all.flatMap(i => i.kind === 'event' ? [i.sym] : i.kind === 'span' ? [i.fill] : []))
  const legendOrder = Object.keys(doc.legend).filter(s => syms.has(s))
  return { all, entries: [...legendOrder, ...[...syms].filter(s => !legendOrder.includes(s))] }
}

// the always-visible legend row under the figure: one mini mark per thing drawn
export function legendRow(doc) {
  const { all, entries } = used(doc)
  const g = s => doc.legend[s] || { label: s, sub: '', hue: 'ink' }
  const spans = new Set(all.filter(i => i.kind === 'span').map(i => i.fill))
  const li = (ic, text) => `<li>${ic}<span>${esc(text)}</span></li>`
  const items = entries.map(s => li(spans.has(s) ? mini.span(g(s).hue) : mini.dot(g(s).hue, g(s).glyph), g(s).label || 'span'))
  if (all.some(i => i.kind === 'cancel')) items.push(li(mini.cancel(), doc.legend.x ? g('x').label : 'cancelled'))
  if (doc.breaks.length) items.push(li(mini.brk(), 'time break'))
  if (all.some(i => i.kind === 'end')) items.push(li(mini.end(), 'lane ends'))
  return `<ul class="legend">${items.join('')}</ul>`
}

// "How to read this diagram": built from the marks this diagram actually uses
export function key(doc) {
  const { all } = used(doc)
  const uniq = xs => [...new Set(xs)]
  const g = s => doc.legend[s] || { label: s, sub: '', hue: 'ink' }
  const sub = x => x.sub ? ` — ${esc(x.sub)}` : ''
  const li = (ic, label, rest = '') => `<li>${ic}<span><b>${esc(label)}</b>${rest}</span></li>`
  const events = uniq(all.filter(i => i.kind === 'event').map(i => i.sym))
  const spans = uniq(all.filter(i => i.kind === 'span').map(i => i.fill))
  const parts = [`<p>Each row is a <b>lane</b>: the timeline of one actor (${doc.lanes.map(l => esc(sentence(l.name))).join(', ')}), read left to right.${doc.axis.length ? ' The numbers along the top mark elapsed time; the faint vertical lines let you line moments up across lanes.' : ''}</p>`]
  if (events.length) parts.push(`<p>A <b>marble</b> (a round dot) is a moment, something that happens at one instant. Each marble carries a letter; this is what the letters stand for:</p><ul>${events.map(s => li(mini.dot(g(s).hue, g(s).glyph), g(s).label, sub(g(s)))).join('')}</ul>`)
  if (spans.length) parts.push(`<p>A <b>pill</b> is a span, something that lasts. Its length is its duration:</p><ul>${spans.map(s => li(mini.span(g(s).hue), g(s).label || 'span', sub(g(s)))).join('')}</ul>`)
  const extra = []
  if (all.some(i => i.kind === 'cancel')) extra.push(li(mini.cancel(), 'Cross', ' — a cancellation: the span is cut off here, before it ran its course.'))
  if (all.some(i => i.kind === 'span' && i.end === 'open')) extra.push(li(mini.open('violet'), 'Arrowhead', ' — the span is still running past the right edge.'))
  if (doc.breaks.length) {
    const said = [...new Set(doc.breaks.map(b => b.label).filter(Boolean))]
    extra.push(li(mini.brk(), 'Time break', ` — the timeline skips ahead here${said.length ? ` (${said.map(esc).join(', ')})` : ''}; time is not to scale across it, so a span that crosses it lasts longer than it looks.`))
  }
  if (all.some(i => i.kind === 'end')) extra.push(li(mini.end(), 'Bar', ' — the lane ends.'))
  extra.push(li('<svg viewBox="0 0 34 18" aria-hidden="true"><line class="d-line" x1="1" y1="9" x2="33" y2="9"/></svg>', 'Thin line', ' — time passing with nothing happening. A gap in a lane means that actor is inactive.'))
  parts.push(`<ul>${extra.join('')}</ul>`)
  parts.push(`<p>The <b>Detail</b> buttons above the figure show less or more: <b>Schematic</b> is the bare picture with no words, where something that lasts is just a bolder stretch of its lane, <b>Simple</b> adds the lane names and a letter in each marble, <b>More</b> adds each marble's name and the time scale, and <b>Full</b> adds a line of detail under each name.</p>`)
  if (doc.terms.length) parts.push(`<p>The words used here:</p><ul class="terms">${doc.terms.map(t => `<li><span><b>${esc(t.word)}</b> — ${esc(t.meaning)}</span></li>`).join('')}</ul>`)
  return `<details class="key"><summary>How to read this diagram</summary>${parts.join('\n')}</details>`
}

// the control that steps between detail levels: three radios, wired to the figure by CSS alone
export const LEVELS = [['Schematic', 'no words: just lanes and beads'], ['Simple', 'adds lane names, a letter in each marble, and spans as bars'], ['More', 'adds names and the time scale'], ['Full', 'adds a line of detail under each name']]
const levelControl = (start = 0) => `<fieldset class="levels"><legend>Detail</legend>${LEVELS.map(([name, what], i) =>
  `<label title="${esc(sentence(what))}"><input type="radio" name="lv" id="lv${i}"${i === start ? ' checked' : ''}>${name}</label>`).join('')}</fieldset>`

export function html(doc, src, css, file = '') {
  const { levels } = geometry(doc)
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
<p class="eyebrow h-${leadHue(doc)}"><a href="${REPO}#readme">idle-compact</a> · timeline</p>
<h1>${esc(doc.title)}</h1>
${doc.caption ? `<p class="lede">${esc(doc.caption)}</p>` : ''}
${levelControl()}
<figure class="figure"><div class="d-stage" style="--h1:${levels[1].H};--h2:${levels[2].H};--h3:${levels[3].H}">${svg(doc)}</div></figure>
${legendRow(doc)}
${doc.note ? `<p class="note">${esc(doc.note)}</p>` : ''}
${key(doc)}
<details class="source"><summary>ASCII source</summary><pre>${esc(src.trim())}</pre></details>
${file ? nav(selfPath(file), '.marble') : ''}
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
    writeFileSync(base + '.html', html(doc, src, css, f))
    writeFileSync(base + '.svg', svg(doc, { css: svgCss(css) }) + '\n')
    console.log(`${f} -> ${base}.html, ${base}.svg`)
  }
}
