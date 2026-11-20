// zones: a yes/no table of who compacts where, over a threshold plot.
// In the plot, each zone is the corner region where both thresholds hold.
// Usage: node docs/humans/gen/zones.mjs docs/humans/diagrams/why.zones
//
//   x  <label>  <min> <max>  every <step>  unit <suffix>     x axis (suffix appended to ticks)
//   y  <label>  <min> <max>  every <step>  unit k            y axis (unit k: ticks in thousands)
//   zone  <x> <y>  <hue> [dashed]  <name> — <sub>           region x >= X and y >= Y
//   where  <question>  <col>  <col>                         the table above the plot: its question and column heads
//   runs   <who>  <hue>  <yes|no> — <detail>  ...           one table row, one cell per column
//   gap    <text>                                           a note pointing from the first "no" cell to the cell below it
//   plot   <heading>                                        heading over the plot
//   term   <word> — <meaning>                               a word the diagram uses, explained in the key
import { cols, esc, header, icon, li, main, page, r, svg } from './lib.mjs'

export function parse(src) {
  const { meta, body } = header(src)
  const doc = { meta, axes: {}, zones: [], where: null, runs: [], gap: '', plot: '', terms: [] }
  for (const line of body) {
    const [head, ...rest] = cols(line)
    if (head === 'x' || head === 'y') {
      const [label, range, every, unit] = rest
      const [min, max] = range.split(/\s+/).map(Number)
      doc.axes[head] = { label, min, max, step: Number(every.replace('every', '')), unit: (unit || '').replace(/^unit\s*/, '') }
    } else if (head === 'zone') {
      const [at, style, text] = rest
      const [x, y] = at.split(/\s+/).map(Number)
      const [hue, dashed] = style.split(/\s+/)
      const [name, sub = ''] = text.split(/\s+—\s+/)
      doc.zones.push({ x, y, hue, dashed: dashed === 'dashed', name, sub })
    } else if (head === 'where') doc.where = { question: rest[0], cols: rest.slice(1) }
    else if (head === 'runs') {
      const [who, hue, ...cells] = rest
      doc.runs.push({ who, hue, cells: cells.map(c => { const [v, detail = ''] = c.split(/\s+—\s+/); return { yes: v === 'yes', detail } }) })
    } else if (head === 'gap') doc.gap = rest.join('  ')
    else if (head === 'plot') doc.plot = rest.join('  ')
    else if (head === 'term') { const [word, meaning = ''] = rest.join('  ').split(/\s+—\s+/); doc.terms.push({ word, meaning }) }
    else throw new Error(`zones: cannot read "${line}"`)
  }
  return doc
}

const tick = (v, unit) => unit === 'k' ? (v === 0 ? '0' : `${v / 1000}k`) : `${v}${unit}`

const yes = (x, y) => `<circle cx="${x}" cy="${y}" r="11" style="fill: var(--h)"/><path d="M${x - 5} ${y} l3.5 3.5 l6.5 -7" style="fill: none; stroke: var(--on-hue); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round"/>`
const no = (x, y) => `<circle cx="${x}" cy="${y}" r="11" style="fill: var(--h)"/><path d="M${x - 4} ${y - 4} l8 8 M${x + 4} ${y - 4} l-8 8" style="fill: none; stroke: var(--on-hue); stroke-width: 2; stroke-linecap: round"/>`

// the table: who compacts an idle conversation, per kind of session. A "no" cell is the point, so it is drawn loud.
function table(doc, W) {
  const o = [], padX = 40, nameW = 190, gapX = 16, cellH = 60, rowGap = doc.gap ? 44 : 16, top = 76
  const n = doc.where.cols.length, cellW = (W - padX * 2 - nameW - gapX * (n - 1)) / n
  const cx = i => padX + nameW + i * (cellW + gapX), ry = j => top + j * (cellH + rowGap)
  o.push(`<text class="g-cap" x="${padX}" y="38">${esc(doc.where.question)}</text>`)
  doc.where.cols.forEach((c, i) => o.push(`<text class="g-title" x="${r(cx(i) + 4)}" y="${top - 12}">${esc(c)}</text>`))
  let gapAt = null
  doc.runs.forEach((row, j) => {
    o.push(`<text class="g-title" x="${padX}" y="${ry(j) + cellH / 2 + 5}" style="font-size: 14px">${esc(row.who)}</text>`)
    row.cells.forEach((c, i) => {
      const hue = c.yes ? row.hue : 'coral', x = cx(i), y = ry(j)
      if (!c.yes && !gapAt) gapAt = { i, j }
      o.push(`<g class="h-${hue}"><rect class="g-box" x="${r(x)}" y="${y}" width="${r(cellW)}" height="${cellH}" rx="12"${c.yes ? '' : ' style="stroke-width: 2.5"'}/>`)
      o.push((c.yes ? yes : no)(r(x + 28), y + cellH / 2))
      o.push(`<text class="g-title" x="${r(x + 50)}" y="${y + cellH / 2 - 4}" style="font-size: 14px">${c.yes ? 'Yes' : 'No'}</text>`)
      o.push(`<text class="g-sub" x="${r(x + 50)}" y="${y + cellH / 2 + 14}">${esc(c.detail)}</text></g>`)
    })
  })
  if (doc.gap && gapAt && gapAt.j + 1 < doc.runs.length) {
    const x = r(cx(gapAt.i) + 28), y1 = ry(gapAt.j) + cellH + 7, y2 = ry(gapAt.j + 1) - 7
    o.push(`<g class="h-coral"><path class="g-edge-h" d="M${x} ${y1} V${y2}"/><path class="g-edge-h" d="M${x - 5} ${y2 - 6} L${x} ${y2} L${x + 5} ${y2 - 6}"/>`)
    o.push(`<text class="g-title" x="${r(x + 22)}" y="${(y1 + y2) / 2 + 4.5}" style="fill: var(--h)">${esc(doc.gap)}</text></g>`)
  }
  const bottom = ry(doc.runs.length - 1) + cellH
  return { svg: o.join('\n'), bottom }
}

export function draw(doc, standalone) {
  const tbl = doc.where ? table(doc, 920) : null
  const OY = tbl ? tbl.bottom + 36 + (doc.plot ? 34 : 0) : 0
  const W = 920, H = 500 + OY, L = 96, R = 40, T = 36 + OY, B = 72
  const { x: X, y: Y } = doc.axes
  const px = v => L + (v - X.min) / (X.max - X.min) * (W - L - R)
  const py = v => H - B - (v - Y.min) / (Y.max - Y.min) * (H - T - B)
  const o = []
  if (tbl) {
    o.push(tbl.svg, `<line class="g-rule" x1="40" y1="${tbl.bottom + 36}" x2="${W - 40}" y2="${tbl.bottom + 36}"/>`)
    if (doc.plot) o.push(`<text class="g-cap" x="40" y="${OY + 8}">${esc(doc.plot)}</text>`)
  }
  for (let v = X.min; v <= X.max; v += X.step) {
    o.push(`<line class="d-grid" x1="${r(px(v))}" y1="${T}" x2="${r(px(v))}" y2="${H - B}" stroke-dasharray="2 5"/>`)
    o.push(`<text class="d-tick" x="${r(px(v))}" y="${H - B + 22}" text-anchor="middle">${tick(v, X.unit)}</text>`)
  }
  for (let v = Y.min; v <= Y.max; v += Y.step) {
    o.push(`<line class="d-grid" x1="${L}" y1="${r(py(v))}" x2="${W - R}" y2="${r(py(v))}" stroke-dasharray="2 5"/>`)
    o.push(`<text class="d-tick" x="${L - 14}" y="${r(py(v)) + 4}" text-anchor="end">${tick(v, Y.unit)}</text>`)
  }
  o.push(`<text class="g-cap" x="${(L + W - R) / 2}" y="${H - 22}" text-anchor="middle">${esc(X.label)} →</text>`)
  o.push(`<text class="g-cap" transform="translate(28 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle">${esc(Y.label)} →</text>`)
  for (const z of doc.zones) {
    const x0 = px(z.x), y0 = py(z.y), x1 = W - R, y1 = T
    o.push(`<g class="h-${z.hue}">`)
    o.push(`<rect class="g-zone${z.dashed ? ' dashed' : ''}" x="${r(x0)}" y="${y1}" width="${r(x1 - x0)}" height="${r(y0 - y1)}"/>`)
    o.push(`<path class="g-edge-h"${z.dashed ? ' stroke-dasharray="5 5"' : ''} d="M${r(x0)} ${y1} V${r(y0)} H${x1}"/>`)
    o.push(`<circle class="d-halo" cx="${r(x0)}" cy="${r(y0)}" r="12"/><circle class="d-dot" cx="${r(x0)}" cy="${r(y0)}" r="6"/><circle class="d-dot-core" cx="${r(x0)}" cy="${r(y0)}" r="2.4"/>`)
    o.push(`<text class="d-sub" x="${r(x0) - 12}" y="${r(y0) + 22}" text-anchor="end">${tick(z.x, X.unit)} · ${tick(z.y, Y.unit)}</text>`)
    o.push(`<text class="g-title" x="${r(x0) + 18}" y="${y1 + 30}">${esc(z.name)}</text>`)
    z.sub.split(/\s*\\n\s*/).forEach((s, i) => o.push(`<text class="g-sub" x="${r(x0) + 18}" y="${y1 + 50 + i * 17}">${esc(s)}</text>`))
    o.push('</g>')
  }
  o.push(`<line class="g-axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>`)
  o.push(`<line class="g-axis" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/>`)
  const hues = [...new Set(doc.zones.filter(z => z.dashed).map(z => z.hue))]
  const defs = hues.map(h => `<pattern id="hatch" class="h-${h}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" style="fill: var(--t)"/><line class="g-hatch" x1="0" y1="0" x2="0" y2="8"/></pattern>`).join('')
  return svg({ W, H, title: doc.meta.title, inner: o.join('\n'), standalone, defs })
}

export function key(doc) {
  const zone = z => icon(`<g class="h-${z.hue}"><rect class="g-zone" x="1" y="1" width="32" height="16" rx="3" ${z.dashed ? 'fill-opacity=".55"' : ''}/><path class="g-edge-h"${z.dashed ? ' stroke-dasharray="3 3"' : ''} d="M2 1 V17 H33"/></g>`)
  const cell = (hue, mark) => icon(`<g class="h-${hue}" transform="translate(6 -2) scale(.8)">${mark(14, 13.5)}</g>`)
  const tbl = doc.where ? `<p>The <b>table</b> on top is the reason idle-compact exists. Each row is a setup, each column is where Claude Code runs, and each cell answers: does a conversation that has sat idle get compacted?</p>
<ul>${li(cell('green', yes), 'Yes', 'idle conversations are compacted here, once they are idle long enough and big enough.')}
${li(cell('coral', no), 'No', 'nothing compacts an idle conversation here. This is the gap idle-compact fills.')}</ul>` : ''
  const terms = doc.terms.length ? `<p>The words used here:</p><ul class="terms">${doc.terms.map(t => `<li><span><b>${esc(t.word)}</b> — ${esc(t.meaning)}</span></li>`).join('')}</ul>` : ''
  return `${tbl}<p>The <b>plot</b> asks: <b>after how long, and at what size</b>, does an idle conversation get compacted? Left to right is how long nobody has typed; bottom to top is how big the conversation is, counted in tokens.</p>
<p>Each shaded <b>corner</b> is where a compactor acts: both of its thresholds are met, so the region opens up and to the right of its dot.</p>
<ul>${doc.zones.map(z => li(zone(z), z.name, esc(z.sub.replace(/\\n/g, ' ')))).join('')}
<li>${icon('<g class="h-ink"><circle class="d-halo" cx="17" cy="9" r="8"/><circle class="d-dot" cx="17" cy="9" r="4.5"/><circle class="d-dot-core" cx="17" cy="9" r="1.8"/></g>')}<span><b>Dot</b> — the corner itself: its time and token thresholds, written beside it.</span></li>
<li>${icon('<g class="h-mute"><path class="g-edge-h" stroke-dasharray="3 3" d="M1 9 H33"/></g>')}<span><b>Dashed and hatched</b> — Claude Code's own idle compaction: it exists, but only on your computer, not in the cloud.</span></li></ul>
<p>A conversation that stays idle drifts right. If it is big enough to sit inside a shaded corner when its time comes, it gets compacted.</p>${terms}`
}

export function build(src, file) {
  const doc = parse(src)
  return { html: page({ meta: doc.meta, figure: draw(doc, false), key: key(doc), src, kind: 'why', file, ext: '.zones' }), svg: draw(doc, true) }
}

main(import.meta.url, '.zones', build)
