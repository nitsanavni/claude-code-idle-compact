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

// ---- layers: defaults < userConfig < project file < live tool changes ----

/** The project's config file, relative to the session's working directory; meant to be committed. */
export const PROJECT_FILE = '.claude/idle-compact.json'

export type Layers = {
  userConfig: Partial<Config> // plugin options, from settings.json pluginConfigs
  projectFile: Partial<Config> // PROJECT_FILE
  live: Partial<Config> // changes made with the config tool, kept in $.store
}

export function resolve(layers: Layers): Config {
  return merge(layers.userConfig, layers.projectFile, layers.live)
}

/** What in `raw` is ignored and why: unknown keys and wrong types. */
export function problems(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['not a JSON object']
  const out: string[] = []
  for (const [k, v] of Object.entries(raw)) {
    if (!(k in DEFAULTS)) out.push(`unknown key ${k}`)
    else if (typeof v !== typeof DEFAULTS[k as keyof Config]) out.push(`${k} should be a ${typeof DEFAULTS[k as keyof Config]}`)
  }
  return out
}

/** The project file's layer, and a note on anything in it that was ignored. */
export function parseProjectFile(text: string | undefined): { layer: Partial<Config>; error?: string } {
  if (text === undefined) return { layer: {} }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (err) {
    return { layer: {}, error: `${PROJECT_FILE}: invalid JSON (${String(err).slice(0, 120)})` }
  }
  const p = problems(raw)
  return p.length ? { layer: pick(raw), error: `${PROJECT_FILE}: ignored ${p.join(', ')}` } : { layer: pick(raw) }
}

// Up to 0.5.x the store held the whole config under "config", defaults included.
// Keep only what the person changed: a field at any former default is dropped,
// so it follows today's defaults and the other layers.
const FORMER_DEFAULTS: Partial<Record<keyof Config, unknown[]>> = {
  idleSeconds: [50 * 60, 20 * 60],
  minTokens: [100_000, 120_000],
}

export function fromLegacy(stored: unknown): Partial<Config> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(pick(stored)) as [keyof Config, unknown][]) {
    const former = FORMER_DEFAULTS[k] ?? [DEFAULTS[k]]
    if (!former.includes(v)) out[k] = v
  }
  return out as Partial<Config>
}
