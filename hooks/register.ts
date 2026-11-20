import type { Register } from 'claude-code'

// Live-tunable idle compaction. Config lives in $.store under "config" and is
// re-read at every arm and fire, so changes apply immediately, no rebuild.
type Config = {
  enabled: boolean
  idleSeconds: number // wait after a turn ends before compacting
  minTokens: number // skip when context is smaller than this
  dryRun: boolean // true: only report what would happen
  instructions: string // optional focus for the summary
  announce: string // comma list of where to show "compacted": log,toast,notify,prompt (prompt = a message in the stream that starts a short turn)
  afterPrompt: string // testing: if set, submitted (as the plugin) after a compaction, to wake Claude
}

const DEFAULTS: Config = { enabled: true, idleSeconds: 20 * 60, minTokens: 100_000, dryRun: false, instructions: '', announce: 'log,toast,notify', afterPrompt: '' }
const KEYS = Object.keys(DEFAULTS) as (keyof Config)[]

let timer: { cancel: () => void } | null = null
let queued = false
const status: Record<string, unknown> = { armed: false }

async function readConfig($: any): Promise<Config> {
  const saved = ((await $.store.get('config')) ?? {}) as Partial<Config>
  return { ...DEFAULTS, ...saved }
}

async function compact($: any, cfg: Config, why: string): Promise<void> {
  const { context } = await $.session.usage()
  const tokens = context?.tokens ?? 0
  status.lastCheckAt = new Date().toISOString()
  status.lastContextTokens = tokens
  if (tokens < cfg.minTokens) {
    status.lastOutcome = `skipped (${why}): ${tokens} < minTokens ${cfg.minTokens}`
    return
  }
  if (cfg.dryRun) {
    $.ui.toast(`idle-compact dry run: would compact ${tokens} tokens`)
    status.lastOutcome = `dry run (${why}): would compact ${tokens} tokens`
    return
  }
  const args = cfg.instructions || undefined
  const ways: [string, () => Promise<any>][] = [
    ['session.compact', () => $.session.compact(args ? { instructions: args } : undefined)],
    ['command.run', () => $.command.run(args ? { command: 'compact', args } : { command: 'compact' })],
    ['prompt.submit', () => $.prompt.submit({ text: args ? `/compact ${args}` : '/compact', asUser: true })],
  ]
  const errors: string[] = []
  const k = Math.round(tokens / 1000)
  $.ui.log(`🗜️ idle-compact: compacting ${k}k tokens (${why})…`)
  for (const [name, run] of ways) {
    try {
      const r = await run()
      status.lastOutcome = r?.skip ? `vetoed via ${name}: ${r.skip}` : `compacted via ${name} (${why}) at ${tokens} tokens`
      status.lastErrors = errors
      if (r?.skip) $.ui.log(`🗜️ idle-compact: vetoed (${r.skip})`)
      else {
        const msg = `🗜️ idle-compact: compacted ${k}k tokens (${why})`
        const via = new Set(cfg.announce.split(',').map(x => x.trim()))
        if (via.has('toast')) $.ui.toast(msg)
        if (via.has('notify')) void $.ui.notify(msg, { title: 'idle-compact' }).catch(() => {})
        // compaction redraws the transcript, so post after it settles
        if (via.has('log')) $.clock.after(2000, () => $.ui.log(msg))
        if (via.has('prompt') && !cfg.afterPrompt)
          $.clock.after(3000, () => void $.prompt.submit({ text: `${msg}. Reply only "ok".` }).catch(() => {}))
        if (cfg.afterPrompt) {
          const text = `${msg}. ${cfg.afterPrompt}`
          $.clock.after(4000, () => void $.prompt.submit({ text }).catch((err: unknown) => {
            status.lastErrors = [...errors, `afterPrompt: ${String(err).slice(0, 200)}`]
          }))
        }
      }
      return
    } catch (err) {
      errors.push(`${name}: ${String(err).slice(0, 200)}`)
    }
  }
  status.lastErrors = errors
  status.lastOutcome = 'failed: every way refused'
  $.ui.log('🗜️ idle-compact: failed, see status')
}

function disarm(): void {
  timer?.cancel()
  timer = null
  status.armed = false
  status.fireAt = undefined
}

async function fire($: any): Promise<void> {
  timer = null
  status.armed = false
  const cfg = await readConfig($)
  if (cfg.enabled) await compact($, cfg, 'idle')
  else status.lastOutcome = 'disabled at fire time'
}

async function arm($: any): Promise<void> {
  disarm()
  const cfg = await readConfig($)
  if (!cfg.enabled) return
  const ms = Math.max(1, cfg.idleSeconds) * 1000
  status.armed = true
  status.fireAt = new Date(Date.now() + ms).toISOString()
  timer = $.clock.after(ms, () => void fire($))
}

async function setConfig($: any, input: any): Promise<string> {
  const base = input.reset ? DEFAULTS : await readConfig($)
  const cfg: any = { ...base }
  for (const k of KEYS) if (input[k] !== undefined) cfg[k] = input[k]
  await $.store.set('config', cfg)
  if (status.lastTurnEndAt) await arm($)
  return JSON.stringify({ config: cfg, status }, null, 2)
}

async function report($: any): Promise<string> {
  const { context } = await $.session.usage()
  return JSON.stringify({ config: await readConfig($), status, contextTokensNow: context?.tokens }, null, 2)
}

async function requestedCompact($: any): Promise<void> {
  const cfg = await readConfig($)
  await compact($, { ...cfg, minTokens: 0, dryRun: false }, 'requested')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'config',
      description:
        'Read or change idle-compact settings; applies immediately (re-arms the idle timer). Fields: enabled, idleSeconds, minTokens, dryRun, instructions, announce (comma list: log,toast,notify,prompt), afterPrompt (testing: text auto-submitted after a compaction to wake Claude; empty = off); reset:true restores defaults. No fields = just read.',
      inputSchema: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          idleSeconds: { type: 'number' },
          minTokens: { type: 'number' },
          dryRun: { type: 'boolean' },
          instructions: { type: 'string' },
          announce: { type: 'string' },
          afterPrompt: { type: 'string' },
          reset: { type: 'boolean' },
        },
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'status',
      description: 'Show idle-compact state: armed, fireAt, lastOutcome, context tokens.',
      inputSchema: { type: 'object', properties: {} },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'compact_after_turn',
      description: 'Compact this conversation (like /compact) as soon as the current turn ends.',
      inputSchema: { type: 'object', properties: {} },
      isDeferred: false,
    })
    return next(e)
  })

  on('tool.run', { tool: "mcp__idle-compact__config" }, async ($, e) => ({ result: await setConfig($, e) }))
  on('tool.run', { tool: "mcp__idle-compact__status" }, async $ => ({ result: await report($) }))
  on('tool.run', { tool: "mcp__idle-compact__compact_after_turn" }, () => {
    queued = true
    return { result: 'Compaction queued for the end of this turn.' }
  })

  on('turn.start', async ($, e, next) => {
    if ((e as any).agentId === undefined) disarm()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if ((e as any).agentId !== undefined) return done
    status.lastTurnEndAt = new Date().toISOString()
    if (queued) {
      queued = false
      $.clock.after(1000, () => void requestedCompact($))
    } else {
      await arm($)
    }
    return done
  })
}
