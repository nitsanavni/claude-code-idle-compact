# Docs

## For people

- [What idle-compact is, and why](humans/README.md): start here, with [the story](https://raw.githack.com/nitsanavni/claude-code-idle-compact/main/docs/humans/diagrams/story.html) and the [overview diagram](https://raw.githack.com/nitsanavni/claude-code-idle-compact/main/docs/humans/diagrams/overview.html)
- [Configuration](humans/configuration.md)
- [The timer](humans/timer.md)
- [Architecture](humans/architecture.md): the code's internals
- [Timelines](diagrams/README.md): the timer, minute by minute

## For agents building the repo

- [Agent guide](agents/README.md): purpose, architecture, config layers, timer lifecycle, testing
- [AGENTS.md](../AGENTS.md): working rules (commits, tests first, layout)

## Diagram tooling

- [style/style.css](style/style.css): the shared look
- [tools/](tools/README.md): `marble.mjs`, ASCII timelines to HTML and SVG
- [humans/gen/](humans/gen/README.md): generators for the other human-facing diagrams
