# AGENTS.md

Project rules for `pi-rules` itself.

## Code style

- TypeScript strict mode (`noUncheckedIndexedAccess`, `strict: true`).
- NO `any` in `src/` (production). Use `unknown` and narrowing.
- Imports use `.js` extension for project files (Node16 module resolution).
- Tabs (`indentWidth: 3`), 120-char line width, biome-formatted.
- ESM only (`"type": "module"`).

## Test conventions

- Vitest, real temp filesystem via `test/helpers/temp-fs.ts` for fs-touching tests.
- Naming: `it("#given X #when Y #then Z")` with `// given / // when / // then` body comments.
- NO test deletion or skipping.
- NO writes to real `~/.pi`. Use injectable home dir.
- NO network access.

## Architecture

- `src/rules/` — pure logic units (parser, matcher, scanner, finder, ordering, cache, formatter, truncator, project-root, tool-paths) and orchestrating `engine.ts` (uses dependency injection).
- `src/ui/` — TUI components (rules-banner, dynamic-border).
- `src/commands.ts` — slash command handlers.
- `src/index.ts` — `default function piRulesExtension(pi: ExtensionAPI): void` factory; registers flags + hooks + commands.

## When adding a new rule source

1. Add the path/extension to `src/rules/constants.ts` (`PROJECT_RULE_SUBDIRS` or `PROJECT_SINGLE_FILES` or `USER_HOME_RULE_SUBDIRS`).
2. Update `RuleSource` union in `src/rules/types.ts`.
3. Add `SOURCE_PRIORITY` entry.
4. Update `findRuleCandidates` in `src/rules/finder.ts` if discovery semantics differ.
5. Add tests covering the new source in `test/finder.test.ts` and the integration tests.
6. Update `README.md` "What gets loaded" section.

## Hook contract reminders

- `before_agent_start`: return `{ systemPrompt: event.systemPrompt + block }`. NEVER mutate `event.systemPrompt` in place. Use `event.systemPromptOptions.contextFiles` to dedup against pi's native loader.
- `tool_result`: return `{ content: [...event.content, { type: "text", text: block }] }`. NEVER mutate `event.content` in place.
- `session_start`: reset state, but never throw.
- All hooks are idempotent: dedup via cache keys (cwd+realPath+hash for static, toolCallId+realPath+hash for dynamic).

## Performance budget

Per-rule body cap: 12,000 chars. Total injected per tool result: 40,000 chars. Configurable via `PI_RULES_MAX_RULE_CHARS` and `PI_RULES_MAX_RESULT_CHARS` env vars.

## Release flow

1. Update `CHANGELOG.md` `[Unreleased]` section.
2. `npm version patch|minor|major`
3. `git push origin main --follow-tags`
4. Create GitHub Release.
5. CI auto-publishes to npm via OIDC trusted publishing.
