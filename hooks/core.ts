// The idle-compact logic, over Nullable infrastructure (infra.ts).
// Arm on the main loop's turn.complete, cancel on its turn.start, fire after
// idleSeconds: compact when the context is at least minTokens.
// Config is re-read at every arm and fire, so changes apply immediately.

import { applyChange, channels, merge, type Config } from './config'
import { Clock, Files, Host, Store, Ui, type Cancel, type HostNullOptions, type Response } from './infra'

export type Status = Record<string, unknown> & { armed: boolean }

export type Deps = { clock: Clock; store: Store; files: Files; ui: Ui; host: Host }

export type NullOptions = HostNullOptions & {
  now?: number
  store?: Record<string, unknown>
  files?: Record<string, Response<string>>
}

export class IdleCompact {
  /** Production: hand it the engine's `$` with `use($)` at each hook, before calling it. */
  static create(): IdleCompact {
    return new IdleCompact(IdleCompact.createNull().deps)
  }

  static createNull(o: NullOptions = {}): IdleCompact {
    return new IdleCompact({
      clock: Clock.createNull({ now: o.now }),
      store: Store.createNull(o.store),
      files: Files.createNull(o.files),
      ui: Ui.createNull(),
      host: Host.createNull(o),
    })
  }

  readonly status: Status = { armed: false }
  private timer: Cancel | null = null
  private queued = false

  constructor(public deps: Deps) {}

  /** Point the infrastructure at this `$`: the latest hook's engine interface. */
  use(deps: Deps): this {
    this.deps = deps
    return this
  }

  private iso(): string {
    return new Date(this.deps.clock.now()).toISOString()
  }

  async config(): Promise<Config> {
    const saved = (await this.deps.store.get('config')) ?? {}
    return merge(saved as Partial<Config>)
  }

  // ---- events ----

  onTurnStart(agentId: string | undefined): void {
    if (agentId === undefined) this.disarm()
  }

  async onTurnComplete(agentId: string | undefined): Promise<void> {
    if (agentId !== undefined) return
    this.status.lastTurnEndAt = this.iso()
    if (this.queued) {
      this.queued = false
      this.deps.clock.after(1000, () => this.requestedCompact())
    } else {
      await this.arm()
    }
  }

  // ---- tools ----

  async setConfig(input: Record<string, unknown>): Promise<string> {
    const live = (await this.deps.store.get('config')) as Partial<Config> | undefined
    const cfg = merge(applyChange(live ?? {}, input))
    await this.deps.store.set('config', cfg)
    if (this.status.lastTurnEndAt) await this.arm()
    return JSON.stringify({ config: cfg, status: this.status }, null, 2)
  }

  async report(): Promise<string> {
    const tokens = await this.deps.host.contextTokens()
    return JSON.stringify({ config: await this.config(), status: this.status, contextTokensNow: tokens }, null, 2)
  }

  queueCompact(): string {
    this.queued = true
    return 'Compaction queued for the end of this turn.'
  }

  // ---- timer ----

  private disarm(): void {
    this.timer?.cancel()
    this.timer = null
    this.status.armed = false
    this.status.fireAt = undefined
  }

  private async arm(): Promise<void> {
    this.disarm()
    const cfg = await this.config()
    if (!cfg.enabled) return
    const ms = Math.max(1, cfg.idleSeconds) * 1000
    this.status.armed = true
    this.status.fireAt = new Date(this.deps.clock.now() + ms).toISOString()
    this.timer = this.deps.clock.after(ms, () => this.fire())
  }

  private async fire(): Promise<void> {
    this.timer = null
    this.status.armed = false
    const cfg = await this.config()
    if (cfg.enabled) await this.compact(cfg, 'idle')
    else this.status.lastOutcome = 'disabled at fire time'
  }

  private async requestedCompact(): Promise<void> {
    const cfg = await this.config()
    await this.compact({ ...cfg, minTokens: 0, dryRun: false }, 'requested')
  }

  // ---- compaction ----

  private async compact(cfg: Config, why: string): Promise<void> {
    const { ui, host } = this.deps
    const status = this.status
    const tokens = (await host.contextTokens()) ?? 0
    status.lastCheckAt = this.iso()
    status.lastContextTokens = tokens
    if (tokens < cfg.minTokens) {
      status.lastOutcome = `skipped (${why}): ${tokens} < minTokens ${cfg.minTokens}`
      return
    }
    if (cfg.dryRun) {
      ui.toast(`idle-compact dry run: would compact ${tokens} tokens`)
      status.lastOutcome = `dry run (${why}): would compact ${tokens} tokens`
      return
    }
    const args = cfg.instructions || undefined
    const ways: [string, () => Promise<any>][] = [
      ['session.compact', () => host.sessionCompact(args)],
      ['command.run', () => host.commandRun('compact', args)],
      ['prompt.submit', () => host.promptSubmit(args ? `/compact ${args}` : '/compact', true)],
    ]
    const errors: string[] = []
    const k = Math.round(tokens / 1000)
    ui.log(`🗜️ idle-compact: compacting ${k}k tokens (${why})…`)
    for (const [name, run] of ways) {
      try {
        const r = await run()
        status.lastOutcome = r?.skip ? `vetoed via ${name}: ${r.skip}` : `compacted via ${name} (${why}) at ${tokens} tokens`
        status.lastErrors = errors
        if (r?.skip) ui.log(`🗜️ idle-compact: vetoed (${r.skip})`)
        else this.announce(cfg, `🗜️ idle-compact: compacted ${k}k tokens (${why})`, errors)
        return
      } catch (err) {
        errors.push(`${name}: ${String(err).slice(0, 200)}`)
      }
    }
    status.lastErrors = errors
    status.lastOutcome = 'failed: every way refused'
    ui.log('🗜️ idle-compact: failed, see status')
  }

  private announce(cfg: Config, msg: string, errors: string[]): void {
    const { clock, ui, host } = this.deps
    const via = channels(cfg.announce)
    if (via.has('toast')) ui.toast(msg)
    if (via.has('notify')) void ui.notify(msg, { title: 'idle-compact' }).catch(() => {})
    // compaction redraws the transcript, so post after it settles
    if (via.has('log')) clock.after(2000, () => ui.log(msg))
    if (via.has('prompt') && !cfg.afterPrompt)
      clock.after(3000, () => host.promptSubmit(`${msg}. Reply only "ok".`).catch(() => {}))
    if (cfg.afterPrompt) {
      const text = `${msg}. ${cfg.afterPrompt}`
      clock.after(4000, () => host.promptSubmit(text).catch((err: unknown) => {
        this.status.lastErrors = [...errors, `afterPrompt: ${String(err).slice(0, 200)}`]
      }))
    }
  }
}
