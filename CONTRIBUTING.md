# Contributing to pi-rules

Keep changes small, targeted, and tested.

Before opening a PR:

```bash
bun install
bun run check               # tsgo --noEmit && biome check
bun run test                # unit tests
bun run test:integration    # integration tests
npm pack --dry-run          # release sanity
```

`npm ci && npm test` remains the consumer smoke (extension hosts install with npm).

If you change rule discovery, precedence, injection format, or TUI behavior, also update `README.md` and add tests.

Tests follow `#given X #when Y #then Z` naming with `// given / // when / // then` body comments.

NO `any` in production code. Use `unknown` and narrowing.

This package is a pi coding-agent extension. Behavior that belongs in pi core (`@earendil-works/pi-coding-agent`) should be proposed there instead.
