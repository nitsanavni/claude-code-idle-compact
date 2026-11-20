// states: a state diagram on a hand-placed grid (Mermaid stateDiagram, plus positions).
// Usage: node docs/humans/gen/states.mjs docs/humans/diagrams/timer.states
//
//   state  <id>  <title> — <sub>  at <col> <row>  <hue>     a state box; col/row may be fractional
//   start  <id>  at <col> <row>                              an entry point (a small filled dot)
//   <from> -> <to>  [<label>]  [dashed]  [bend <px>]         a transition; from == to draws a loop above
import { cols, esc, header, icon, li, main, page, r, svg } from './lib.mjs'

export function parse(src) {
  const { meta, body } = header(src)
  const doc = { meta, states: {}, edges: [] }
  const at = s => s.replace(/^at\s+/, '').split(/\s+/).map(Number)
  for (const line of body) {
    const c = cols(line)
    if (c[0] === 'state') {
      const [, id, text, pos, hue = 'ink'] = c
      const [title, sub = ''] = text.split(/\s+—\s+/)
      const [col, row] = at(pos)
      doc.states[id] = { id, title, sub, col, row, hue }
    } else if (c[0] === 'start') {
      const [, id, pos] = c
      const [col, row] = at(pos)
      doc.states[id] = { id, col, row, start: true }
    } else if (/->/.test(line)) {
      const m = line.match(/^(\S+)\s*->\s*(\S+)\s*(.*)$/)
      let rest = m[3].trim(), dashed = false, bend = 0
      const b = rest.match(/\s*\bbend\s+(-?\d+)$/)
      if (b) { bend = Number(b[1]); rest = rest.slice(0, b.index).trim() }
      if (/\bdashed$/.test(rest)) { dashed = true; rest = rest.replace(/\s*dashed$/, '') }
      doc.edges.push({ from: m[1], to: m[2], label: rest, dashed, bend })
    } else throw new Error(`states: cannot read "${line}"`)
  }
  return doc
}

const W = 1040, colW = 270, rowH = 140, boxW = 168, boxH = 62, padX = 112, padY = 96

export function draw(doc, standalone) {
  const S = Object.values(doc.states)
  const rows = S.map(s => s.row), minRow = Math.min(...rows), maxRow = Math.max(...rows)
  const H = Math.ceil(padY * 2 + (maxRow - minRow) * rowH)
  const pos = s => ({ x: padX + s.col * colW, y: padY + (s.row - minRow) * rowH })
  // where the line from the centre of s towards (tx, ty) leaves its box (or dot)
  const exit = (s, tx, ty) => {
    const c = pos(s), dx = tx - c.x, dy = ty - c.y
    if (s.start) { const k = 7 / Math.hypot(dx, dy); return { x: c.x + dx * k, y: c.y + dy * k } }
    const k = Math.min((boxW / 2 + 5) / Math.abs(dx || 1e-9), (boxH / 2 + 5) / Math.abs(dy || 1e-9))
    return { x: c.x + dx * k, y: c.y + dy * k }
  }
  const o = [], labels = []
  for (const e of doc.edges) {
    const a = doc.states[e.from], b = doc.states[e.to]
    if (!a || !b) throw new Error(`states: unknown state in ${e.from} -> ${e.to}`)
    const dash = e.dashed ? ' dashed' : ''
    if (a === b) { // a loop over the top of the box
      const c = pos(a), y = c.y - boxH / 2 - 4
      o.push(`<path class="g-edge${dash}" d="M${r(c.x - 34)} ${r(y)} C${r(c.x - 34)} ${r(y - 46)} ${r(c.x + 34)} ${r(y - 46)} ${r(c.x + 34)} ${r(y - 2)}"/>`)
      o.push(`<path class="g-head" d="M${r(c.x + 29)} ${r(y - 8)} l5 6 l5 -6"/>`)
      labels.push({ x: c.x, y: y - 44, text: e.label, anchor: 'middle' })
      continue
    }
    const ca = pos(a), cb = pos(b)
    const dx = cb.x - ca.x, dy = cb.y - ca.y, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len
    const ctl = { x: (ca.x + cb.x) / 2 + nx * e.bend * 2, y: (ca.y + cb.y) / 2 + ny * e.bend * 2 }
    const p1 = exit(a, ctl.x, ctl.y), p2 = exit(b, ctl.x, ctl.y)
    const hx = p2.x - ctl.x, hy = p2.y - ctl.y, hl = Math.hypot(hx, hy), ux = hx / hl, uy = hy / hl
    o.push(`<path class="g-edge${dash}" d="M${r(p1.x)} ${r(p1.y)} Q${r(ctl.x)} ${r(ctl.y)} ${r(p2.x)} ${r(p2.y)}"/>`)
    o.push(`<path class="g-head" d="M${r(p2.x - ux * 7 + uy * 5)} ${r(p2.y - uy * 7 - ux * 5)} L${r(p2.x)} ${r(p2.y)} L${r(p2.x - ux * 7 - uy * 5)} ${r(p2.y - uy * 7 + ux * 5)}"/>`)
    if (e.label) {
      // the curve's midpoint, nudged off the line to the side the curve bends to (or above a flat line)
      const mx = (p1.x + 2 * ctl.x + p2.x) / 4, my = (p1.y + 2 * ctl.y + p2.y) / 4
      const side = e.bend ? Math.sign(e.bend) : (Math.abs(dy) < 1 ? (nx * 0 + ny < 0 ? 1 : -1) : 1)
      const off = 12 * side
      const lx = mx + nx * off, ly = my + ny * off
      const flat = Math.abs(dy) < 1
      labels.push({ x: lx, y: ly + 4, text: e.label, anchor: flat ? 'middle' : (lx >= mx ? 'start' : 'end') })
    }
  }
  for (const s of S) {
    const { x, y } = pos(s)
    if (s.start) { o.push(`<circle class="g-start" cx="${r(x)}" cy="${r(y)}" r="6"/>`); continue }
    o.push(`<g class="h-${s.hue}"><rect class="g-box" x="${r(x - boxW / 2)}" y="${r(y - boxH / 2)}" width="${boxW}" height="${boxH}" rx="${boxH / 2}"/>`)
    o.push(`<text class="g-title" x="${r(x)}" y="${r(y - 3)}" text-anchor="middle">${esc(s.title)}</text>`)
    o.push(`<text class="g-sub" x="${r(x)}" y="${r(y + 15)}" text-anchor="middle">${esc(s.sub)}</text></g>`)
  }
  for (const l of labels) o.push(`<text class="g-elabel" x="${r(l.x)}" y="${r(l.y)}" text-anchor="${l.anchor}">${esc(l.text)}</text>`)
  return svg({ W, H, title: doc.meta.title, inner: o.join('\n'), standalone })
}

export function key(doc) {
  const pill = hue => icon(`<g class="h-${hue}"><rect class="g-box" x="2" y="2" width="30" height="14" rx="7"/></g>`)
  const states = Object.values(doc.states).filter(s => !s.start)
  return `<p>Each <b>pill</b> is a state the timer can be in; the mod is in exactly one of them at a time. Each <b>arrow</b> is a way to move between states, labelled with what makes it happen.</p>
<ul>${states.map(s => li(pill(s.hue), s.title, esc(s.sub))).join('')}</ul>
<ul>${li(icon('<circle class="g-start" cx="17" cy="9" r="5"/>'), 'Filled dot', 'where things begin: a session starting, or Claude calling a tool.')}
${li(icon('<path class="g-edge" d="M2 9 H28"/><path class="g-head" d="M24 5 l5 4 l-5 4"/>'), 'Arrow', 'a transition, with its trigger written next to it.')}
${li(icon('<path class="g-edge dashed" d="M2 9 H28"/><path class="g-head" d="M24 5 l5 4 l-5 4"/>'), 'Dashed arrow', 'a transition you start on purpose, not by waiting.')}
${li(icon('<path class="g-edge" d="M9 15 C9 1 25 1 25 13"/><path class="g-head" d="M21 9 l4 5 l4 -5"/>'), 'Loop', 'the state starts over: the countdown begins again from the top.')}</ul>
<p>Only the main conversation moves the timer. Turns run by subagents neither start nor stop it.</p>`
}

export function build(src) {
  const doc = parse(src)
  return { html: page({ meta: doc.meta, figure: draw(doc, false), key: key(doc), src, kind: 'timer' }), svg: draw(doc, true) }
}

main(import.meta.url, '.states', build)
