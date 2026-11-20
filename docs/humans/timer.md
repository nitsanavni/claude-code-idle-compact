# The timer

The mod waits for quiet. When a turn ends it starts a countdown; when you send a new message, the countdown stops. If the countdown runs out, the mod checks how big the conversation is, and compacts it only if it is at least `minTokens`.

![The timer, from turn to compaction](diagrams/timer.svg)

[Open the interactive page](https://raw.githack.com/nitsanavni/claude-code-idle-compact/main/docs/humans/diagrams/timer.html)

A few details:

- Only your main conversation counts. Subagents working in the background don't start or stop the timer.
- Changing a setting restarts the countdown with the new value.
- You can also ask Claude to "compact after this turn". It compacts a second after the turn ends, whatever the size, even in a dry run.
- After compacting, the mod tells you with a toast, a log line and a push notification (see `announce`).

## The same story over time

These timelines show the timer minute by minute, in four situations:

- [Twenty quiet minutes, then a compact](../diagrams/README.md#twenty-quiet-minutes-then-a-compact)
- [Coming back early cancels the timer](../diagrams/README.md#coming-back-early-cancels-the-timer)
- [A small context is left alone](../diagrams/README.md#a-small-context-is-left-alone)
- [Compacting on request, right after the turn](../diagrams/README.md#compacting-on-request-right-after-the-turn)
