# pi-rules

[![ci](https://github.com/code-yeongyu/pi-rules/actions/workflows/ci.yml/badge.svg)](https://github.com/code-yeongyu/pi-rules/actions/workflows/ci.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![npm](https://img.shields.io/badge/npm-%40code--yeongyu%2Fpi--rules-red)](https://www.npmjs.com/package/@code-yeongyu/pi-rules)

Rule context loader for the [pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). Discovers rule files from `.omo/rules/`, `.claude/rules/`, `.cursor/rules/`, `.github/instructions/`, `AGENTS.md`, `CLAUDE.md`, and injects them into the agent context.

## Origin

pi-rules is inspired by [oh-my-openagent (omo)](https://github.com/code-yeongyu/oh-my-openagent) `.omo/rules/` and opencode's `AGENTS.md` / `CLAUDE.md` instruction file mechanisms.

- [omo](https://github.com/code-yeongyu/oh-my-openagent) at https://github.com/code-yeongyu/oh-my-openagent is by Yeongyu Kim, originally SUL-1.0.
- This package is an **independent** pi-coding-agent extension by the same author.
- Source distributed here is MIT (see [LICENSE](LICENSE) and [NOTICE](NOTICE)).
- The logic is structurally similar to omo's rules-injector hook, adapted to pi-mono's ExtensionAPI hooks (`before_agent_start`, `tool_result`).

## Quick Demo

```text
$ pi -e ./src/index.ts

[pi-rules] 5 active rules

> Read src/auth/login.ts

  ✓ src/auth/login.ts (1.2KB)

[pi-rules] +2 instructions injected (security.md, typescript.md)
```

## Installation

The package targets the [`pi`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) coding agent. Pi loads extensions from `~/.pi/agent/extensions/`, project `.pi/extensions/`, or via the `--extension` / `-e` CLI flag.

Pick whichever route fits:

```bash
# 1. From npm (once published)
pi install npm:@code-yeongyu/pi-rules

# 2. From git (once the repository is pushed)
pi install git:github.com/code-yeongyu/pi-rules

# 3. Manual placement (always works)
git clone https://github.com/code-yeongyu/pi-rules ~/.pi/agent/extensions/pi-rules
cd ~/.pi/agent/extensions/pi-rules && npm install

# 4. Dev / one-shot test
pi -e /path/to/pi-rules/src/index.ts
```

After installation, restart pi (or run `/reload` inside an interactive session).

## What gets loaded

### Project rule directories (recursive `*.md` / `*.mdc`)

| Directory | Style |
|-----------|-------|
| `.omo/rules/` | omo style |
| `.claude/rules/` | Claude Code style |
| `.cursor/rules/` | Cursor style |
| `.github/instructions/` | GitHub Copilot style (only `*.instructions.md`) |

These use **walk-up stack semantics**: from the target file's directory up to the project root, rules at every level are collected. Closer directories win in precedence.

**Monorepos / workspaces:** `findProjectRoot` stops at the innermost project marker, so a
target inside a workspace member (e.g. `crates/<member>/src/*.rs`, where each member has
its own `Cargo.toml`) would never reach workspace-level rule directories. For dynamic
(per-target) discovery the walk is therefore widened to the innermost enclosing **git
repository root** (`.git`): rules placed at the repository, workspace or member level all
participate, and each rule's globs match relative to the directory that owns the rule file
(a rule in `backend/.github/instructions/` matches `backend`-relative globs, a rule in the
repository root's `.github/instructions/` matches repo-relative globs). A `.git` in the
user's home directory (dotfiles repositories) is ignored. Static (session-level) discovery
is unchanged.

### Project single-file rules

| File | Style |
|------|-------|
| `.github/copilot-instructions.md` | GitHub Copilot |
| `AGENTS.md` | opencode style |
| `CLAUDE.md` | Claude Code style |
| `CONTEXT.md` | deprecated, still supported |

These use **first-match-wins** at the project root: `AGENTS.md` takes priority over `CLAUDE.md`, which takes priority over `CONTEXT.md`.

### User-home rules (always-on, distance 9999)

| Path | Type |
|------|------|
| `~/.omo/rules/` | directory |
| `~/.opencode/rules/` | directory |
| `~/.claude/rules/` | directory |
| `~/.config/opencode/AGENTS.md` | single-file |
| `~/.claude/CLAUDE.md` | single-file |

User-home rules are global and apply to every project with the lowest precedence.

## Rule format

Rules are Markdown files with an optional YAML frontmatter block:

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | Optional short description |
| `globs` | `string \| string[]` | Glob patterns; rule applies if target file matches any |
| `paths` | `string \| string[]` | Claude Code alias for globs (merged) |
| `applyTo` | `string \| string[]` | GitHub Copilot alias for globs (merged) |
| `alwaysApply` | `boolean` | If true, rule always applies regardless of target |

Example rule file:

```markdown
---
description: TypeScript-specific rules
globs: ["**/*.ts", "**/*.tsx"]
---

# TypeScript

Prefer `unknown` over `any`. Use exhaustive switch checks.
```

## Precedence and merging

Rules are ordered deterministically before injection:

1. **Local before global** — project rules outrank user-home rules.
2. **Closest distance first** — rules from directories nearer to the target file take priority.
3. **Source priority** — `.omo/rules` > `.claude/rules` > `.cursor/rules` > `.github/instructions` > `AGENTS.md` > `CLAUDE.md` > `CONTEXT.md` > user-home variants.
4. **Lexicographic `relativePath`** — final tiebreaker for same-source, same-distance rules.

Deduplication is in-memory per session by `realPath + content hash`. No filesystem persistence.

## Slash commands

| Command | Purpose |
|---------|---------|
| `/rules` | Summary of active rules |
| `/rules list` | List all rule files with paths |
| `/rules show <id>` | Show body of one rule |
| `/rules paths` | List absolute paths only |
| `/rules status` | Counts and warnings |
| `/reload-rules` | Rescan and clear injection cache |

All commands work in both UI and plain-text modes.

## TUI widget

On session start, a banner appears above the editor with a `[pi-rules]` prefix and a list of top rules. Active rules show a `●` indicator; rules with warnings show `⚠`. The banner dismisses on the first `before_agent_start` event.

A persistent status line reads `[pi-rules] N active` and updates as rules are discovered or rescanned.

## Configuration

### CLI flags

| Flag | Type | Default | Purpose |
|------|------|---------|---------|
| `pi-rules-disabled` | `boolean` | `false` | Disable all injection |
| `pi-rules-mode` | `string` | `both` | `static` \| `dynamic` \| `both` \| `off` |
| `pi-rules-widget` | `boolean` | `true` | Show banner and status line |

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `PI_RULES_DISABLED` | unset | If `1`, disables injection |
| `PI_RULES_MAX_RULE_CHARS` | `12000` | Per-rule body cap |
| `PI_RULES_MAX_RESULT_CHARS` | `40000` | Total injected per tool result |

## Trust model

Rule files are prompt and context input. Do NOT load untrusted repositories. All rule loading is local filesystem reads. There is no network or remote rule fetching.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No rules loaded | Verify `.omo/rules/`, `AGENTS.md`, etc. exist in the project root or ancestors. Run `/rules` to inspect. |
| Rule not matching | Check frontmatter `globs` / `paths` / `applyTo`. Confirm the target file path matches the glob. |
| Duplicate injection | Automatically deduplicated per session. Try `/reload-rules` to reset. |
| Extension not loaded | Confirm `pi.extensions` in your `package.json` or use `pi -e ./src/index.ts` for one-shot. |
| Context too large | Adjust `PI_RULES_MAX_RULE_CHARS` and `PI_RULES_MAX_RESULT_CHARS`. |
| TUI widget missing | Check `pi-rules-widget` flag is true and your terminal supports the relevant glyphs. |

## Development

```bash
git clone https://github.com/code-yeongyu/pi-rules
cd pi-rules
npm install            # install dev + peer deps
npm test               # 229 unit tests
npm run test:integration  # 43 integration tests
npm run typecheck      # tsc --noEmit
npm run check          # tsc + biome
pi -e ./src/index.ts   # smoke-test inside a real pi session
```

The test suite uses Vitest. Test descriptions follow `#given X #when Y #then Z` style; bodies use `// given / // when / // then` plain comments. No `any` in production code, no enums.

## License

[MIT](LICENSE). See [NOTICE](NOTICE) for re-license disclosure relative to omo.

## Related

- [senpi](https://github.com/code-yeongyu/senpi) — the fork/runtime these extensions are extracted from.
- [Ultraworkers Discord](https://discord.gg/PUwSMR9XNk) — community link from the senpi README.
- [Dori](https://sisyphuslabs.ai) — the product powered by senpi under the hood.

## Acknowledgements

- **Yeongyu Kim** ([@code-yeongyu](https://github.com/code-yeongyu)) — author of [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent) (origin of the rules-injection idea), and of this pi port.
- **Mario Zechner** ([@badlogic](https://github.com/badlogic)) — author of [pi-mono](https://github.com/badlogic/pi-mono) and the pi-coding-agent extension API this package targets.
- **opencode** — for the elegant `Instructions from: <path>` formatting convention adopted here.
