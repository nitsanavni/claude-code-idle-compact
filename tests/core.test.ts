// Nullables pattern: See the Nullables skill: https://github.com/lexler/skill-factory/blob/main/testing/nullables/SKILL.md, and James Shore, "Testing Without Mocks": https://www.jamesshore.com/v2/projects/nullables/testing-without-mocks
import { describe, expect, test } from 'claude-code/testing'
import { IdleCompact, type NullOptions } from '../hooks/core'
import { DEFAULTS } from '../hooks/config'

const IDLE_MS = DEFAULTS.idleSeconds * 1000
const BIG = DEFAULTS.minTokens + 5_000
const MAIN = undefined // the main loop's agentId

// One place builds the app over nulled infrastructure and hands back the trackers.
function setup(o: NullOptions = {}) {
  const app = IdleCompact.createNull(o)
  const { clock, ui, host, store } = app.deps
  return { app, clock, ui: ui.trackOutput(), host: host.trackOutput(), store: store.trackOutput() }
}

const status = async (app: IdleCompact) => JSON.parse(await app.report())

describe('idle timer', () => {
  test('fires after idleSeconds and compacts when at or above minTokens', async () => {
    const { app, clock, host, ui } = setup({ tokens: BIG })
    await app.onTurnComplete(MAIN)
    expect(app.status.armed).toBe(true)
    expect(app.status.fireAt).toBe(new Date(IDLE_MS).toISOString())

    await clock.advance(IDLE_MS - 1)
    expect(host.data).toEqual([])

    await clock.advance(1)
    expect(host.data).toEqual([{ call: 'session.compact' }])
    expect(app.status.armed).toBe(false)
    expect(app.status.lastOutcome).toBe(`compacted via session.compact (idle) at ${BIG} tokens`)
    expect(ui.data).toEqual([
      { kind: 'log', text: '🗜️ idle-compact: compacting 125k tokens (idle)…' },
      { kind: 'toast', text: '🗜️ idle-compact: compacted 125k tokens (idle)' },
      { kind: 'notify', text: '🗜️ idle-compact: compacted 125k tokens (idle)', title: 'idle-compact' },
    ])
    await clock.advance(2000)
    expect(ui.data.at(-1)).toEqual({ kind: 'log', text: '🗜️ idle-compact: compacted 125k tokens (idle)' })
  })

  test('skips below minTokens', async () => {
    const { app, clock, host } = setup({ tokens: DEFAULTS.minTokens - 1 })
    await app.onTurnComplete(MAIN)
    await clock.advance(IDLE_MS)
    expect(host.data).toEqual([])
    expect(app.status.lastOutcome).toBe(`skipped (idle): ${DEFAULTS.minTokens - 1} < minTokens ${DEFAULTS.minTokens}`)
    expect(app.status.lastContextTokens).toBe(DEFAULTS.minTokens - 1)
  })

  test('compacts at exactly minTokens', async () => {
    const { app, clock, host } = setup({ tokens: DEFAULTS.minTokens })
    await app.onTurnComplete(MAIN)
    await clock.advance(IDLE_MS)
    expect(host.data).toEqual([{ call: 'session.compact' }])
  })

  test('hysteresis: after a compaction, skips until the context grew minGrowth since', async () => {
    // compacts at BIG; the next turn ends at 110k (the new floor); idle again at 140k, 30k grown: skip; at 150k: compact
    const floor = 110_000
    const { app, clock, host } = setup({ tokens: [BIG, floor, floor + 30_000, floor + 40_000] })
    await app.onTurnComplete(MAIN)
    await clock.advance(IDLE_MS)
    expect(host.data).toEqual([{ call: 'session.compact' }])
    await app.onTurnComplete(MAIN) // first turn after the compaction: measures the floor
    expect(app.status.floorTokens).toBe(floor)
    await clock.advance(IDLE_MS)
    expect(host.data.length).toBe(1)
    expect(app.status.lastOutcome).toBe(`skipped (idle): grew 30000 since the last compaction (floor ${floor}) < minGrowth ${DEFAULTS.minGrowth}`)
    await app.onTurnComplete(MAIN)
    await clock.advance(IDLE_MS)
    expect(host.data.length).toBe(2)
  })

  test('compact_after_turn ignores the hysteresis', async () => {
    const { app, clock, host } = setup({ tokens: [BIG, 110_000, 110_000] })
    await app.onTurnComplete(MAIN)
    await clock.advance(IDLE_MS)
    app.queueCompact()
    await app.onTurnComplete(MAIN)
    await clock.advance(1000)
    expect(host.data.length).toBe(2)
  })

  test('turn.start cancels the timer', async () => {
    const { app, clock, host } = setup({ tokens: BIG })
    await app.onTurnComplete(MAIN)
    app.onTurnStart(MAIN)
    expect(app.status.armed).toBe(false)
    expect(app.status.fireAt).toBe(undefined)
    await clock.advance(IDLE_MS * 2)
    expect(host.data).toEqual([])
  })

  test('a subagent turn neither arms nor cancels', async () => {
    const { app, clock, host } = setup({ tokens: BIG })
    await app.onTurnComplete('agent-1')
    expect(app.status.armed).toBe(false)
    await app.onTurnComplete(MAIN)
    app.onTurnStart('agent-1')
    await clock.advance(IDLE_MS)
    expect(host.data).toEqual([{ call: 'session.compact' }])
  })

  test('a new turn.complete restarts the wait', async () => {
    const { app, clock, host } = setup({ tokens: BIG })
    await app.onTurnComplete(MAIN)
    await clock.advance(IDLE_MS / 2)
    await app.onTurnComplete(MAIN)
    await clock.advance(IDLE_MS / 2)
    expect(host.data).toEqual([])
    await clock.advance(IDLE_MS / 2)
    expect(host.data).toEqual([{ call: 'session.compact' }])
  })

  test('disabled: does not arm', async () => {
    const { app, clock, host } = setup({ tokens: BIG, store: { overrides: { enabled: false } } })
    await app.onTurnComplete(MAIN)
    expect(app.status.armed).toBe(false)
    await clock.advance(IDLE_MS)
    expect(host.data).toEqual([])
  })
})

describe('compaction', () => {
  test('dryRun only reports', async () => {
    const { app, clock, host, ui } = setup({ tokens: BIG, store: { overrides: { dryRun: true } } })
    await app.onTurnComplete(MAIN)
    await clock.advance(IDLE_MS)
    expect(host.data).toEqual([])
    expect(ui.data).toEqual([{ kind: 'toast', text: `idle-compact dry run: would compact ${BIG} tokens` }])
    expect(app.status.lastOutcome).toBe(`dry run (idle): would compact ${BIG} tokens`)
  })

  test('falls back to the compact command, then to a /compact prompt', async () => {
    const { app, clock, host } = setup({
      tokens: BIG,
      sessionCompact: { error: 'not in headless' },
      commandRun: { error: 'no such command' },
      store: { overrides: { instructions: 'keep the plan' } },
    })
    await app.onTurnComplete(MAIN)
    await clock.advance(IDLE_MS)
    expect(host.data).toEqual([
      { call: 'session.compact', instructions: 'keep the plan' },
      { call: 'command.run', command: 'compact', args: 'keep the plan' },
      { call: 'prompt.submit', text: '/compact keep the plan', asUser: true },
    ])
    expect(app.status.lastOutcome).toBe(`compacted via prompt.submit (idle) at ${BIG} tokens`)
    expect(app.status.lastErrors).toEqual(['session.compact: Error: not in headless', 'command.run: Error: no such command'])
  })

  test('every way refused', async () => {
    const { app, clock, ui } = setup({ tokens: BIG, sessionCompact: { error: 'a' }, commandRun: { error: 'b' }, promptSubmit: { error: 'c' } })
    await app.onTurnComplete(MAIN)
    await clock.advance(IDLE_MS)
    expect(app.status.lastOutcome).toBe('failed: every way refused')
    expect(ui.data.at(-1)).toEqual({ kind: 'log', text: '🗜️ idle-compact: failed, see status' })
  })

  test('a veto is reported and not announced', async () => {
    const { app, clock, ui } = setup({ tokens: BIG, sessionCompact: { skip: 'busy' } })
    await app.onTurnComplete(MAIN)
    await clock.advance(IDLE_MS + 5000)
    expect(app.status.lastOutcome).toBe('vetoed via session.compact: busy')
    expect(ui.data.map(x => x.text)).toEqual(['🗜️ idle-compact: compacting 125k tokens (idle)…', '🗜️ idle-compact: vetoed (busy)'])
  })

  test('announce=prompt posts a message; afterPrompt wakes Claude instead', async () => {
    const a = setup({ tokens: BIG, store: { overrides: { announce: 'prompt' } } })
    await a.app.onTurnComplete(MAIN)
    await a.clock.advance(IDLE_MS + 5000)
    expect(a.host.data.at(-1)).toEqual({ call: 'prompt.submit', text: '🗜️ idle-compact: compacted 125k tokens (idle). Reply only "ok".' })
    expect(a.ui.data.map(x => x.kind)).toEqual(['log'])

    const b = setup({ tokens: BIG, store: { overrides: { announce: 'prompt', afterPrompt: 'check status' } } })
    await b.app.onTurnComplete(MAIN)
    await b.clock.advance(IDLE_MS + 5000)
    expect(b.host.data.slice(1)).toEqual([{ call: 'prompt.submit', text: '🗜️ idle-compact: compacted 125k tokens (idle). check status' }])
  })
})

describe('tools', () => {
  test('compact_after_turn compacts 1s after the turn ends, ignoring minTokens and dryRun', async () => {
    const { app, clock, host } = setup({ tokens: 10, store: { overrides: { dryRun: true } } })
    expect(app.queueCompact()).toBe('Compaction queued for the end of this turn.')
    await app.onTurnComplete(MAIN)
    expect(app.status.armed).toBe(false)
    await clock.advance(999)
    expect(host.data).toEqual([])
    await clock.advance(1)
    expect(host.data).toEqual([{ call: 'session.compact' }])
    expect(app.status.lastOutcome).toBe('compacted via session.compact (requested) at 10 tokens')
    await app.onTurnComplete(MAIN)
    expect(app.status.armed).toBe(true) // queued once only
  })

  test('config sets fields, persists them, and re-arms with the new wait', async () => {
    const { app, clock, host, store } = setup({ tokens: 50 })
    await app.onTurnComplete(MAIN)
    const out = JSON.parse(await app.setConfig({ idleSeconds: 5, minTokens: 0 }))
    expect(out.config).toEqual({ ...DEFAULTS, idleSeconds: 5, minTokens: 0 })
    expect(store.data).toEqual([{ key: 'overrides', value: { idleSeconds: 5, minTokens: 0 } }])
    await clock.advance(5000)
    expect(host.data).toEqual([{ call: 'session.compact' }])
  })

  test('config before any turn ended does not arm', async () => {
    const { app } = setup()
    await app.setConfig({ idleSeconds: 5 })
    expect(app.status.armed).toBe(false)
  })

  test('config reset drops live changes, then applies the given fields', async () => {
    const { app } = setup({ store: { overrides: { minTokens: 1, dryRun: true } } })
    const out = JSON.parse(await app.setConfig({ reset: true, announce: 'log' }))
    expect(out.config).toEqual({ ...DEFAULTS, announce: 'log' })
    expect((await status(app)).config).toEqual({ ...DEFAULTS, announce: 'log' })
  })

  test('status reports config, status and the context size now', async () => {
    const { app } = setup({ tokens: 4242 })
    expect(await status(app)).toEqual({ config: DEFAULTS, layers: { userConfig: {}, projectFile: {}, live: {} }, status: { armed: false }, contextTokensNow: 4242 })
  })
})
