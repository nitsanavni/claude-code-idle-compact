import { expect, mock, test } from 'claude-code/testing'

// Thin integration test: the real hooks module, loaded by the engine's own
// host, over a test engine. Hooks registered here stand for the engine.
test('after an idle wait the plugin compacts a large session', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  const registered: string[] = []
  const compacted: unknown[] = []
  on('tool.register', (_, e) => (registered.push(e.name), { value: { tool: `mcp__idle-compact__${e.name}` } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { context: { tokens: 200_000 } } }) as any)
  on('session.compact', () => (compacted.push('compact'), { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }) as any)
  on('turn.complete', () => ({ text: '' }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'client' } }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as any)
  expect(registered).toEqual(['config', 'status', 'compact_after_turn'])

  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  await clock.advance(20 * 60 * 1000 - 1)
  expect(compacted).toEqual([])
  await clock.advance(1)
  expect(compacted).toEqual(['compact'])

  const { result } = (await $.tool.run({ tool: 'mcp__idle-compact__status' } as any)) as any
  expect(JSON.parse(result).status.lastOutcome).toBe('compacted via session.compact (idle) at 200000 tokens')
})
