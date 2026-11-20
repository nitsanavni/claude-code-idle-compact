// Pure config logic: defaults, validation and merging. No I/O here.

export type Config = {
  enabled: boolean
  idleSeconds: number // wait after a turn ends before compacting
  minTokens: number // skip when context is smaller than this
  dryRun: boolean // true: only report what would happen
  instructions: string // optional focus for the summary
  announce: string // comma list of where to show "compacted": log,toast,notify,prompt (prompt = a message in the stream that starts a short turn)
  afterPrompt: string // testing: if set, submitted (as the plugin) after a compaction, to wake Claude
}

export const DEFAULTS: Config = {
  enabled: true,
  idleSeconds: 20 * 60,
  minTokens: 120_000,
  dryRun: false,
  instructions: '',
  announce: 'log,toast,notify',
  afterPrompt: '',
}

export const KEYS = Object.keys(DEFAULTS) as (keyof Config)[]

/** The known fields of `raw` whose type matches the default's; everything else is dropped. */
export function pick(raw: unknown): Partial<Config> {
  const out: Record<string, unknown> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k of KEYS) {
    const v = (raw as Record<string, unknown>)[k]
    if (v !== undefined && typeof v === typeof DEFAULTS[k]) out[k] = v
  }
  return out as Partial<Config>
}

/** Later layers win, field by field. */
export function merge(...layers: Partial<Config>[]): Config {
  return Object.assign({ ...DEFAULTS }, ...layers.map(pick))
}

/** The live layer after a `config` tool call: `reset` clears it, then the given fields are set. */
export function applyChange(live: Partial<Config>, input: Record<string, unknown>): Partial<Config> {
  return { ...(input.reset ? {} : pick(live)), ...pick(input) }
}

/** The announce channels as a set: "log, toast" -> {log, toast}. */
export function channels(announce: string): Set<string> {
  return new Set(announce.split(',').map(x => x.trim()))
}
