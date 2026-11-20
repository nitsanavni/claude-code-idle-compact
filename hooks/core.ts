// The idle-compact logic, over Nullable infrastructure (infra.ts).
// Arm on the main loop's turn.complete, cancel on its turn.start, fire after
// idleSeconds: compact when the context is at least minTokens.
// Config is re-read at every arm and fire, so changes apply immediately.

import { applyChange, channels, fromLegacy, parseProjectFile, pick, resolve, PROJECT_FILE, type Config, type Layers } from './config'
import { Clock, Files, Host, Store, Ui, type Cancel, type HostNullOptions, type Response } from './infra'

export type Status = Record<string, unknown> & { armed: boolean }

export type Deps = { clock: Clock; store: Store; files: Files; ui: Ui; host: Host }

export type NullOptions = HostNullOptions & {
  now?: number
  userConfig?: Record<string, unknown>
  store?: Record<string, unknown>
  files?: Record<string, Response<string> | Response<string>[]>
}

export class IdleCompact {
  /** Production: hand it the engine's `$` with `use($)` at each hook, before calling it. */
  static create(userConfig: Record<string, unknown> = {}): IdleCompact {
    return new IdleCompact(IdleCompact.createNull().deps, userConfig)
  }

  static createNull(o: NullOptions = {}): IdleCompact {
    return new IdleCompact({
      clock: Clock.createNull({ now: o.now }),
      store: Store.createNull(o.store),
      files: Files.createNull(o.files),
      ui: Ui.createNull(),
      host: Host.createNull(o),
    }, o.userConfig)
  }

  readonly status: Status = { armed: false }
  private timer: Cancel | null = null
  private queued = false

  private readonly userConfig: Partial<Config>

  constructor(public deps: Deps, userConfig: Record<string, unknown> = {}) {
    // The engine hands an unset string option as "": treat it as unset.
    this.userConfig = pick(Object.fromEntries(Object.entries(userConfig).filter(([, v]) => v !== '')))
  }

  /** Point the infrastructure at this `$`: the latest hook's engine interface. */
  use(deps: Deps): this {
    this.deps = deps
    return this
  }

  private iso(): string {
    return new Date(this.deps.clock.now()).toISOString()
  }

  // ---- config: defaults < userConfig < project file < live ----

  async layers(): Promise<{ layers: Layers; error?: string }> {
    let file: { layer: Partial<Config>; error?: string }
    try {
      file = parseProjectFile(await this.deps.files.readText(PROJECT_FILE))
    } catch (err) {
      file = { layer: {}, error: `${PROJECT_FILE}: ${String(err).slice(0, 200)}` }
    }
    const layers = { userConfig: this.userConfig, projectFile: file.layer, live: await this.live() }
    return file.error ? { layers, error: file.error } : { layers }
  }

  async config(): Promise<Config> {
    return resolve((await this.layers()).layers)
  }

  /** The live layer, moving a 0.5.x whole-config entry over once. */
  private async live(): Promise<Partial<Config>> {
    const { store } = this.deps
    const saved = await store.get('overrides')
    if (saved !== undefined) return pick(saved)
    const legacy = await store.get('config')
    if (legacy === undefined) return {}
    const live = fromLegacy(legacy)
    await store.set('overrides', live)
    await store.delete('config')
    return live
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
    await this.deps.store.set('overrides', applyChange(await this.live(), input))
    const cfg = await this.config()
    if (this.status.lastTurnEndAt) await this.arm()
    return JSON.stringify({ config: cfg, status: this.status }, null, 2)
  }

  async report(): Promise<string> {
    const tokens = await this.deps.host.contextTokens()
    const { layers, error } = await this.layers()
    const configError = error ? { configError: error } : {}
    return JSON.stringify({ config: resolve(layers), layers, ...configError, status: this.status, contextTokensNow: tokens }, null, 2)
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
