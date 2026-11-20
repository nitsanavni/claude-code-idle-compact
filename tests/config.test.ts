import { describe, expect, test } from 'claude-code/testing'
import { applyChange, DEFAULTS, fromLegacy, merge, parseProjectFile, pick, resolve, PROJECT_FILE } from '../hooks/config'
import { IdleCompact } from '../hooks/core'

describe('merge', () => {
  test('no layers: the defaults', () => {
    expect(merge()).toEqual(DEFAULTS)
    expect(DEFAULTS.minTokens).toBe(120_000)
    expect(DEFAULTS.idleSeconds).toBe(1200)
  })

  test('later layers win, field by field', () => {
    expect(resolve({ userConfig: { minTokens: 1, dryRun: true }, projectFile: { minTokens: 2, idleSeconds: 3 }, live: { minTokens: 4 } }))
      .toEqual({ ...DEFAULTS, minTokens: 4, idleSeconds: 3, dryRun: true })
  })

  test('unknown keys and wrong types are dropped', () => {
    expect(pick({ minTokens: '5', bogus: 1, dryRun: true })).toEqual({ dryRun: true })
    expect(pick(null)).toEqual({})
  })
})

describe('live changes', () => {
  test('set fields on top of earlier ones', () => {
    expect(applyChange({ minTokens: 1 }, { dryRun: true })).toEqual({ minTokens: 1, dryRun: true })
  })

  test('reset clears them, then sets the given fields', () => {
    expect(applyChange({ minTokens: 1 }, { reset: true, dryRun: true })).toEqual({ dryRun: true })
  })
})

describe('project file', () => {
  test('missing: an empty layer', () => {
    expect(parseProjectFile(undefined)).toEqual({ layer: {} })
  })

  test('valid fields are used; bad ones are named', () => {
    expect(parseProjectFile('{"minTokens": 5, "idle": 3, "dryRun": "yes"}')).toEqual({
      layer: { minTokens: 5 },
      error: `${PROJECT_FILE}: ignored unknown key idle, dryRun should be a boolean`,
    })
  })

  test('invalid JSON is an empty layer and an error', () => {
    const r = parseProjectFile('{nope')
    expect(r.layer).toEqual({})
    expect(r.error).toEqual(expect.stringContaining('invalid JSON'))
  })
})

describe('0.5.x stored config', () => {
  test('keeps only fields changed from a former default', () => {
    expect(fromLegacy({ ...DEFAULTS, minTokens: 100_000, idleSeconds: 3000, dryRun: true })).toEqual({ dryRun: true })
    expect(fromLegacy({ ...DEFAULTS, minTokens: 7 })).toEqual({ minTokens: 7 })
  })
})

describe('layers in the app', () => {
  test('userConfig < project file < live', async () => {
    const app = IdleCompact.createNull({
      userConfig: { minTokens: 1, idleSeconds: 10, dryRun: true },
      files: { [PROJECT_FILE]: '{"minTokens": 2, "idleSeconds": 20}' },
      store: { overrides: { minTokens: 3 } },
    })
    const r = JSON.parse(await app.report())
    expect(r.config).toEqual({ ...DEFAULTS, minTokens: 3, idleSeconds: 20, dryRun: true })
    expect(r.layers).toEqual({ userConfig: { minTokens: 1, idleSeconds: 10, dryRun: true }, projectFile: { minTokens: 2, idleSeconds: 20 }, live: { minTokens: 3 } })
  })

  test('the project file is re-read at every arm', async () => {
    const app = IdleCompact.createNull({ files: { [PROJECT_FILE]: ['{"idleSeconds": 5}', '{"idleSeconds": 7}'] } })
    await app.onTurnComplete(undefined)
    expect(app.status.fireAt).toBe(new Date(5000).toISOString())
    await app.onTurnComplete(undefined)
    expect(app.status.fireAt).toBe(new Date(7000).toISOString())
  })

  test('a broken project file is reported and the rest still applies', async () => {
    const app = IdleCompact.createNull({ files: { [PROJECT_FILE]: { error: 'EACCES' } }, store: { overrides: { minTokens: 3 } } })
    const r = JSON.parse(await app.report())
    expect(r.config.minTokens).toBe(3)
    expect(r.configError).toBe(`${PROJECT_FILE}: Error: EACCES`)
  })

  test('reset drops live changes only: project file and userConfig stay', async () => {
    const app = IdleCompact.createNull({ userConfig: { dryRun: true }, files: { [PROJECT_FILE]: '{"minTokens": 2}' }, store: { overrides: { minTokens: 3 } } })
    expect(JSON.parse(await app.setConfig({ reset: true })).config).toEqual({ ...DEFAULTS, minTokens: 2, dryRun: true })
  })

  test('a 0.5.x whole config in the store moves to overrides once', async () => {
    const app = IdleCompact.createNull({ store: { config: { ...DEFAULTS, minTokens: 100_000, announce: 'log' } } })
    const writes = app.deps.store.trackOutput()
    expect((await app.config()).announce).toBe('log')
    expect(writes.data).toEqual([{ key: 'overrides', value: { announce: 'log' } }, { key: 'config', deleted: true }])
    await app.config()
    expect(writes.data.length).toBe(2)
  })
})
