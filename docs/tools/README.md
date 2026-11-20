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

Views: every mark on a timeline belongs to a **part** that the page can show or hide: `drawn` (off shows the **text** view: the source itself with the words taken out, monospace rows of `-` for a lane, `●` for a marble, a bold run of `=` for a span, `≈` for a time break), `ticks`, `bars` (off draws a span as a bolder stretch of its lane line), `letters`, `lanes` (lane names), `legend`, `names`, `axis`, `grid`, `details` (the `— sub` lines and the focus halo) and `note`. Above the figure, five **Detail** presets (Text, Schematic, Simple, More, Full; each adds to the one before, and Text and Schematic keep lane names but no other words) set the parts, and a row of **Show** switches turns single parts on and off. The page opens at Text.

The spacing follows the parts that are on: beads only pack tight, bars need a little more, names more again, detail lines the most; the time axis takes its room on top only when shown, and without lane names the lanes move into the left margin. The SVG is drawn once, in full; each lane carries its place in every layout as CSS variables, and the rules under "parts" in `style.css` pick the layout and fade the marks, so every change is animated by CSS alone. A small inline script only makes the presets set the switches and keeps the view in the URL: `#level=schematic&parts=grid,-ticks` is the Schematic preset with the grid on and the ticks off, so any view can be linked. The standalone `.svg` is always the full view.

Marbles: `-` time passes, space = lane idle, `|` lane ends, `[` opens a span, `=`/`~` span fill (its legend entry names the span), `]` closes it, `x` cancels it, `>` means it runs on, any other character is an event. An event closes an open span, and opens one when fill follows it (`S~~E`).

Time breaks: a column of `≈`, aligned across every lane (an idle lane may have a space there instead), skips ahead. The axis is compressed at the break, so it renders as a narrow gap cut through each lane with a slanted `//`, and the matching `break:` label sits above it with the ticks. A span that crosses a break (`[===≈===]`) is drawn cut in two. Any other mark in a break column is an error. When a diagram uses a break, "How to read this diagram" explains it.
