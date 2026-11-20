// layers: config layers merged field by field. Each column takes its value from the
// lowest row that sets it, and the bottom row shows what is in effect.
// Usage: node docs/humans/gen/layers.mjs docs/humans/diagrams/config.layers
//
//   fields  <a>  <b>  ...                          column names (2+ spaces apart)
//   layer  <name> — <sub>  <hue>  <v>  <v>  ...    one row; "." = this layer leaves it unset
//   result  <name> — <sub>                         the merged row, drawn last
import { cols, esc, header, icon, li, main, page, r, svg } from './lib.mjs'

export function parse(src) {
  const { meta, body } = header(src)
  const doc = { meta, fields: [], layers: [], result: null }
  for (const line of body) {
    const [head, ...rest] = cols(line)
    const named = s => { const [name, sub = ''] = s.split(/\s+—\s+/); return { name, sub } }
    if (head === 'fields') doc.fields = rest
    else if (head === 'layer') {
      const [label, hue, ...values] = rest
      if (values.length !== doc.fields.length) throw new Error(`layers: "${label}" has ${values.length} values for ${doc.fields.length} fields`)
      doc.layers.push({ ...named(label), hue, values: values.map(v => v === '.' ? null : v) })
    } else if (head === 'result') doc.result = named(rest[0])
    else throw new Error(`layers: cannot read "${line}"`)
  }
  return doc
}

/** For each field, the index of the last layer that sets it. */
export const winners = doc => doc.fields.map((_, i) => doc.layers.reduce((w, l, j) => l.values[i] === null ? w : j, -1))

export function draw(doc, standalone) {
  const W = 920, nameW = 196, padX = 28, top = 56, rowH = 64, gap = 30
  const colW = (W - padX * 2 - nameW) / doc.fields.length
  const cx = i => padX + nameW + colW * i + colW / 2
  const rowY = j => top + rowH * j + rowH / 2
  const resY = rowY(doc.layers.length) + gap
  const H = Math.ceil(resY + rowH / 2 + 34)
  const win = winners(doc)
  const pillW = v => Math.min(colW - 6, Math.max(56, v.length * 7.3 + 26))
  const pill = (x, y, v, hue, strong) =>
    `<g class="h-${hue}"><rect class="${strong ? 'd-span' : 'g-box'}" x="${r(x - pillW(v) / 2)}" y="${y - 14}" width="${r(pillW(v))}" height="28" rx="14"${strong ? '' : ' style="fill: var(--surface)"'}/>` +
    `<text class="g-mono" x="${r(x)}" y="${y + 4.5}" text-anchor="middle"${strong ? '' : ' style="fill: var(--ink-2)"'}>${esc(v)}</text></g>`
  const o = []
  doc.fields.forEach((f, i) => o.push(`<text class="g-mono" x="${r(cx(i))}" y="${top - 18}" text-anchor="middle" style="fill: var(--ink-2)">${esc(f)}</text>`))
  o.push(`<text class="g-cap" x="${padX}" y="${top - 18}">Lower rows win ↓</text>`)
  doc.layers.forEach((l, j) => {
    if (j) o.push(`<line class="g-rule" x1="${padX}" y1="${top + rowH * j}" x2="${W - padX}" y2="${top + rowH * j}"/>`)
    o.push(`<g class="h-${l.hue}"><circle class="d-dot-core" cx="${padX + 6}" cy="${rowY(j)}" r="4"/></g>`)
    o.push(`<text class="g-title" x="${padX + 22}" y="${rowY(j) - 3}">${esc(l.name)}</text>`)
    o.push(`<text class="g-sub" x="${padX + 22}" y="${rowY(j) + 15}">${esc(l.sub)}</text>`)
  })
  // the fall-through: from each column's winning cell straight down to the result
  doc.fields.forEach((_, i) => {
    const j = win[i], h = doc.layers[j].hue
    o.push(`<g class="h-${h}"><line class="g-edge-h" x1="${r(cx(i))}" y1="${rowY(j) + 14}" x2="${r(cx(i))}" y2="${resY - 14}" style="stroke-width: 1.5; stroke-opacity: .5"/></g>`)
  })
  doc.layers.forEach((l, j) => l.values.forEach((v, i) => {
    if (v === null) o.push(`<circle class="g-unset" cx="${r(cx(i))}" cy="${rowY(j)}" r="2.2"/>`)
    else o.push(pill(cx(i), rowY(j), v, l.hue, win[i] === j))
  }))
  const ry = resY - rowH / 2
  o.push(`<rect x="${padX - 12}" y="${ry}" width="${W - padX * 2 + 24}" height="${rowH}" rx="12" style="fill: var(--bg); stroke: var(--rule)"/>`)
  if (doc.result) {
    o.push(`<text class="g-title" x="${padX + 22}" y="${resY - 3}">${esc(doc.result.name)}</text>`)
    o.push(`<text class="g-sub" x="${padX + 22}" y="${resY + 15}">${esc(doc.result.sub)}</text>`)
    o.push(`<path class="g-head" d="M${padX + 2} ${resY - 5} l4 5 l4 -5" style="stroke: var(--ink)"/>`)
  }
  doc.fields.forEach((_, i) => o.push(pill(cx(i), resY, doc.layers[win[i]].values[i], doc.layers[win[i]].hue, true)))
  return svg({ W, H, title: doc.meta.title, inner: o.join('\n'), standalone })
}

export function key(doc) {
  const p = (hue, strong) => icon(`<g class="h-${hue}"><rect class="${strong ? 'd-span' : 'g-box'}" x="2" y="2" width="30" height="14" rx="7"${strong ? '' : ' style="fill: var(--surface)"'}/></g>`)
  return `<p>Each <b>row</b> is a place a setting can come from, in order: a row overrides every row above it. Each <b>column</b> is one setting. The shaded band at the bottom is what the mod actually uses.</p>
<p>The color of a row says where a value came from:</p>
<ul>${doc.layers.map(l => li(icon(`<g class="h-${l.hue}"><circle class="d-dot-core" cx="17" cy="9" r="4"/></g>`), l.name, esc(l.sub))).join('')}</ul>
<ul>${li(p('sand', true), 'Filled pill', 'the value that wins for this setting: no row below it sets the same setting.')}
${li(p('sand', false), 'Outlined pill', 'a value this row sets, overridden by a row further down.')}
${li(icon('<circle class="g-unset" cx="17" cy="9" r="2.2"/>'), 'Faint dot', 'this row leaves the setting alone, so it falls through to the rows above.')}
${li(icon('<g class="h-sand"><line class="g-edge-h" x1="17" y1="1" x2="17" y2="17" style="stroke-width: 1.5; stroke-opacity: .5"/></g>'), 'Thread', 'carries the winning value down to the result.')}</ul>
<p>Merging happens <b>per setting</b>, not per row: a project file that sets only <code>idleSeconds</code> changes nothing else.</p>`
}

export function build(src, file) {
  const doc = parse(src)
  return { html: page({ meta: doc.meta, figure: draw(doc, false), key: key(doc), src, kind: 'configuration', file, ext: '.layers' }), svg: draw(doc, true) }
}

main(import.meta.url, '.layers', build)
