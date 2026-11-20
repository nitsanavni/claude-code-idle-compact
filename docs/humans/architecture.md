# Architecture

The mod is about 700 lines of TypeScript in `hooks/`, split so that every decision can be tested without Claude Code running.

![A small, testable core between two thin layers](diagrams/architecture.svg)

[Open the interactive page](https://raw.githack.com/nitsanavni/claude-code-idle-compact/main/docs/humans/diagrams/architecture.html)

- **Wiring** (`register.ts`, `tools.ts`) listens to Claude Code: a turn started, a turn ended, a tool was called. It passes each event to the core and decides nothing.
- **The core** (`core.ts`, `config.ts`) holds all the logic: when to start and stop the countdown, which settings apply, whether the conversation is big enough, and how to compact.
- **Infrastructure** (`infra.ts`) is five small wrappers, one per outside thing: the clock, the plugin's store, files, the UI and the host session. Each can be made for real (`create`) or as a stand-in (`createNull`) that answers from memory and records what it was asked to do.

The tests build the real core on top of the stand-ins and move a fake clock forward, so twenty minutes pass in a millisecond. This style is called Nullables, from James Shore's "Testing Without Mocks".
