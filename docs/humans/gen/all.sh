#!/bin/sh
# Regenerate every human-facing diagram. Run from the repo root.
set -e
d=docs/humans/diagrams
node docs/humans/gen/overview.mjs $d/overview.parts
node docs/humans/gen/zones.mjs    $d/why.zones
node docs/humans/gen/layers.mjs   $d/config.layers
node docs/humans/gen/tiers.mjs    $d/architecture.tiers
node docs/humans/gen/states.mjs   $d/timer.states
node docs/tools/marble.mjs docs/diagrams/*.marble
