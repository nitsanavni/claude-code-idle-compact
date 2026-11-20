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
  assert.deepEqual(doc.legend.F, { label: 'fires', sub: 'after 5m', hue: 'sand' })
  assert.match(svg(doc), /^<svg[^>]+viewBox/)
})

test('rejects unknown hues', () => {
  assert.throws(() => parse('a  -x-\nlegend\nx  boom  neon'), /unknown hue/)
})
