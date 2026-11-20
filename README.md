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
| `idle-compact__config` | Read or change settings, or reset them with `reset: true` |
| `idle-compact__status` | Show whether the timer is armed, when it fires next, the last outcome and the token count |
| `idle-compact__compact_after_turn` | Compact as soon as the current turn ends |

Settings, which persist across sessions:

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Master switch |
| `idleSeconds` | `1200` | How long to wait after a turn ends before compacting |
| `minTokens` | `100000` | Skip compaction when the context is smaller than this |
| `dryRun` | `false` | Only report what would happen |
| `instructions` | `""` | Optional focus for the compaction summary |
| `announce` | `log,toast,notify` | Where to announce: `log`, `toast`, `notify` (push), `prompt` (a message in the chat) |
| `afterPrompt` | `""` | For testing: text submitted after a compaction to wake Claude, so it can verify the result itself |

### Self-test without waiting

Ask Claude to set `idleSeconds: 5`, `minTokens: 0` and an `afterPrompt` such as "check status and reset config". Then end the turn. The mod compacts, wakes Claude, and Claude restores the defaults.

## Notes

- It works in headless and cloud sessions, where `$.session.compact` isn't available: there it falls back to running the `compact` command.
