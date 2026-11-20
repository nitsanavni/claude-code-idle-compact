// overview: the big picture. A person, a host app that frames everything else, a few parts
// inside it, and numbered steps: each step is a badge on an arrow and a sentence under the drawing.
// Single-serving: the five parts have fixed places (see PLACE); the DSL supplies words and order.
// Usage: node docs/humans/gen/overview.mjs docs/humans/diagrams/overview.parts
//
//   host   <name> — <sub>                    the app that frames the parts (all but `you`)
//   group  <name> — <sub>                    a dashed frame around the part `mod`
//   part   <id>  <title> — <sub>  <hue>      id is one of: you, talk, mod, compact
//   meter  <id>  <label>                     a fill bar inside that part (the context window)
//   step   <from> -> <to>  <sentence>        numbered in order; <-> draws both heads; from == to is a loop
//   term   <word> — <meaning>                a word the diagram uses, explained in the key
import { cols, esc, header, icon, li, main, page, r, svg } from './lib.mjs'

export function parse(src) {
  const { meta, body } = header(src)
  const doc = { meta, host: null, group: null, parts: {}, meters: {}, steps: [], terms: [] }
  const named = s => { const [name, sub = ''] = s.split(/\s+—\s+/); return { name, sub } }
  for (const line of body) {
    const [head, ...rest] = cols(line)
    if (head === 'host') doc.host = named(rest.join('  '))
    else if (head === 'group') doc.group = named(rest.join('  '))
    else if (head === 'part') { const [id, text, hue = 'ink'] = rest; doc.parts[id] = { id, ...named(text), hue } }
    else if (head === 'meter') doc.meters[rest[0]] = rest[1]
    else if (head === 'term') doc.terms.push(named(rest.join('  ')))
    else if (head === 'step') {
      const m = rest[0].match(/^(\S+)\s*(<->|->)\s*(\S+)$/)
      if (!m) throw new Error(`overview: cannot read step "${line}"`)
      doc.steps.push({ from: m[1], to: m[3], both: m[2] === '<->', text: rest.slice(1).join('  ') })
    } else throw new Error(`overview: cannot read "${line}"`)
  }
  for (const s of doc.steps) for (const id of [s.from, s.to]) if (!doc.parts[id]) throw new Error(`overview: step uses unknown part "${id}"`)
  return doc
}

const W = 920
const HOST = { x: 208, y: 28, w: 684, h: 432 }
const GROUP = { x: 584, y: 92, w: 284, h: 204 }
const PLACE = { // x, y, w, h of each part
  you:     { x: 28,  y: 188, w: 132, h: 76 },
  talk:    { x: 236, y: 158, w: 272, h: 136 },
  mod:     { x: 604, y: 176, w: 244, h: 100 },
  compact: { x: 392, y: 356, w: 320, h: 76 },
}
// the route of each arrow, by "<from>-<to>": [x1, y1, x2, y2]; from == to is a loop over the box's top right corner
const ROUTE = {
  'you-talk':     [160, 226, 236, 226],
  'talk-mod':     [508, 226, 604, 226],
  'mod-compact':  [680, 276, 680, 356],
  'compact-talk': [440, 356, 440, 294],
}

// wrap a sentence to lines of at most `n` characters
const wrap = (s, n) => s.split(' ').reduce((ls, w) => ((ls.at(-1) + ' ' + w).trim().length > n ? ls.push(w) : ls[ls.length - 1] = (ls.at(-1) + ' ' + w).trim(), ls), [''])
const badge = (x, y, n, hue) => `<g class="h-${hue}"><circle cx="${r(x)}" cy="${r(y)}" r="11" style="fill: var(--h); stroke: var(--surface); stroke-width: 3"/><text x="${r(x)}" y="${r(y + 4)}" text-anchor="middle" style="font: 700 12px var(--sans); fill: var(--on-hue)">${n}</text></g>`
const head = (x, y, dx, dy) => `<path class="g-head" d="M${r(x - dx * 7 + dy * 5)} ${r(y - dy * 7 - dx * 5)} L${x} ${y} L${r(x - dx * 7 - dy * 5)} ${r(y - dy * 7 + dx * 5)}"/>`

export function draw(doc, standalone) {
  const o = [], top = []
  // the host frame and the plugin-system frame
  o.push(`<rect x="${HOST.x}" y="${HOST.y}" width="${HOST.w}" height="${HOST.h}" rx="20" style="fill: var(--bg); stroke: var(--rule); stroke-width: 1.5"/>`)
  o.push(`<text class="g-title" x="${HOST.x + 28}" y="${HOST.y + 36}" style="font-size: 15px">${esc(doc.host.name)}</text>`)
  o.push(`<text class="g-sub" x="${HOST.x + 28}" y="${HOST.y + 55}">${esc(doc.host.sub)}</text>`)
  if (doc.group) {
    o.push(`<rect class="g-group" x="${GROUP.x}" y="${GROUP.y}" width="${GROUP.w}" height="${GROUP.h}" rx="16"/>`)
    o.push(`<text class="g-title" x="${GROUP.x + 20}" y="${GROUP.y + 26}">${esc(doc.group.name)}</text>`)
    wrap(doc.group.sub, 27).forEach((l, i) => o.push(`<text class="g-sub" x="${GROUP.x + 20}" y="${GROUP.y + 44 + i * 16}">${esc(l)}</text>`))
  }
  // arrows, each with its step number
  doc.steps.forEach((s, i) => {
    const hue = doc.parts[s.from].hue, n = i + 1
    if (s.from === s.to) {
      const p = PLACE[s.from], x = p.x + p.w - 42, y = p.y
      o.push(`<path class="g-edge" d="M${x - 26} ${y - 5} C${x - 26} ${y - 44} ${x + 26} ${y - 44} ${x + 26} ${y - 7}"/>`, head(x + 26, y - 5, 0, 1))
      top.push(badge(x, y - 34, n, hue))
      return
    }
    const rt = ROUTE[`${s.from}-${s.to}`]
    if (!rt) throw new Error(`overview: no route drawn for ${s.from} -> ${s.to}`)
    const [x1, y1, x2, y2] = rt, len = Math.hypot(x2 - x1, y2 - y1), dx = (x2 - x1) / len, dy = (y2 - y1) / len
    const a = { x: x1 + dx * 6, y: y1 + dy * 6 }, b = { x: x2 - dx * 6, y: y2 - dy * 6 }
    o.push(`<path class="g-edge" d="M${r(a.x)} ${r(a.y)} L${r(b.x)} ${r(b.y)}"/>`, head(r(b.x), r(b.y), dx, dy))
    if (s.both) o.push(head(r(a.x), r(a.y), -dx, -dy))
    top.push(badge((x1 + x2) / 2, (y1 + y2) / 2, n, hue))
  })
  // the parts
  for (const p of Object.values(doc.parts)) {
    const b = PLACE[p.id]
    if (!b) throw new Error(`overview: no place for part "${p.id}" (use ${Object.keys(PLACE).join(', ')})`)
    const meter = doc.meters[p.id], lines = wrap(p.sub, Math.floor((b.w - 32) / 6.3))
    const textH = 20 + lines.length * 17 + (meter ? 46 : 0), ty = b.y + (b.h - textH) / 2 + 15
    o.push(`<g class="h-${p.hue}"><rect class="g-box" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="14"/>`)
    if (p.id === 'you') o.push(`<circle cx="${b.x + b.w / 2}" cy="${b.y - 34}" r="11" style="fill: var(--h)"/><path d="M${b.x + b.w / 2 - 19} ${b.y - 4} a19 17 0 0 1 38 0 Z" style="fill: var(--h)"/>`)
    const cx = b.x + b.w / 2
    o.push(`<text class="g-title" x="${cx}" y="${r(ty)}" text-anchor="middle" style="font-size: 15px">${esc(p.name)}</text>`)
    lines.forEach((l, i) => o.push(`<text class="g-sub" x="${cx}" y="${r(ty + 20 + i * 17)}" text-anchor="middle">${esc(l)}</text>`))
    if (meter) {
      const my = ty + 20 + lines.length * 17 + 2, mx = b.x + 24, mw = b.w - 48
      o.push(`<rect x="${mx}" y="${r(my)}" width="${mw}" height="12" rx="6" style="fill: var(--surface); stroke: var(--h); stroke-width: 1.5"/>`)
      o.push(`<rect x="${mx}" y="${r(my)}" width="${r(mw * .72)}" height="12" rx="6" style="fill: var(--h)"/>`)
      o.push(`<text class="g-sub" x="${cx}" y="${r(my + 29)}" text-anchor="middle">${esc(meter)}</text>`)
    }
    o.push('</g>')
  }
  o.push(...top)
  // the story, one numbered sentence per step
  let y = HOST.y + HOST.h + 44
  doc.steps.forEach((s, i) => {
    const lines = wrap(s.text, 118)
    o.push(badge(40, y - 4, i + 1, doc.parts[s.from].hue))
    lines.forEach((l, k) => o.push(`<text class="g-sub" x="64" y="${y + k * 18}" style="font-size: 13.5px; fill: var(--ink)">${esc(l)}</text>`))
    y += lines.length * 18 + 16
  })
  return svg({ W, H: Math.ceil(y + 4), title: doc.meta.title, inner: o.join('\n'), standalone })
}

export function key(doc) {
  const box = hue => icon(`<g class="h-${hue}"><rect class="g-box" x="2" y="2" width="30" height="14" rx="4"/></g>`)
  return `<p>Each <b>box</b> is one of the parts. Follow the <b>numbered circles</b> in order: each one sits on an arrow in the drawing and has its sentence underneath.</p>
<ul>${Object.values(doc.parts).map(p => li(box(p.hue), p.name, esc(p.sub))).join('')}</ul>
<ul>${li(icon('<rect x="2" y="2" width="30" height="14" rx="5" style="fill: var(--bg); stroke: var(--rule); stroke-width: 1.5"/>'), 'Large shaded frame', `${esc(doc.host.name)}: everything inside it is part of the app or runs inside it.`)}
${doc.group ? li(icon('<rect class="g-group" x="2" y="2" width="30" height="14" rx="5"/>'), 'Dashed frame', `the ${esc(doc.group.name.toLowerCase())}, the part of Claude Code that ${esc(doc.group.sub)}.`) : ''}
${li(icon('<path class="g-edge" d="M2 9 H28"/><path class="g-head" d="M24 5 l5 4 l-5 4"/>'), 'Arrow', 'one part acting on, or telling something to, another. Two heads: it goes both ways.')}
${li(icon(`<g class="h-violet"><circle cx="17" cy="9" r="8" style="fill: var(--h)"/><text x="17" y="12.5" text-anchor="middle" style="font: 700 10px var(--sans); fill: var(--on-hue)">3</text></g>`), 'Numbered circle', 'a step, in the order things happen. Its color is the part that acts.')}
${li(icon('<g class="h-teal"><rect x="2" y="5" width="30" height="8" rx="4" style="fill: var(--surface); stroke: var(--h); stroke-width: 1.5"/><rect x="2" y="5" width="21" height="8" rx="4" style="fill: var(--h)"/></g>'), 'Bar', 'how full the conversation\'s context window is.')}</ul>
${doc.terms.length ? `<p>The words used here:</p><ul class="terms">${doc.terms.map(t => `<li><span><b>${esc(t.name)}</b> — ${esc(t.sub)}</span></li>`).join('')}</ul>` : ''}`
}

export function build(src, file) {
  const doc = parse(src)
  return { html: page({ meta: doc.meta, figure: draw(doc, false), key: key(doc), src, kind: 'overview', file, ext: '.parts' }), svg: draw(doc, true) }
}

main(import.meta.url, '.parts', build)
