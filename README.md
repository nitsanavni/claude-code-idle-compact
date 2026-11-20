# idle-compact

A Claude Code mod that compacts the conversation after you've been idle for a while, before the prompt cache expires. When you come back, the next turn starts from a small, fresh context instead of re-reading a large, uncached one.

## Install

```
/plugin install idle-compact --marketplace nitsanavni/claude-code-idle-compact
```

## How it works

- When a turn ends, the mod starts a timer. By default it waits 20 minutes.
- When the timer fires, the mod checks the context size. If the context is at least `minTokens`, it runs `/compact`.
- It then announces the compaction with a toast, a log line and a push notification, so you can see it happened.
- Starting a new turn resets the timer.

## Tune it live

Claude gets three tools, and changes take effect immediately:

| Tool | What it does |
| --- | --- |
| `idle-compact__config` | Read or change settings, or drop your live changes with `reset: true` |
| `idle-compact__status` | Show the config and each layer it came from, whether the timer is armed, when it fires next, the last outcome and the token count |
| `idle-compact__compact_after_turn` | Compact as soon as the current turn ends |

Settings:

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Master switch |
| `idleSeconds` | `1200` | How long to wait after a turn ends before compacting |
| `minTokens` | `120000` | Skip compaction when the context is smaller than this |
| `dryRun` | `false` | Only report what would happen |
| `instructions` | `""` | Optional focus for the compaction summary |
| `announce` | `log,toast,notify` | Where to announce: `log`, `toast`, `notify` (push), `prompt` (a message in the chat) |
| `afterPrompt` | `""` | For testing: text submitted after a compaction to wake Claude, so it can verify the result itself |

## Where settings come from

Each layer overrides the one before it, field by field:

1. **Defaults**, the table above.
2. **Plugin options** (`userConfig`): set them in `/config`, or under `pluginConfigs` in `settings.json`. `afterPrompt` isn't an option. An empty string option counts as unset.
3. **Project file** `.claude/idle-compact.json`, relative to the session's working directory. Commit it to share settings with the repo. The mod re-reads it at every arm and fire, so edits apply on the next turn end.
   ```json
   { "idleSeconds": 900, "minTokens": 150000 }
   ```
   Unknown keys and wrong types are ignored, and `status` shows them as `configError`.
4. **Live changes** made with the `config` tool. They are saved in the plugin's store, per user and outside git, and they apply in every project. `reset: true` clears them and leaves layers 1 to 3 in place.

Not supported:
- A user-level file such as `~/.claude/idle-compact.json`. Use the plugin options for that.
- Searching parent directories for the project file, cosmiconfig style.
- Having the `config` tool write the project file. Copy the values from `status` into the file yourself.

Upgrading from 0.5.x: a config saved by the old `config` tool is moved over once, and only the fields you changed are kept.

### Self-test without waiting

Ask Claude to set `idleSeconds: 5`, `minTokens: 0` and an `afterPrompt` such as "check status and reset config". Then end the turn. The mod compacts, wakes Claude, and Claude clears the live changes.

## Notes

- It works in headless and cloud sessions, where `$.session.compact` isn't available: there it falls back to running the `compact` command.

## Development

`claude plugin validate .` and `claude plugin test .`. The logic is a pure core (`hooks/core.ts`, `hooks/config.ts`) over Nullable wrappers around the engine (`hooks/infra.ts`), and it is tested without mocks. See [AGENTS.md](AGENTS.md).

## Security & CI

A gitleaks pre-commit hook blocks commits that contain secrets (default rules plus a high-entropy string rule, see `.gitleaks.toml`). Install [gitleaks](https://github.com/gitleaks/gitleaks/releases) v8+, then enable the hook once per clone:

```sh
scripts/setup-hooks.sh   # git config core.hooksPath .githooks
```

CI (`.github/workflows/ci.yml`) scans the full history with gitleaks and runs `claude plugin validate .` and `claude plugin test .` on every push to `main` and on pull requests.
