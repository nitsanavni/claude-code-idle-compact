# Configuration

Seven settings control the mod. You will rarely need more than the first three.

| Setting | Default | What it does |
| --- | --- | --- |
| `idleSeconds` | `1200` (20 min) | How long to wait after a turn ends |
| `minTokens` | `120000` | Leave smaller conversations alone |
| `minGrowth` | `40000` | After a compaction, wait until the conversation has grown this much again |
| `enabled` | `true` | The master switch |
| `dryRun` | `false` | Say what would happen, but don't compact |
| `announce` | `log,toast,notify` | How you hear about a compaction: `log`, `toast`, `notify` (a push notification), `prompt` (a message in the chat) |
| `instructions` | `""` | What the compaction summary should focus on |
| `afterPrompt` | `""` | For testing: a message sent after a compaction to wake Claude |

## Four layers

A setting can be set in four places. Each one overrides the ones before it, one setting at a time:

1. **Defaults**, the table above.
2. **Plugin options**: in `/config`, or under `pluginConfigs` in `settings.json`. Use these for your personal defaults.
3. **The project file** `.claude/idle-compact.json`. Commit it to share settings with everyone working in the repo.
4. **Live changes**: ask Claude, and it uses the `config` tool. These are yours alone, kept outside git, and they apply in every project until you ask Claude to reset them.

![Which setting wins: four config layers, in order of precedence](diagrams/config.svg)

[Open the interactive page](https://raw.githack.com/nitsanavni/claude-code-idle-compact/main/docs/humans/diagrams/config.html)

## Try it

Ask Claude for the status to see every layer and the result. To check that compaction works without waiting 20 minutes, ask Claude to set `idleSeconds` to 5, `minTokens` to 0, and an `afterPrompt` such as "check status and reset config", then end the turn.
