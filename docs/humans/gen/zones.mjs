// zones: a threshold plot. Each zone is the corner region where both thresholds hold.
// Usage: node docs/humans/gen/zones.mjs docs/humans/diagrams/why.zones
//
//   x  <label>  <min> <max>  every <step>  unit <suffix>     x axis (suffix appended to ticks)
//   y  <label>  <min> <max>  every <step>  unit k            y axis (unit k: ticks in thousands)
//   zone  <x> <y>  <hue> [dashed]  <name> — <sub>           region x >= X and y >= Y
import { cols, esc, header, icon, li, main, page, r, svg } from './lib.mjs'

export function parse(src) {
  const { meta, body } = header(src)
  const doc = { meta, axes: {}, zones: [] }
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
    } else throw new Error(`zones: cannot read "${line}"`)
  }
  return doc
}

const tick = (v, unit) => unit === 'k' ? (v === 0 ? '0' : `${v / 1000}k`) : `${v}${unit}`

export function draw(doc, standalone) {
  const W = 920, H = 500, L = 96, R = 40, T = 36, B = 72
  const { x: X, y: Y } = doc.axes
  const px = v => L + (v - X.min) / (X.max - X.min) * (W - L - R)
  const py = v => H - B - (v - Y.min) / (Y.max - Y.min) * (H - T - B)
  const o = []
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
  return `<p>The plot asks one question: <b>after how long, and at what size</b>, does an idle conversation get compacted? Left to right is how long nobody has typed; bottom to top is how big the context is.</p>
<p>Each shaded <b>corner</b> is where a compactor acts: both of its thresholds are met, so the region opens up and to the right of its dot.</p>
<ul>${doc.zones.map(z => li(zone(z), z.name, esc(z.sub.replace(/\\n/g, ' ')))).join('')}
<li>${icon('<g class="h-ink"><circle class="d-halo" cx="17" cy="9" r="8"/><circle class="d-dot" cx="17" cy="9" r="4.5"/><circle class="d-dot-core" cx="17" cy="9" r="1.8"/></g>')}<span><b>Dot</b> — the corner itself: its time and token thresholds, written beside it.</span></li>
<li>${icon('<g class="h-mute"><path class="g-edge-h" stroke-dasharray="3 3" d="M1 9 H33"/></g>')}<span><b>Dashed and hatched</b> — a compactor that exists but does not run here (in cloud sessions).</span></li></ul>
<p>A conversation that stays idle drifts right. If it is big enough to sit inside a shaded corner when its time comes, it gets compacted.</p>`
}

export function build(src, file) {
  const doc = parse(src)
  return { html: page({ meta: doc.meta, figure: draw(doc, false), key: key(doc), src, kind: 'why', file, ext: '.zones' }), svg: draw(doc, true) }
}

main(import.meta.url, '.zones', build)
