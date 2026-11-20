# docs/tools

`marble.mjs` turns an ASCII marble diagram into a calm HTML page and a standalone SVG, styled by `../style/style.css`. Zero dependencies.

```sh
node docs/tools/marble.mjs docs/diagrams/*.marble   # writes <name>.html and <name>.svg next to each source
node --test docs/tools/marble.test.mjs
```

The `.marble` source is the DSL and stays readable as plain ASCII, so agents can read it as is:

```
title:   ...            caption: ...            note: ...
focus:   C              the one moment that matters: its first marble gets a soft halo (optional)
break:   +10 min        label for the next time break, left to right (optional, repeatable)
term:    Word — meaning  a word the diagram uses, explained in "How to read this diagram" (optional, repeatable)
time        0  5m ≈ 20m axis labels sit at their column (a ≈ here is ignored, just for alignment)
claude   -S~E----≈----  lane name, 2+ spaces, marbles (all lanes share one origin column)
timer       [====≈==F
legend
S  turn.start  blue     <symbol>  <label[ — sub]>  [hue]
```

Hues have fixed roles across all diagrams: `blue` user, `violet` timer, `green` compact fired, `coral` cancel, `amber` warning/threshold, `teal` system; `mute` and `ink` are neutral (`sky sage sand rose plum` still work as older names). A one-letter event symbol is printed inside its marble, and again in the legend, so a reader can look each letter up. The page shows an always-visible legend row under the figure, plus the expandable "How to read this diagram".

Detail levels: the page opens at **Schematic** (no words at all: just lanes and beads, with a span drawn as a bolder stretch of its lane line, not a bar) and a four-button control steps to **Simple** (adds lane names, a letter in each marble, spans as filled bars, and the legend row), **More** (adds each marble's name, span labels and the time axis) and **Full** (adds the `— sub` line under each name, and the note). Nothing in the source chooses a level: a label is level 2, its sub is level 3. The SVG is drawn once, at full detail; each lane carries its place at every level as CSS variables, and the rules under "detail levels" in `style.css` move the lanes and fade the marks, so the change is animated without any JavaScript. The standalone `.svg` is always full detail.

Marbles: `-` time passes, space = lane idle, `|` lane ends, `[` opens a span, `=`/`~` span fill (its legend entry names the span), `]` closes it, `x` cancels it, `>` means it runs on, any other character is an event. An event closes an open span, and opens one when fill follows it (`S~~E`).

Time breaks: a column of `≈`, aligned across every lane (an idle lane may have a space there instead), skips ahead. The axis is compressed at the break, so it renders as a narrow gap cut through each lane with a slanted `//`, and the matching `break:` label sits above it with the ticks. A span that crosses a break (`[===≈===]`) is drawn cut in two. Any other mark in a break column is an error. When a diagram uses a break, "How to read this diagram" explains it.
