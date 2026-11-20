// Links every diagram page carries: its own SVG and source, the docs, and the other diagrams.
// Shared by docs/humans/gen/lib.mjs and docs/tools/marble.mjs. Paths are relative to docs/.
import { posix } from 'node:path'

export const REPO = 'https://github.com/nitsanavni/claude-code-idle-compact'

export const PAGES = [
  ['humans/diagrams/story.html', 'Story 1: you step away'],
  ['humans/diagrams/story-2.html', 'Story 2: Claude compacts itself'],
  ['humans/diagrams/overview.html', 'Overview'],
  ['humans/diagrams/why.html', 'Why it exists'],
  ['humans/diagrams/timer.html', 'The timer'],
  ['humans/diagrams/config.html', 'Settings'],
  ['humans/diagrams/architecture.html', 'Code architecture'],
  ['diagrams/a-idle-compact.html', 'Timeline: idle, then compacted'],
  ['diagrams/b-user-returns.html', 'Timeline: coming back early'],
  ['diagrams/c-small-context-skip.html', 'Timeline: too small to compact'],
  ['diagrams/d-compact-after-turn.html', 'Timeline: compacting on request'],
]

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** `self` is the page's path under docs/ (e.g. humans/diagrams/why.html); `srcExt` its source extension (e.g. .zones). */
export function nav(self, srcExt) {
  const dir = posix.dirname(self), base = posix.basename(self, '.html')
  const rel = p => posix.relative(dir, p)
  const others = PAGES.map(([p, label]) => p === self ? `<b>${esc(label)}</b>` : `<a href="${esc(rel(p))}">${esc(label)}</a>`)
  return `<nav class="more">
<p><i>This diagram</i><span><a href="${esc(base)}.svg">as an SVG</a> · <a href="${REPO}/blob/main/docs/${esc(dir)}/${esc(base)}${esc(srcExt)}">its source on GitHub</a></span></p>
<p><i>More diagrams</i><span>${others.join(' · ')}</span></p>
<p><i>The project</i><span><a href="${REPO}#readme">idle-compact on GitHub</a> · <a href="${REPO}/blob/main/docs/humans/README.md">docs for people</a></span></p>
</nav>`
}

/** The page's path under docs/, from a file path on disk. */
export const selfPath = file => { const p = file.split(posix.sep).join('/'); const i = p.lastIndexOf('docs/'); return (i < 0 ? p : p.slice(i + 5)).replace(/\.[^./]+$/, '.html') }
