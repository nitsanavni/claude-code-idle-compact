import type { Register } from 'claude-code'
import { IdleCompact } from './core'
import { engine } from './infra'
import { TOOLS } from './tools'

// Thin wiring: engine events -> IdleCompact. The logic lives in core.ts and
// config.ts; infra.ts wraps $ (each hook hands the core the $ it got).
const app = IdleCompact.create()

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    app.use(engine($))
    for (const tool of TOOLS) await $.tool.register(tool as any)
    return next(e)
  })

  on('tool.run', { tool: 'mcp__idle-compact__config' }, async ($, e) => ({ result: await app.use(engine($)).setConfig(e as any) }))
  on('tool.run', { tool: 'mcp__idle-compact__status' }, async $ => ({ result: await app.use(engine($)).report() }))
  on('tool.run', { tool: 'mcp__idle-compact__compact_after_turn' }, $ => ({ result: app.use(engine($)).queueCompact() }))

  on('turn.start', async ($, e, next) => {
    app.use(engine($)).onTurnStart((e as any).agentId)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await app.use(engine($)).onTurnComplete((e as any).agentId)
    return done
  })
}
