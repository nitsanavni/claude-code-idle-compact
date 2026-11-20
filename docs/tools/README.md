# docs/tools

`marble.mjs` turns an ASCII marble diagram into a calm HTML page and a standalone SVG, styled by `../style/style.css`. Zero dependencies.

```sh
node docs/tools/marble.mjs docs/diagrams/*.marble   # writes <name>.html and <name>.svg next to each source
node --test docs/tools/marble.test.mjs
```

The `.marble` source is the DSL and stays readable as plain ASCII, so agents can read it as is:

```
title:   ...            caption: ...            note: ...
time        0    5m     axis labels sit at their column
claude   -S~E-------    lane name, 2+ spaces, marbles (all lanes share one origin column)
timer       [====F
legend
S  turn.start  plum     <symbol>  <label[ — sub]>  [hue: ink sky sage sand rose plum mute]
```

Marbles: `-` time passes, space = lane idle, `|` lane ends, `[` opens a span, `=`/`~` span fill (its legend entry names the span), `]` closes it, `x` cancels it, `>` means it runs on, any other character is an event. An event closes an open span, and opens one when fill follows it (`S~~E`).
