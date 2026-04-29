# Contributing to pi-rules

Keep changes small, targeted, and tested.

Before opening a PR:

```bash
npm install
npm run check               # tsc --noEmit && biome check
npm test                    # 229 unit tests
npm run test:integration    # 43 integration tests
npm pack --dry-run          # release sanity
```

If you change rule discovery, precedence, injection format, or TUI behavior, also update `README.md` and add tests.

Tests follow `#given X #when Y #then Z` naming with `// given / // when / // then` body comments.

NO `any` in production code. Use `unknown` and narrowing.

This package is a pi coding-agent extension. Behavior that belongs in pi core (`@mariozechner/pi-coding-agent`) should be proposed there instead.
