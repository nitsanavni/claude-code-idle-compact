# AGENTS.md

Notes for agents building this repo.

## What it is

`idle-compact`, a Claude Code mod (a plugin with a function-hooks module). It runs `/compact` after the session has been idle for a while, before the prompt cache expires. It gives Claude three MCP tools: `config`, `status` and `compact_after_turn`. README.md is the user-facing doc.

## Validate and test

```sh
claude plugin validate .   # manifest + hooks module, the way the engine reads them
claude plugin test .       # runs every *.test.ts under the folder
```

- Tests import `test`, `expect`, `mock` from `claude-code/testing`. They run in the hooks sandbox: no Node, no fs, no network.
- A test can import the plugin's own pure modules directly, for example `import { merge } from '../hooks/config'`. Leave off the `.ts` extension: validate's type check flags `.ts` paths (TS5097).
- An integration test drives the real plugin through the test `$`. Hooks registered with the test's `on` stand for the engine, and `mock.clock` / `mock.store` answer those nouns from memory.
- The API reference is in the plugin-authoring skill (`reference.md`, `types/claude-code.d.ts`). The `.d.ts` is the authority.
- CI (`.github/workflows/ci.yml`) runs gitleaks, validate and test on every push.

## Layout

```
.claude-plugin/plugin.json       manifest: version, userConfig fields
.claude-plugin/marketplace.json  makes the repo installable
hooks/hooks.json                 names the hooks module
hooks/register.ts                thin wiring: engine events -> core
hooks/tools.ts                   MCP tool definitions
hooks/core.ts                    IdleCompact: timer state machine, gate, compaction, outcome reporting
hooks/config.ts                  pure config: defaults, validation, layer merge, live changes
hooks/infra.ts                   Nullable wrappers around $ (clock, store, files, ui, host)
test/                            unit tests (core, config) and a thin integration test
```

## How to work here

- Push small and often, straight to `main`. No PRs, no branches. Run `git pull --rebase origin main` before every push.
- Fix forward. Don't revert.
- Write tests first. Use Nullables (James Shore, "Testing Without Mocks"), not mocks: each wrapper in `infra.ts` has `create()` for production and `createNull()` with configurable responses and output tracking. Tests are sociable: the real core runs over nulled infrastructure.
  See the Nullables skill: https://github.com/lexler/skill-factory/blob/main/testing/nullables/SKILL.md, and James Shore, "Testing Without Mocks": https://www.jamesshore.com/v2/projects/nullables/testing-without-mocks
- Keep logic out of `register.ts` and out of the wrappers. Any decision the mod makes belongs in `core.ts` or `config.ts`, where tests can reach it.
- Use sub-agents for independent work, such as research or a separate file.
- Bump `version` in `.claude-plugin/plugin.json` for a release. Installed copies only update when it changes.
- Commit trailer:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
