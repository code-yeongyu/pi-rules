# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Monorepo / Cargo-workspace support for dynamic rule discovery: the per-target project
  root is widened to the enclosing git repository root (`widenToRepositoryRoot`). Target
  files inside workspace members (nested `Cargo.toml`/`package.json` markers) now discover
  `.github/instructions/` rule directories from the workspace and repository levels as
  well; each rule's glob semantics stay keyed to the directory owning the rule file via the
  scopeRelative path base. Static (always-on) discovery is unchanged.
- Native context dedup in the `tool_result` path: single-file rules (AGENTS.md/CLAUDE.md)
  that pi already loaded natively into the system prompt are no longer re-injected per
  matching file read when dynamic discovery walks to the repository root.
### Added

- Matcher cache reset and stats helpers for deterministic cache verification.

### Changed

- Glob matching now reuses a bounded compiled matcher cache instead of recompiling picomatch patterns for every file.
- Dynamic rule loading now deduplicates repeated target paths and rule-file parsing work.

### Fixed

- Documented `PI_RULES_DISABLED`, `PI_RULES_MAX_RULE_CHARS`, and `PI_RULES_MAX_RESULT_CHARS` environment variables are now read at extension registration; previously nothing in `src/` consulted `process.env`, so setting them had no effect.
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
