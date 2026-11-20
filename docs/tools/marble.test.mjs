import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, lane, svg, geometry, legendRow, key, html, PARTS, PRESETS, viewToHash, hashToView } from './marble.mjs'

test('events, spans closed by an event, cancels and run-on spans', () => {
  const { items, segs } = lane('-a=b--[==x  [==>')
  const k = items.map(i => i.kind === 'span' ? `${i.fill}${i.from}-${i.to}:${i.end}` : `${i.sym}@${i.col}`)
  assert.deepEqual(k, ['a@1', '=1-3:close', 'b@3', '=6-9:cancel', 'x@9', '=12-15:open'])
  assert.deepEqual(segs, [{ from: 0, to: 9 }, { from: 12, to: 15 }])
})

test('shared origin, axis, directives and legend', () => {
  const doc = parse(`# comment
title: T
caption: one
caption: two
time        0    5m
claude   -S~E---|
timer       [====F

legend
S  turn.start  plum
F  fires — after 5m  sand`)
  assert.equal(doc.title, 'T')
  assert.equal(doc.caption, 'one two')
  assert.deepEqual(doc.axis, [{ col: 3, text: '0' }, { col: 8, text: '5m' }])
  assert.deepEqual(doc.lanes.map(l => l.name), ['claude', 'timer'])
  assert.deepEqual(doc.lanes[1].items[0], { kind: 'span', fill: '=', from: 3, to: 8, end: 'close' })
  assert.deepEqual(doc.lanes[0].items.at(-1), { kind: 'end', col: 7 })
  assert.deepEqual(doc.legend.F, { label: 'fires', sub: 'after 5m', hue: 'sand', glyph: 'F' })
  assert.match(svg(doc), /^<svg[^>]+viewBox/)
})

test('rejects unknown hues', () => {
  assert.throws(() => parse('a  -x-\nlegend\nx  boom  neon'), /unknown hue/)
})

test('time breaks: an aligned ≈ column, labels in order, spans run through it', () => {
  const doc = parse(`break: +10 min
time     0  ≈  20m
claude   -E-≈--C-
timer     [=≈=F

legend
=  timer  sand`)
  assert.deepEqual(doc.breaks, [{ col: 3, label: '+10 min' }])
  assert.deepEqual(doc.axis.map(a => a.text), ['0', '20m'])
  assert.deepEqual(doc.lanes[1].items[0], { kind: 'span', fill: '=', from: 1, to: 5, end: 'close' })
  assert.deepEqual(doc.lanes[0].segs, [{ from: 0, to: 7 }])
  assert.match(svg(doc), /d-break-mark/)
  assert.throws(() => parse('a  -≈-\nb  -x-'), /time break at column 1 is not aligned: lane "b"/)
  assert.throws(() => parse('break: one\nbreak: two\na  -≈-'), /2 break: labels but only 1/)
})

const DOC = `title: T
term: Turn — one round of the conversation
time        0    5m
claude   -S~E----
timer       [====F

legend
S  sent — you ask  blue
E  done — the countdown starts  teal
=  countdown  violet
F  time is up  violet`

test('legend and key show each marble with its letter', () => {
  const doc = parse(DOC)
  for (const part of [legendRow(doc), key(doc)]) {
    for (const letter of ['S', 'E', 'F']) assert.match(part, new RegExp(`class="d-glyph p-letters"[^>]*>${letter}<`))
  }
  assert.match(key(doc), /<b>done<\/b> — the countdown starts/)
})

test('term: lines are explained in the key', () => {
  const doc = parse(DOC)
  assert.deepEqual(doc.terms, [{ word: 'Turn', meaning: 'one round of the conversation' }])
  assert.match(key(doc), /<b>Turn<\/b> — one round of the conversation/)
})

test('layouts: tighter as parts go, and each lane carries its place in every one', () => {
  const doc = parse(DOC)
  const g = geometry(doc), [l0, l1, l2, l3] = g.levels
  assert.ok(g.text.H <= l0.H && l0.H < l1.H && l1.H < l2.H && l2.H < l3.H, `${g.text.H} ${l0.H} ${l1.H} ${l2.H} ${l3.H}`)
  assert.ok(l0.ys[1] - l0.ys[0] < l1.ys[1] - l1.ys[0]) // beads only: lanes packed tighter than with bars
  assert.ok(l2.ys[0] - l1.ys[0] < g.room)              // the axis is not part of a layout: it adds `room` on top
  const out = svg(doc)
  // the SVG is drawn in full: a lane's transform is its place in the loosest layout, under the axis
  assert.ok(out.includes(`<g class="d-lane-g" transform="translate(0 ${l3.ys[0] + g.room})" style="--yt:${g.text.ys[0]}px;--y0:${l0.ys[0]}px;--y1:${l1.ys[0]}px;--y2:${l2.ys[0]}px;--y3:${l3.ys[0]}px">`))
  assert.match(out, new RegExp(`viewBox="0 0 920 ${l3.H + g.room}"`))
})

test('every mark that can be switched off belongs to a part', () => {
  const out = svg(parse(DOC))
  for (const [cls, part] of [['d-lab', 'names'], ['d-sub', 'details'], ['d-tick', 'axis'], ['d-lane', 'lanes'], ['d-glyph', 'letters'], ['d-span', 'bars'], ['d-ascii-name', 'lanes'], ['d-span-label', 'names p-bars']])
    assert.match(out, new RegExp(`class="${cls} p-${part}"`), `${cls} is part ${part}`)
  assert.match(out, /class="d-grid d-stretch p-grid" style="--s0:[\d.]+;--s1:[\d.]+;--s2:[\d.]+"/)
  assert.match(out, /class="h-\w+ p-ticks"><rect class="d-lane-bar"/)
  assert.doesNotMatch(out, /class="d-dot[^"]*p-/) // marbles always show
  // every word on the drawing can be switched off: by its own part, or inside a names label
  const loose = [...out.matchAll(/<text class="([^"]+)"/g)].map(m => m[1]).filter(c => !/\bp-\w+/.test(c))
  assert.deepEqual([...new Set(loose)].sort(), ['d-ascii', 'd-label'])
  // a span is a filled bar (part bars), and a bold stretch of the lane line with the same ends when bars are off
  const bar = out.match(/<rect class="d-span p-bars" x="([\d.]+)" y="-10" width="([\d.]+)"/)
  const bold = [...out.matchAll(/<line class="d-bold" x1="([\d.]+)" y1="0" x2="([\d.]+)" y2="0"\/>/g)]
  assert.equal(bold.length, 2)
  assert.ok(bold.some(b => b[1] === bar[1] && Math.abs(+b[2] - (+bar[1] + +bar[2])) < 0.2))
})

test('presets: five, each adding to the one before; text and schematic keep lane names and no other words', () => {
  const names = Object.keys(PRESETS), all = PARTS.map(p => p[0])
  assert.deepEqual(names, ['text', 'schematic', 'simple', 'more', 'full'])
  names.slice(1).forEach((n, i) => assert.ok(PRESETS[names[i]].every(p => PRESETS[n].includes(p)), `${n} keeps ${names[i]}`))
  assert.deepEqual(PRESETS.text, ['lanes'])
  assert.deepEqual(PRESETS.schematic, ['lanes', 'drawn', 'ticks'])
  assert.deepEqual([...PRESETS.full].sort(), [...all].sort())
})

test('the view in the URL: a preset, plus the parts that differ from it', () => {
  const all = PARTS.map(p => p[0])
  assert.equal(viewToHash(PRESETS.schematic, PRESETS), 'level=schematic')
  assert.equal(viewToHash([...PRESETS.schematic, 'grid'], PRESETS), 'level=schematic&parts=grid')
  assert.equal(viewToHash(PRESETS.full.filter(p => p !== 'grid'), PRESETS), 'level=full&parts=-grid')
  assert.deepEqual(hashToView('#level=schematic&parts=grid,-ticks', PRESETS, all), ['drawn', 'lanes', 'grid'])
  assert.deepEqual(hashToView('#parts=drawn,bars', PRESETS, all), ['drawn', 'bars'])
  assert.equal(hashToView('', PRESETS, all), null)
  for (const view of [[], ['drawn'], ['drawn', 'names', 'note'], PRESETS.more]) // any view survives the round trip
    assert.deepEqual(hashToView('#' + viewToHash(view, PRESETS), PRESETS, all), all.filter(p => view.includes(p)))
})

test('the page has five presets and a switch per part, and opens at the text preset', () => {
  const page = html(parse(DOC), DOC, '')
  assert.deepEqual([...page.matchAll(/<button type="button" data-level="(\w+)" aria-pressed="(\w+)"/g)].map(m => m[1] + ':' + m[2]), ['text:true', 'schematic:false', 'simple:false', 'more:false', 'full:false'])
  assert.deepEqual([...page.matchAll(/<input type="checkbox" id="p-(\w+)"( checked)?>/g)].map(m => m[1] + (m[2] ? '*' : '')), PARTS.map(p => p[0] + (p[0] === 'lanes' ? '*' : '')))
  assert.match(page, /class="d-stage" style="--ht:\d+;--h0:\d+;--h1:\d+;--h2:\d+;--h3:\d+;--room:\d+;--tshift:[\d.]+%"/)
  assert.match(page, /function viewToHash/)
  assert.match(page, /How to read this diagram/)
})

test('text level: each lane as a row of the source with the words removed', () => {
  const doc = parse(`break: +10 min
time     0     ≈  20m
claude   -S~E--≈-----
timer       [==≈=x [>

legend
S  sent  blue
=  countdown  violet`)
  const out = svg(doc)
  const rows = [...out.matchAll(/<text class="d-ascii" [^>]*>(.*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, ''))
  assert.deepEqual(rows, ['-●=●--≈-----', '===≈=×=&gt;'])   // idle columns carry no character
  assert.match(out, /<tspan class="a-span h-violet" x="[\d. ]+">===<\/tspan><tspan class="a-break"/) // a span is a bold run, cut by the break
  assert.match(out, /<tspan class="a-dot h-blue" x="[\d.]+">●<\/tspan>/)
  // one fixed advance per column, shared by every lane
  const xs = [...out.matchAll(/<tspan[^>]* x="([\d. ]+)"/g)].flatMap(m => m[1].split(' ').map(Number))
  assert.deepEqual([...new Set(xs.map(v => Math.round((v - Math.min(...xs)) * 10) % 120))], [0])
  const g = geometry(doc)
  assert.ok(out.includes(`style="--yt:${g.text.ys[1]}px;`))
})
