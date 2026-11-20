# docs/humans/gen

One small generator per diagram kind. Each reads a tiny text DSL and writes a self-contained `.html` page (inline SVG, styles from `docs/style/style.css`, an expandable "How to read this diagram" key, and the source) and a standalone `.svg` next to the source. Zero dependencies; `lib.mjs` holds the shared page shell.

```sh
node docs/humans/gen/overview.mjs docs/humans/diagrams/overview.parts     # the big picture: parts and numbered steps
node docs/humans/gen/zones.mjs  docs/humans/diagrams/why.zones             # yes/no table over a threshold plot
node docs/humans/gen/layers.mjs docs/humans/diagrams/config.layers         # config layers, merged per field
node docs/humans/gen/tiers.mjs  docs/humans/diagrams/architecture.tiers    # boxes in rows, with arrows
node docs/humans/gen/states.mjs docs/humans/diagrams/timer.states          # state machine on a grid
```

The syntax of each DSL is in the comment at the top of its generator. Timelines use `docs/tools/marble.mjs` instead. `sh docs/humans/gen/all.sh` regenerates everything. Every page ends with links to its SVG, its source and the other diagrams; that list lives in `docs/style/nav.mjs`.
