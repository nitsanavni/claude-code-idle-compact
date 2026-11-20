# idle-compact, for people

idle-compact is a Claude Code mod. When you step away from a conversation, it compacts it for you, so the next message you send starts from a small, fresh context instead of re-reading a large one.

## Why

A long conversation is expensive to come back to. Claude Code caches the prompt while you work, but the cache goes cold when you are away, and then your next message pays to re-read every token of the conversation. Compacting first replaces that history with a short summary.

Claude Code already compacts idle conversations on its own, but late: only after about 54 quiet minutes, and only once the context reaches 200k tokens. In cloud sessions it doesn't do it at all. idle-compact does it after 20 minutes, from 120k tokens, in local and cloud sessions alike.

![When an idle conversation gets compacted](diagrams/why.svg)

[Open the interactive page](https://raw.githack.com/nitsanavni/claude-code-idle-compact/main/docs/humans/diagrams/why.html)

## Read more

- [Configuration](configuration.md): the settings, and the four places they come from.
- [The timer](timer.md): what happens between a turn ending and a compaction.
- [Architecture](architecture.md): how the code is split, and why that makes it easy to test.

Every diagram has a page with a "How to read this diagram" key. The pages are made from small text sources by the scripts in [gen/](gen/README.md).
