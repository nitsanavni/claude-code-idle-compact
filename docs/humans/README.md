# idle-compact, for people

idle-compact is a Claude Code mod. When you step away from a conversation, it compacts it for you, so the next message you send starts from a small, fresh context instead of re-reading a large one.

## The story

![Use Claude Code in the cloud without paying to re-read a big conversation](diagrams/story.svg)

[Open the interactive page](https://raw.githack.com/nitsanavni/claude-code-idle-compact/main/docs/humans/diagrams/story.html)

A second story, where nobody steps away: Claude compacts its own context when a piece of work is done.

![Claude can compact its own context when a piece of work is done](diagrams/story-2.svg)

[Open the interactive page](https://raw.githack.com/nitsanavni/claude-code-idle-compact/main/docs/humans/diagrams/story-2.html)

## The big picture

![idle-compact at a glance: the parts, and how they work together](diagrams/overview.svg)

[Open the interactive page](https://raw.githack.com/nitsanavni/claude-code-idle-compact/main/docs/humans/diagrams/overview.html), which explains every word in the picture.

## Why

Claude Code can compact a conversation that has sat idle, but only when it runs on your computer. In cloud sessions that feature is switched off, so an idle conversation there is never compacted. idle-compact was built to fill that gap: it brings idle compaction to cloud sessions, and it works the same way on your computer.

It also steps in sooner. Claude Code's own idle compaction waits for about 54 quiet minutes and a 200k-token conversation; idle-compact acts after 20 minutes, from 120k tokens.

![Idle compaction for cloud sessions, where Claude Code leaves it off](diagrams/why.svg)

[Open the interactive page](https://raw.githack.com/nitsanavni/claude-code-idle-compact/main/docs/humans/diagrams/why.html)

Why compact an idle conversation at all? A long conversation is expensive to come back to. Claude Code caches the prompt while you work, but the cache goes cold when you are away, and then your next message pays to re-read every token of the conversation. Compacting first replaces that history with a short summary.

## Read more

- [Configuration](configuration.md): the settings, and the four places they come from.
- [The timer](timer.md): what happens between a turn ending and a compaction.
- [Architecture](architecture.md): the internals, how the code is split, and why that makes it easy to test.

Every diagram has a page with a "How to read this diagram" key. The pages are made from small text sources by the scripts in [gen/](gen/README.md).
