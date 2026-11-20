import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse, lane, svg } from './marble.mjs'

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
