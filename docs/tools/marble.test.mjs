import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, lane, svg, geometry, legendRow, key, html } from './marble.mjs'

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
    for (const letter of ['S', 'E', 'F']) assert.match(part, new RegExp(`class="d-glyph lv1"[^>]*>${letter}<`))
  }
  assert.match(key(doc), /<b>done<\/b> — the countdown starts/)
})

test('term: lines are explained in the key', () => {
  const doc = parse(DOC)
  assert.deepEqual(doc.terms, [{ word: 'Turn', meaning: 'one round of the conversation' }])
  assert.match(key(doc), /<b>Turn<\/b> — one round of the conversation/)
})

test('detail levels: each level is no taller than the next, and lanes carry their place at every level', () => {
  const doc = parse(DOC)
  const [l0, l1, l2, l3] = geometry(doc).levels
  assert.ok(l0.H < l1.H && l1.H < l2.H && l2.H < l3.H, `${l0.H} < ${l1.H} < ${l2.H} < ${l3.H}`)
  assert.ok(l0.ys[1] - l0.ys[0] < l1.ys[1] - l1.ys[0]) // the wordless schematic packs its lanes tighter
  const out = svg(doc)
  // the SVG is drawn at full detail: a lane's transform is its level-3 place
  assert.ok(out.includes(`<g class="d-lane-g" transform="translate(0 ${l3.ys[0]})" style="--yt:${geometry(doc).text.ys[0]}px;--y0:${l0.ys[0]}px;--y1:${l1.ys[0]}px;--y2:${l2.ys[0]}px;--y3:${l3.ys[0]}px">`))
  assert.match(out, /class="d-lab lv2"/)   // names appear from level 2
  assert.match(out, /class="d-sub lv3"/)   // detail lines only at level 3
  assert.match(out, /class="d-tick lv2"/)  // so does the time axis
  assert.match(out, /class="d-lane lv1"/)  // lane names and marble letters from level 1: level 0 has no words
  assert.match(out, /class="d-glyph lv1"/)
  assert.equal(out.match(/<text class="(?!d-ascii)(?![^"]*\blv[123]\b)/g), null) // every word on the figure belongs to a level above 0
  assert.doesNotMatch(out, /class="d-dot[^"]*lv/) // marbles show at every level
  // a span is a filled pill from level 1, and a bold stretch of the lane line (same ends) at level 0
  const bar = out.match(/<rect class="d-span lv1" x="([\d.]+)" y="-10" width="([\d.]+)"/)
  const bold = [...out.matchAll(/<line class="d-bold" x1="([\d.]+)" y1="0" x2="([\d.]+)" y2="0"\/>/g)]
  assert.equal(bold.length, 2)
  assert.ok(bold.some(b => b[1] === bar[1] && Math.abs(+b[2] - (+bar[1] + +bar[2])) < 0.2))
})

test('the page has a five-step detail control, starting at the wordless text level', () => {
  const page = html(parse(DOC), DOC, '')
  assert.equal(page.match(/<input type="radio" name="lv"/g).length, 5)
  assert.match(page, /id="lvt" checked>Text/)
  assert.match(page, /class="d-stage" style="--ht:\d+;--h0:\d+;--h1:\d+;--h2:\d+;--h3:\d+"/)
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
  const rows = [...out.matchAll(/<text class="d-ascii"[^>]*>(.*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, ''))
  assert.deepEqual(rows, ['-●=●--≈-----', '===≈=×=&gt;'])   // idle columns carry no character
  assert.match(out, /<tspan class="a-span h-violet" x="[\d. ]+">===<\/tspan><tspan class="a-break"/) // a span is a bold run, cut by the break
  assert.match(out, /<tspan class="a-dot h-blue" x="[\d.]+">●<\/tspan>/)
  // one fixed advance per column, shared by every lane
  const xs = [...out.matchAll(/<tspan[^>]* x="([\d. ]+)"/g)].flatMap(m => m[1].split(' ').map(Number))
  assert.deepEqual([...new Set(xs.map(v => Math.round((v - Math.min(...xs)) * 10) % 120))], [0])
  const g = geometry(doc)
  assert.ok(g.text.H <= g.levels[0].H)
  assert.ok(out.includes(`style="--yt:${g.text.ys[1]}px;`))
})
