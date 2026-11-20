// tiers: an architecture drawing. Rows of boxes, top to bottom, joined by arrows.
// Usage: node docs/humans/gen/tiers.mjs docs/humans/diagrams/architecture.tiers
//
//   row  [<caption>]                               start a row; an optional caption groups it in a dashed frame
//   box  <id>  <title> — <sub>  <hue> [dashed]     a box in the current row
//   <from> -> <to>  [<label>]  [dashed]            an arrow between boxes, or to a row by its caption's first word
//   tag  <hue>  <word> — <meaning>                 a legend entry for a hue (used in the key)
import { cols, esc, header, icon, li, main, page, r, svg } from './lib.mjs'

export function parse(src) {
  const { meta, body } = header(src)
  const doc = { meta, rows: [], edges: [], tags: [] }
  for (const line of body) {
    const c = cols(line)
    if (c[0] === 'row' || c[0].startsWith('row ')) doc.rows.push({ caption: line.replace(/^row\s*/, ''), boxes: [] })
    else if (c[0] === 'box') {
      const [, id, text, style = 'ink'] = c
      const [title, sub = ''] = text.split(/\s+—\s+/)
      const [hue, dashed] = style.split(/\s+/)
      doc.rows.at(-1).boxes.push({ id, title, sub, hue, dashed: dashed === 'dashed' })
    } else if (c[0] === 'tag') {
      const [word, meaning = ''] = c[2].split(/\s+—\s+/)
      doc.tags.push({ hue: c[1], word, meaning })
    } else if (/->/.test(line)) {
      const m = line.match(/^(\S+)\s*->\s*(\S+)\s*(.*)$/)
      let label = m[3].trim(), dashed = false
      if (/\bdashed$/.test(label)) { dashed = true; label = label.replace(/\s*dashed$/, '') }
      doc.edges.push({ from: m[1], to: m[2], label, dashed })
    } else throw new Error(`tiers: cannot read "${line}"`)
  }
  return doc
}

export function layout(doc) {
  const W = 920, padX = 40, gapX = 24, top = 28, boxH = 60, rowGap = 74, groupPad = 16, capH = 22
  const nodes = {}
  let y = top
  for (const row of doc.rows) {
    const n = row.boxes.length
    const inner = W - padX * 2 - (row.caption ? groupPad * 2 : 0)
    const maxW = n === 1 ? 420 : n === 2 ? 300 : 999
    const gap = n === 2 ? 120 : gapX
    const w = Math.min(maxW, (inner - gap * (n - 1)) / n)
    const total = w * n + gap * (n - 1)
    const x0 = (W - total) / 2
    if (row.caption) y += capH
    row.y = y
    row.boxes.forEach((b, i) => { b.x = x0 + i * (w + gap); b.y = y; b.w = w; b.h = boxH; nodes[b.id] = b })
    if (row.caption) {
      row.frame = { x: x0 - groupPad, y: y - groupPad - capH, w: total + groupPad * 2, h: boxH + groupPad * 2 + capH }
      const id = row.caption.match(/^\w+/)[0]
      nodes[id] = { ...row.frame, frame: true }
      y += boxH + groupPad
    } else y += boxH
    y += rowGap
  }
  return { W, H: Math.ceil(y - rowGap + 28), nodes }
}

export function draw(doc, standalone) {
  const { W, H, nodes } = layout(doc)
  const o = []
  for (const row of doc.rows) if (row.frame) {
    const f = row.frame
    o.push(`<rect class="g-group" x="${r(f.x)}" y="${r(f.y)}" width="${r(f.w)}" height="${r(f.h)}" rx="18"/>`)
    o.push(`<text class="g-cap" x="${r(f.x + 18)}" y="${r(f.y + 22)}">${esc(row.caption)}</text>`)
  }
  for (const e of doc.edges) {
    const a = nodes[e.from], b = nodes[e.to]
    if (!a || !b) throw new Error(`tiers: unknown box in ${e.from} -> ${e.to}`)
    let d, lx, ly, head
    if (Math.abs(a.y - b.y) < 1) { // same row: side to side
      const right = a.x < b.x
      const x1 = right ? a.x + a.w : a.x, x2 = right ? b.x : b.x + b.w, yy = a.y + a.h / 2
      d = `M${r(x1 + (right ? 4 : -4))} ${r(yy)} H${r(x2 + (right ? -5 : 5))}`
      head = right ? `M${r(x2 - 11)} ${r(yy - 5)} l6 5 l-6 5` : `M${r(x2 + 11)} ${r(yy - 5)} l-6 5 l6 5`
      lx = (x1 + x2) / 2; ly = yy - 10
    } else { // down: bottom centre to top centre, a soft S-curve
      const x1 = a.x + a.w / 2, y1 = a.y + a.h + 4
      const x2 = b.x + b.w / 2, y2 = b.y - 6, m = (y1 + y2) / 2
      d = `M${r(x1)} ${r(y1)} C${r(x1)} ${r(m)} ${r(x2)} ${r(m)} ${r(x2)} ${r(y2)}`
      head = `M${r(x2 - 5)} ${r(y2 - 6)} l5 6 l5 -6`
      lx = Math.max(x1, x2) + 12; ly = m + 4
    }
    o.push(`<path class="g-edge${e.dashed ? ' dashed' : ''}" d="${d}"/><path class="g-head" d="${head}"/>`)
    if (e.label) o.push(`<text class="g-elabel" x="${r(lx)}" y="${r(ly)}"${Math.abs(a.y - b.y) < 1 ? ' text-anchor="middle"' : ''}>${esc(e.label)}</text>`)
  }
  for (const row of doc.rows) for (const b of row.boxes) {
    o.push(`<g class="h-${b.hue}"><rect class="g-box${b.dashed ? ' dashed' : ''}" x="${r(b.x)}" y="${r(b.y)}" width="${r(b.w)}" height="${b.h}" rx="12"/>`)
    const cx = r(b.x + b.w / 2)
    if (b.sub) o.push(`<text class="g-title" x="${cx}" y="${r(b.y + 26)}" text-anchor="middle">${esc(b.title)}</text><text class="g-sub" x="${cx}" y="${r(b.y + 44)}" text-anchor="middle">${esc(b.sub)}</text></g>`)
    else o.push(`<text class="g-title" x="${cx}" y="${r(b.y + b.h / 2 + 5)}" text-anchor="middle">${esc(b.title)}</text></g>`)
  }
  return svg({ W, H, title: doc.meta.title, inner: o.join('\n'), standalone })
}

export function key(doc) {
  const box = (hue, dashed) => icon(`<g class="h-${hue}"><rect class="g-box${dashed ? ' dashed' : ''}" x="2" y="2" width="30" height="14" rx="4"/></g>`)
  return `<p>Read it <b>top to bottom</b>: events come in from Claude Code at the top, decisions are made in the middle, and the bottom is where the mod touches the outside world again.</p>
<p>Each <b>box</b> is a file or a piece of one; its color says what kind of code it is:</p>
<ul>${doc.tags.map(t => li(box(t.hue), t.word, esc(t.meaning))).join('')}
${li(box('plum', true), 'Dashed box', 'a stand-in that only exists in tests.')}</ul>
<ul>${li(icon('<path class="g-edge" d="M2 9 H28"/><path class="g-head" d="M24 5 l5 4 l-5 4"/>'), 'Arrow', 'calls or hands over to; the small label says with what.')}
${li(icon('<path class="g-edge dashed" d="M2 9 H28"/><path class="g-head" d="M24 5 l5 4 l-5 4"/>'), 'Dashed arrow', 'the same call, answered by the test stand-in instead.')}
${li(icon('<rect class="g-group" x="2" y="2" width="30" height="14" rx="5"/>'), 'Dashed frame', 'boxes that live together in one file.')}</ul>`
}

export function build(src) {
  const doc = parse(src)
  return { html: page({ meta: doc.meta, figure: draw(doc, false), key: key(doc), src, kind: 'architecture' }), svg: draw(doc, true) }
}

main(import.meta.url, '.tiers', build)
