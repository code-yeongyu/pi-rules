# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-09-24

### Added

- Native `.pi/rules/` and `~/.pi/rules/` sources, matching the existing project/user-home directory pattern (fixes #11).
- Monorepo / Cargo-workspace support for dynamic rule discovery: the per-target project
  root is widened to the enclosing git repository root (`widenToRepositoryRoot`). Target
  files inside workspace members (nested `Cargo.toml`/`package.json` markers) now discover
  `.github/instructions/` rule directories from the workspace and repository levels as
  well; each rule's glob semantics stay keyed to the directory owning the rule file via the
  scopeRelative path base. Static (always-on) discovery is unchanged. Thanks @tradem (#31).
- Native context dedup in the `tool_result` path: single-file rules (AGENTS.md/CLAUDE.md)
  that pi already loaded natively into the system prompt are no longer re-injected per
  matching file read when dynamic discovery walks to the repository root.
- Matcher cache reset and stats helpers for deterministic cache verification.

### Changed

- Dev and CI toolchain is Bun 1.4.2 (`bun install --frozen-lockfile`, `bun run check`, `bun run test`) with an `npm-consumer` job (`npm ci && npm test`). Actions use `actions/checkout@v7`, `actions/setup-node@v7`, and `oven-sh/setup-bun@v2`.
- Peer dependencies are `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` at `*` (never `^0.87`). Tests pin those packages at `0.87.1`. `typebox` is a devDependency, not a peer.
- Exact devDependency pins: `@biomejs/biome` 2.5.14, `vitest` 5.0.1, `typescript` 7.0.2, `@types/node` 26.6.2, `@typescript/native-preview` 7.0.0-dev.20260707.2.
- `picomatch` 4.0.7 (from 4.0.5 resolved).
- Glob matching now reuses a bounded compiled matcher cache instead of recompiling picomatch patterns for every file.
- Dynamic rule loading now deduplicates repeated target paths and rule-file parsing work.

### Fixed

- Documented `PI_RULES_DISABLED`, `PI_RULES_MAX_RULE_CHARS`, and `PI_RULES_MAX_RESULT_CHARS` environment variables are now read at extension registration; previously nothing in `src/` consulted `process.env`, so setting them had no effect.
- `findProjectRoot` no longer loops forever when the target path is on a different Windows drive than the process cwd (or on a UNC share): the walk now stops when `dirname()` stops progressing instead of only at `resolve("/")`. Thanks @lavi-kj (#19).
- Dynamic rule injection now dedupes by rule across the session instead of per tool call, preventing repeated nested `AGENTS.md`/`CLAUDE.md` instruction blocks on subsequent reads.
- Dynamic injection now skips rules already injected statically or already loaded by pi's native context loader.
- Dynamic rule loading now preserves each target file's project root so nested projects load their nearest rules correctly.

## [0.1.0] - 2026-04-29

### Added

- Initial pi coding-agent extension that injects rules into the agent's system prompt and tool results.
- Rule discovery from `.omo/rules/`, `.claude/rules/`, `.cursor/rules/`, `.github/instructions/`, `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, plus user-home equivalents.
- YAML frontmatter parser supporting `description`, `globs`, `paths` (Claude alias), `applyTo` (Copilot alias), `alwaysApply`.
- Glob matcher with picomatch, normalization of all glob aliases.
- Walk-up project rule discovery from cwd to project root with deterministic precedence ordering.
- In-memory deduplication via realPath + SHA-256 content hash, scoped per session for static and per toolCallId for dynamic.
- `before_agent_start` hook for static rule injection (only `single-file` and `alwaysApply` rules).
- `tool_result` hook for dynamic per-file rule injection on `read`, `edit`, `write` tool results.
- `session_start` hook to reset state and audit via `pi.appendEntry("pi-rules.scan", ...)`.
- Plain-text injection format with `Instructions from: <path>` prefix (opencode style).
- Char-budget truncation: 12,000 per rule, 40,000 per tool result, configurable via env vars.
- TUI banner widget shown on session start (component-based, dismissed on first `before_agent_start`).
- Persistent status line via `ctx.ui.setStatus("pi-rules", text)`.
- Slash commands: `/rules`, `/rules list`, `/rules show <id>`, `/rules paths`, `/rules status`, `/reload-rules`.
- CLI flags: `pi-rules-disabled`, `pi-rules-mode` (`static`/`dynamic`/`both`/`off`), `pi-rules-widget`.
- Dedup against pi-mono native context loader via `event.systemPromptOptions.contextFiles`.
- 229 unit tests + 43 integration tests against a realistic sample-project fixture.
- MIT-licensed source with NOTICE clarifying omo (SUL-1.0) inspiration.
