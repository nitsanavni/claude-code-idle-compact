// story: a storyboard. A row of numbered scenes over a graph of one quantity (the context size),
// which forks at one scene into what happens with the mod and what happens without it.
// Usage: node docs/humans/gen/story.mjs docs/humans/diagrams/story.scenes
//
//   scene  <icon>  <hue>  <from>-<to>  <title> — <text>    a scene; from/to: the graph's height at its start and end, in percent.
//                                                          icons: cloud, grow, away, ask, done, compact, back
//   graph    <name> — <what it means>                      what the graph measures (the name is drawn; both go in the key)
//   away     <first> <last>  <label>                       the scenes (1-based) during which the person is away
//   with     <label>                                       label of the line after the drop
//   without  <label>                                       label of the dashed line that does not drop (starts at the biggest drop)
//   also     <hue>  <title> — <text>                       a side note in a box under the graph
//   term     <word> — <meaning>                            a word the diagram uses, explained in the key
import { cols, esc, header, icon, li, main, page, r, svg } from './lib.mjs'

export function parse(src) {
  const { meta, body } = header(src)
  const doc = { meta, scenes: [], graph: '', away: null, with: '', without: '', also: null, terms: [] }
  for (const line of body) {
    const [head, ...rest] = cols(line)
    if (head === 'scene') {
      const [ic, hue, size, text] = rest
      const [from, to] = size.split('-').map(Number), [title, sub = ''] = text.split(/\s+—\s+/)
      doc.scenes.push({ icon: ic, hue, from, to, title, sub })
    } else if (head === 'away') { const [range, label = ''] = rest; const [a, b] = range.split(/\s+/).map(Number); doc.away = { a, b, label } }
    else if (head === 'graph' || head === 'with' || head === 'without') doc[head] = rest.join('  ')
    else if (head === 'also') { const [title, text = ''] = rest.slice(1).join('  ').split(/\s+—\s+/); doc.also = { hue: rest[0], title, text } }
    else if (head === 'term') { const [word, meaning = ''] = rest.join('  ').split(/\s+—\s+/); doc.terms.push({ word, meaning }) }
    else throw new Error(`story: cannot read "${line}"`)
  }
  return doc
}

const wrap = (s, n) => s.split(' ').reduce((ls, w) => ((ls.at(-1) + ' ' + w).trim().length > n ? ls.push(w) : ls[ls.length - 1] = (ls.at(-1) + ' ' + w).trim(), ls), [''])

// 44px pictograms, drawn around (0, 0) in the scene's hue
const ICONS = {
  // a person under a cloud
  cloud: `<path d="M-13 -5 a7 7 0 0 1 6.5 -9 a9 9 0 0 1 17 2 a6 6 0 0 1 2 11.5 h-24 a5 5 0 0 1 -1.5 -4.500 Z" transform="translate(1 -3)" style="fill: var(--h)"/><circle cx="0" cy="8" r="4" style="fill: var(--h)"/><path d="M-8 20 a8 7 0 0 1 16 0 Z" style="fill: var(--h)"/>`,
  // bars growing
  grow: [[-15, 8], [-5, 16], [5, 24], [15, 32]].map(([x, h]) => `<rect x="${x - 3.5}" y="${16 - h}" width="7" height="${h}" rx="2" style="fill: var(--h)"/>`).join(''),
  // a crescent moon
  away: `<path d="M5 -15 a15 15 0 1 0 11 24 a12 12 0 0 1 -11 -24 Z" style="fill: var(--h)"/><circle cx="12" cy="-10" r="1.8" style="fill: var(--h)"/><circle cx="17" cy="-1" r="1.2" style="fill: var(--h)"/>`,
  // a tall stack squeezed into a short one
  compact: `${[-14, -8, -2, 4, 10].map(y => `<rect x="-17" y="${y}" width="14" height="4" rx="1.5" style="fill: var(--h); opacity: .45"/>`).join('')}<path d="M0 0 h7 m-4 -4 l4 4 l-4 4" style="fill: none; stroke: var(--h); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round"/><rect x="10" y="-2" width="9" height="4" rx="1.5" style="fill: var(--h)"/>`,
  // a speech bubble: someone asks
  ask: `<path d="M-15 -13 h30 a4 4 0 0 1 4 4 v14 a4 4 0 0 1 -4 4 h-18 l-8 8 v-8 h-4 a4 4 0 0 1 -4 -4 v-14 a4 4 0 0 1 4 -4 Z" style="fill: var(--h)"/><path d="M-9 -5 h18 M-9 2 h11" style="stroke: var(--t); stroke-width: 2.5; stroke-linecap: round"/>`,
  // a tick: done
  done: `<circle cx="0" cy="0" r="16" style="fill: var(--h)"/><path d="M-7 0 l5 5 l9 -10" style="fill: none; stroke: var(--t); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round"/>`,
  // a person, back
  back: `<circle cx="0" cy="-7" r="7" style="fill: var(--h)"/><path d="M-13 15 a13 12 0 0 1 26 0 Z" style="fill: var(--h)"/>`,
}

const W = 920, padX = 32, gTop = 252, gH = 132

export function draw(doc, standalone) {
  const n = doc.scenes.length, colW = (W - padX * 2) / n
  const x0 = i => padX + colW * i, cx = i => x0(i) + colW / 2
  const gy = pct => gTop + gH * (1 - pct / 100)
  const o = []
  // scenes
  const subs = doc.scenes.map(s => wrap(s.sub, 25)), titles = doc.scenes.map(s => wrap(s.title, 21))
  doc.scenes.forEach((s, i) => {
    const x = cx(i)
    o.push(`<g class="h-${s.hue}"><circle cx="${r(x)}" cy="56" r="30" style="fill: var(--t)"/><g transform="translate(${r(x)} 56)">${ICONS[s.icon] || ''}</g>`)
    o.push(`<circle cx="${r(x - 26)}" cy="32" r="10" style="fill: var(--h); stroke: var(--surface); stroke-width: 3"/><text x="${r(x - 26)}" y="36" text-anchor="middle" style="font: 700 11px var(--sans); fill: var(--on-hue)">${i + 1}</text></g>`)
    if (i) o.push(`<path class="g-head" d="M${r(x0(i) - 4)} 51 l5 5 l-5 5"/>`)
    titles[i].forEach((l, k) => o.push(`<text class="g-title" x="${r(x)}" y="${112 + k * 17}" text-anchor="middle" style="font-size: 14px">${esc(l)}</text>`))
    const sy = 112 + titles[i].length * 17 + 3
    subs[i].forEach((l, k) => o.push(`<text class="g-sub" x="${r(x)}" y="${sy + k * 16}" text-anchor="middle">${esc(l)}</text>`))
  })
  // the graph: "you are away" band, the curve, and the fork
  if (doc.away) {
    const a = x0(doc.away.a - 1), b = x0(doc.away.b)
    o.push(`<rect x="${r(a)}" y="${gTop - 26}" width="${r(b - a)}" height="${gH + 26}" rx="10" style="fill: var(--bg)"/>`)
    o.push(`<text class="g-cap" x="${r((a + b) / 2)}" y="${gTop - 9}" text-anchor="middle">${esc(doc.away.label)}</text>`)
  }
  o.push(`<text class="g-cap" x="${padX}" y="${gTop - 9}">${esc(doc.graph.split(/\s+—\s+/)[0])}</text>`)
  // curve points: each scene eases from its start to its end; a big drop is a quick S in the middle of the scene
  const drop = doc.scenes.reduce((m, s, i) => s.from - s.to > (m.d || 0) ? { i, d: s.from - s.to } : m, {})
  const seg = (s, i) => {
    const a = x0(i), b = x0(i + 1), m = (a + b) / 2
    return i === drop.i
      ? `H${r(m - 14)} C${r(m)} ${r(gy(s.from))} ${r(m)} ${r(gy(s.to))} ${r(m + 14)} ${r(gy(s.to))} H${r(b)}`
      : `C${r(m)} ${r(gy(s.from))} ${r(m)} ${r(gy(s.to))} ${r(b)} ${r(gy(s.to))}`
  }
  const base = gTop + gH, dx = drop.i === undefined ? W : cx(drop.i)
  const line = `M${padX} ${r(gy(doc.scenes[0].from))} ` + doc.scenes.map(seg).join(' ')
  const area = `${line} V${base} H${padX} Z`
  o.push(`<clipPath id="before"><rect x="0" y="0" width="${r(dx)}" height="${base + 2}"/></clipPath><clipPath id="after"><rect x="${r(dx)}" y="0" width="${W}" height="${base + 2}"/></clipPath>`)
  o.push(`<g class="h-teal" clip-path="url(#before)"><path d="${area}" style="fill: var(--t)"/><path d="${line}" style="fill: none; stroke: var(--h); stroke-width: 2.5"/></g>`)
  o.push(`<g class="h-green" clip-path="url(#after)"><path d="${area}" style="fill: var(--t)"/><path d="${line}" style="fill: none; stroke: var(--h); stroke-width: 2.5"/></g>`)
  if (drop.i !== undefined) {
    const s = doc.scenes[drop.i], hy = gy(s.from), end = W - padX
    // without the mod: the line stays up, dashed, to a marker where the person returns
    o.push(`<g class="h-coral"><path d="M${r(dx)} ${r(hy)} H${end - 8}" style="fill: none; stroke: var(--h); stroke-width: 2.5; stroke-dasharray: 2 7; stroke-linecap: round"/>`)
    o.push(`<circle cx="${end - 8}" cy="${r(hy)}" r="6" style="fill: var(--h); stroke: var(--surface); stroke-width: 3"/>`)
    wrap(doc.without, 40).forEach((l, k) => o.push(`<text class="g-sub" x="${end}" y="${r(hy + 22 + k * 15)}" text-anchor="end" style="fill: var(--h); font-weight: 500">${esc(l)}</text>`))
    o.push(`</g><g class="h-green"><circle cx="${end - 8}" cy="${r(gy(doc.scenes.at(-1).to))}" r="6" style="fill: var(--h); stroke: var(--surface); stroke-width: 3"/>`)
    o.push(`<text class="g-title" x="${end - 22}" y="${r(gy(doc.scenes.at(-1).to) - 12)}" text-anchor="end" style="fill: var(--h)">${esc(doc.with)}</text></g>`)
  }
  o.push(`<line class="g-axis" x1="${padX}" y1="${base}" x2="${W - padX}" y2="${base}"/>`)
  let H = base + 28
  if (doc.also) {
    // the side note: a tinted box with a small mark, a title and a couple of lines
    const lines = wrap(doc.also.text, 122), y = base + 24, h = 40 + lines.length * 17
    o.push(`<g class="h-${doc.also.hue}"><rect x="${padX}" y="${y}" width="${W - padX * 2}" height="${h}" rx="14" style="fill: var(--t)"/>`)
    o.push(`<circle cx="${padX + 32}" cy="${y + h / 2}" r="15" style="fill: var(--h)"/><path d="M${padX + 25} ${y + h / 2} h14 m-7 -7 v14" style="stroke: var(--on-hue); stroke-width: 2.5; stroke-linecap: round"/></g>`)
    o.push(`<text class="g-title" x="${padX + 62}" y="${y + 25}" style="font-size: 14px">${esc(doc.also.title)}</text>`)
    lines.forEach((l, k) => o.push(`<text class="g-sub" x="${padX + 62}" y="${y + 44 + k * 17}">${esc(l)}</text>`))
    H = y + h + 24
  }
  return svg({ W, H, title: doc.meta.title, inner: o.join('\n'), standalone })
}

export function key(doc) {
  const sw = (hue, body) => icon(`<g class="h-${hue}">${body}</g>`)
  return `<p>Read the <b>scenes</b> left to right; they are numbered in the order things happen. The <b>graph</b> underneath follows one thing through the story: ${esc(doc.graph.charAt(0).toLowerCase() + doc.graph.slice(1).replace(/\s+—\s+/, ', which is '))}. Higher means more to read, so slower and more expensive.</p>
<ul>${doc.scenes.map((s, i) => li(sw(s.hue, `<circle cx="17" cy="9" r="8" style="fill: var(--h)"/><text x="17" y="12.500" text-anchor="middle" style="font: 700 10px var(--sans); fill: var(--on-hue)">${i + 1}</text>`), s.title, esc(s.sub))).join('')}</ul>
<ul>${li(sw('teal', `<path d="M2 14 C12 14 18 4 32 4 V17 H2 Z" style="fill: var(--t)"/><path d="M2 14 C12 14 18 4 32 4" style="fill: none; stroke: var(--h); stroke-width: 2"/>`), 'Rising line', 'the conversation growing as you work.')}
${li(sw('green', `<path d="M2 4 H12 C17 4 17 14 22 14 H32 V17 H2 Z" style="fill: var(--t)"/><path d="M2 4 H12 C17 4 17 14 22 14 H32" style="fill: none; stroke: var(--h); stroke-width: 2"/>`), 'The drop', `the compaction. From here the line is green: the story ${esc(doc.with)}.`)}
${li(sw('coral', `<path d="M2 9 H26" style="fill: none; stroke: var(--h); stroke-width: 2; stroke-dasharray: 2 6; stroke-linecap: round"/><circle cx="29" cy="9" r="4" style="fill: var(--h)"/>`), 'Dotted line', `what would happen ${esc(doc.without)}.`)}
${doc.away ? li(icon('<rect x="2" y="2" width="30" height="14" rx="4" style="fill: var(--bg); stroke: var(--rule)"/>'), 'Shaded band', `the stretch of the story in which ${esc(doc.away.label)}.`) : ''}
${doc.also ? li(sw(doc.also.hue, '<rect x="2" y="2" width="30" height="14" rx="5" style="fill: var(--t)"/><circle cx="10" cy="9" r="4" style="fill: var(--h)"/>'), 'Tinted box', `an extra that is not part of the timeline: ${esc(doc.also.title.charAt(0).toLowerCase() + doc.also.title.slice(1))}.`) : ''}</ul>
${doc.terms.length ? `<p>The words used here:</p><ul class="terms">${doc.terms.map(t => `<li><span><b>${esc(t.word)}</b> — ${esc(t.meaning)}</span></li>`).join('')}</ul>` : ''}`
}

export function build(src, file) {
  const doc = parse(src)
  return { html: page({ meta: doc.meta, figure: draw(doc, false), key: key(doc), src, kind: 'the story', file, ext: '.scenes' }), svg: draw(doc, true) }
}

main(import.meta.url, '.scenes', build)
