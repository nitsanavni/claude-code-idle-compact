// Infrastructure wrappers around the engine's `$`, Nullables style (James Shore,
// "Testing Without Mocks"). Each wrapper has `create<Name>($)` (bottom of the file) for production and
// `createNull(...)` for tests and dry runs: the same code path over an embedded
// stub that answers configured responses and does no I/O. Writes are recorded
// with `trackOutput()`. Keep logic out of here: it belongs in core.ts.

type $ = any

// ---- utilities ----

export class OutputTracker<T> {
  readonly data: T[] = []
}

class Output<T> {
  private trackers: OutputTracker<T>[] = []
  track(): OutputTracker<T> {
    const t = new OutputTracker<T>()
    this.trackers.push(t)
    return t
  }
  emit(item: T): void {
    for (const t of this.trackers) t.data.push(item)
  }
}

export type Response<T> = T | { error: string }

/** One value repeats forever; a list is consumed in order, then fails fast. */
export class ConfigurableResponses<T> {
  private list: Response<T>[] | undefined
  private single: Response<T> | undefined
  constructor(private readonly what: string, responses: Response<T> | Response<T>[]) {
    if (Array.isArray(responses)) this.list = [...responses]
    else this.single = responses
  }
  next(): T {
    let r: Response<T> | undefined
    if (this.list) {
      if (this.list.length === 0) throw new Error(`No more responses configured for ${this.what}`)
      r = this.list.shift()
    } else r = this.single
    if (r && typeof r === 'object' && 'error' in (r as object)) throw new Error((r as { error: string }).error)
    return r as T
  }
}

// ---- clock ----

export type Cancel = { cancel: () => void }
type ClockImpl = { now(): number; after(ms: number, fn: () => unknown): Cancel }

export class Clock {
  /** A clock that moves only on `advance`. */
  static createNull({ now = 0 }: { now?: number } = {}): Clock {
    return new Clock(new StubClock(now))
  }

  constructor(private readonly impl: ClockImpl) {}

  now(): number {
    return this.impl.now()
  }

  after(ms: number, fn: () => unknown): Cancel {
    return this.impl.after(ms, fn)
  }

  /** Nulled only: move time on, running each timer due on the way, in order, awaiting each. */
  async advance(ms: number): Promise<void> {
    if (!(this.impl instanceof StubClock)) throw new Error('advance() works on a nulled Clock only')
    await this.impl.advance(ms)
  }

  /** Nulled only: how many timers are waiting. */
  pending(): number {
    return this.impl instanceof StubClock ? this.impl.pending() : 0
  }
}

class StubClock implements ClockImpl {
  private timers: { at: number; seq: number; fn: () => unknown }[] = []
  private seq = 0
  constructor(private time: number) {}
  now(): number {
    return this.time
  }
  after(ms: number, fn: () => unknown): Cancel {
    const t = { at: this.time + ms, seq: this.seq++, fn }
    this.timers.push(t)
    return { cancel: () => void (this.timers = this.timers.filter(x => x !== t)) }
  }
  pending(): number {
    return this.timers.length
  }
  async advance(ms: number): Promise<void> {
    const until = this.time + ms
    for (;;) {
      const due = this.timers.filter(t => t.at <= until).sort((a, b) => a.at - b.at || a.seq - b.seq)[0]
      if (!due) break
      this.timers = this.timers.filter(t => t !== due)
      this.time = due.at
      await due.fn()
    }
    this.time = until
  }
}

// ---- store ----

type StoreImpl = { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<void>; delete(k: string): Promise<void> }
export type StoreWrite = { key: string; value?: unknown; deleted?: true }

export class Store {
  /** A store in memory, holding `entries` at the start. */
  static createNull(entries: Record<string, unknown> = {}): Store {
    const mem = new Map(Object.entries(entries).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]))
    return new Store({
      get: async k => mem.get(k),
      set: async (k, v) => void mem.set(k, JSON.parse(JSON.stringify(v))),
      delete: async k => void mem.delete(k),
    })
  }

  private output = new Output<StoreWrite>()
  constructor(private readonly impl: StoreImpl) {}

  get(key: string): Promise<unknown> {
    return this.impl.get(key)
  }
  async set(key: string, value: unknown): Promise<void> {
    this.output.emit({ key, value })
    await this.impl.set(key, value)
  }
  async delete(key: string): Promise<void> {
    this.output.emit({ key, deleted: true })
    await this.impl.delete(key)
  }
  trackOutput(): OutputTracker<StoreWrite> {
    return this.output.track()
  }
}

// ---- files ----

type FilesImpl = { exists(p: string): Promise<boolean>; read(p: string): Promise<string> }

export class Files {
  /** `files` maps a path to its text, `{ error }` for a read that fails, or a list of those read in turn. */
  static createNull(files: Record<string, Response<string> | Response<string>[]> = {}): Files {
    const reads = new Map(Object.entries(files).map(([p, r]) => [p, new ConfigurableResponses<string>(`Files.read(${p})`, r)]))
    return new Files({
      exists: async p => reads.has(p),
      read: async p => (reads.get(p) ?? new ConfigurableResponses<string>(p, { error: `Nulled Files: no such file ${p}` })).next(),
    })
  }

  constructor(private readonly impl: FilesImpl) {}

  /** The file's text, or undefined when it isn't there. Rejects on any other failure. */
  async readText(path: string): Promise<string | undefined> {
    if (!(await this.impl.exists(path))) return undefined
    return this.impl.read(path)
  }
}

// ---- ui ----

export type UiOutput = { kind: 'log' | 'toast' | 'notify'; text: string; title?: string }
type UiImpl = { log(t: string): void; toast(t: string): void; notify(t: string, o: { title: string }): Promise<unknown> }

export class Ui {
  static createNull(): Ui {
    return new Ui({ log: () => {}, toast: () => {}, notify: async () => {} })
  }

  private output = new Output<UiOutput>()
  constructor(private readonly impl: UiImpl) {}

  log(text: string): void {
    this.output.emit({ kind: 'log', text })
    this.impl.log(text)
  }
  toast(text: string): void {
    this.output.emit({ kind: 'toast', text })
    this.impl.toast(text)
  }
  notify(text: string, opts: { title: string }): Promise<unknown> {
    this.output.emit({ kind: 'notify', text, title: opts.title })
    return this.impl.notify(text, opts)
  }
  trackOutput(): OutputTracker<UiOutput> {
    return this.output.track()
  }
}

// ---- host: session usage, compaction, commands, prompts ----

export type CompactAnswer = { skip?: string } | undefined | void
export type HostCall =
  | { call: 'session.compact'; instructions?: string }
  | { call: 'command.run'; command: string; args?: string }
  | { call: 'prompt.submit'; text: string; asUser?: boolean }

type HostImpl = {
  contextTokens(): Promise<number | undefined>
  sessionCompact(instructions?: string): Promise<CompactAnswer>
  commandRun(command: string, args?: string): Promise<CompactAnswer>
  promptSubmit(text: string, asUser?: boolean): Promise<CompactAnswer>
}

export type HostNullOptions = {
  /** Context size `usage()` answers; a list is consumed in order. */
  tokens?: Response<number | undefined> | Response<number | undefined>[]
  sessionCompact?: Response<CompactAnswer> | Response<CompactAnswer>[]
  commandRun?: Response<CompactAnswer> | Response<CompactAnswer>[]
  promptSubmit?: Response<CompactAnswer> | Response<CompactAnswer>[]
}

export class Host {
  static createNull(o: HostNullOptions = {}): Host {
    const tokens = new ConfigurableResponses('Host.contextTokens', o.tokens ?? 0)
    const compact = new ConfigurableResponses<CompactAnswer>('Host.sessionCompact', o.sessionCompact ?? undefined)
    const command = new ConfigurableResponses<CompactAnswer>('Host.commandRun', o.commandRun ?? undefined)
    const submit = new ConfigurableResponses<CompactAnswer>('Host.promptSubmit', o.promptSubmit ?? undefined)
    return new Host({
      contextTokens: async () => tokens.next(),
      sessionCompact: async () => compact.next(),
      commandRun: async () => command.next(),
      promptSubmit: async () => submit.next(),
    })
  }

  private output = new Output<HostCall>()
  constructor(private readonly impl: HostImpl) {}

  contextTokens(): Promise<number | undefined> {
    return this.impl.contextTokens()
  }
  sessionCompact(instructions?: string): Promise<CompactAnswer> {
    this.output.emit(instructions ? { call: 'session.compact', instructions } : { call: 'session.compact' })
    return this.impl.sessionCompact(instructions)
  }
  commandRun(command: string, args?: string): Promise<CompactAnswer> {
    this.output.emit(args ? { call: 'command.run', command, args } : { call: 'command.run', command })
    return this.impl.commandRun(command, args)
  }
  promptSubmit(text: string, asUser?: boolean): Promise<CompactAnswer> {
    this.output.emit(asUser ? { call: 'prompt.submit', text, asUser } : { call: 'prompt.submit', text })
    return this.impl.promptSubmit(text, asUser)
  }
  trackOutput(): OutputTracker<HostCall> {
    return this.output.track()
  }
}

// ---- production: each wrapper over the engine's `$` ----
// Top-level functions, not static methods: `claude plugin validate` follows $
// only into functions declared at the top of a file.

export function createClock($: $): Clock {
  return new Clock({
    now: () => Date.now(),
    after: (ms, fn) => $.clock.after(ms, () => void Promise.resolve(fn()).catch(() => {})),
  })
}

export function createStore($: $): Store {
  return new Store({
    get: k => $.store.get(k),
    set: (k, v) => $.store.set(k, v),
    delete: k => $.store.delete(k),
  })
}

export function createFiles($: $): Files {
  return new Files({ exists: p => $.fs.exists(p), read: p => $.fs.read(p) })
}

export function createUi($: $): Ui {
  return new Ui({
    log: t => $.ui.log(t),
    toast: t => $.ui.toast(t),
    notify: (t, o) => $.ui.notify(t, o),
  })
}

export function createHost($: $): Host {
  return new Host({
    contextTokens: async () => (await $.session.usage()).context?.tokens,
    sessionCompact: i => $.session.compact(i ? { instructions: i } : undefined),
    commandRun: (command, args) => $.command.run(args ? { command, args } : { command }),
    promptSubmit: (text, asUser) => $.prompt.submit(asUser ? { text, asUser } : { text }),
  })
}

export function engine($: $) {
  return { clock: createClock($), store: createStore($), files: createFiles($), ui: createUi($), host: createHost($) }
}
