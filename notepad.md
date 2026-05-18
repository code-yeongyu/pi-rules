# pi-rules strictness and runtime worklog

## Current status

- Scope completed:
  - `pi-rules`
  - `../codex-plugins/plugins/codex-rules`
- Final git status:
  - `pi-rules`: `main...origin/main`, clean after commit `1072bd2`.
  - `codex-rules`: `main...origin/main`, clean after commits `e1cf80c` and `63cb080`.
- Local install status:
  - `@code-yeongyu/pi-rules@0.1.0` is installed globally as a local workspace symlink.
  - `@code-yeongyu/codex-rules@0.1.0` is installed globally as a local workspace symlink.
- Baseline before edits:
  - `npm test`: 235 tests passed.
  - `npm run check`: passed.
  - `npm pack --dry-run`: passed.
  - Runtime duplicate target median: `6.73ms`.
  - Runtime distinct 80-target median: `270.399ms`.
  - Baseline distinct lookup calls: `findProjectRoot=2000`, `findCandidates=2000`, `readFile=3025`.

## Findings

### Repeated discovery work for dynamic multi-target loads

- Problem: `loadDynamicRules` deduped exact duplicate target paths, but still repeated project-root lookup and candidate discovery for distinct files in the same directory.
- Why problematic: a single tool result can contain many paths from the same directory, so repeated root discovery and rule directory scanning turns one logical lookup into many equivalent filesystem walks.
- Improvement:
  - Cache project-root lookup by resolved target directory during a single dynamic load.
  - Share a rule discovery cache across candidate lookups in the same dynamic load.
  - Cache sorted candidates by project root, target directory, and disabled source set.

### Dynamic match cache ignored frontmatter-only changes

- Problem: dynamic match cache keys used `hashContent(parsed.body)`.
- Why problematic: if `globs`, `alwaysApply`, or other frontmatter changed while the body stayed the same, cached match decisions could be reused incorrectly.
- Improvement: `LoadedRule.contentHash` now hashes the full rule file content, including frontmatter and body.

### Symlinked project root could reject valid project rules

- Problem: project membership checked `resolve(projectRoot)` against `resolve(candidate.realPath)`.
- Why problematic: if the project root path is a symlink but candidate realPath is already resolved to the real directory, a valid rule can look outside the project.
- Improvement: project root and candidate path are both normalized with native realpath when possible before containment comparison.

### Scanner realPath reuse was rejected

- Candidate improvement: use `scanRuleFiles` returned `realPath` directly in finder for scanned rule files.
- Result: rejected because scanner intentionally preserves non-symlink paths, while finder tests require native realpath for discovered candidates.
- Decision: keep finder behavior unchanged and preserve compatibility.

### codex-rules parity

- Existing `codex-rules` already had:
  - full rule content hash for dynamic match cache invalidation.
  - symlink-safe project containment using realpath on both sides.
  - shared lower-level rule discovery cache.
- Additional improvement applied there:
  - cache sorted candidate discovery results by project root, target directory, and disabled sources.
  - this reduces repeated `findCandidates` calls for many distinct targets in the same directory.

## Verification so far

- `npm test -- test/engine.test.ts test/finder.test.ts`: passed, 53 tests.
- `npm test`: passed, 240 tests.
- `npm run check`: passed.
- `npm pack --dry-run`: passed.
- no-excuse scan: passed, 43 files.
- `git diff --check`: passed.
- LSP diagnostics on changed files: no diagnostics.
- `codex-rules npm test -- test/engine.test.ts`: passed, 6 tests.
- `codex-rules npm test`: passed, 53 tests.
- `codex-rules npm run check`: passed.
- `codex-rules npm pack --dry-run`: passed.
- `codex-rules` no-excuse scan: passed, 26 files.
- `codex-rules git diff --check`: passed.
- `codex-rules` LSP diagnostics on changed files: no diagnostics.

## Runtime results

Final benchmark artifact: `/tmp/pi-rules-runtime-final-tkNBWq/benchmark-final-summary.json`.

Benchmark setup:

- 121 rules.
- 240 duplicate target paths.
- 80 distinct target paths in the same directory.
- 25 measured iterations after 5 warmups.
- Real filesystem discovery through `findProjectRoot`, `findRuleCandidates`, and `readFile`.

`pi-rules` final vs pre-change baseline:

- Duplicate targets:
  - median `10.3225ms -> 8.737875ms`.
  - `15.35%` faster.
  - calls unchanged: `findProjectRoot=25`, `findCandidates=25`, `readFile=3025`.
- Distinct same-directory targets:
  - median `481.555459ms -> 58.134958ms`.
  - `87.93%` faster, `8.28x`.
  - calls improved: `findProjectRoot 2000 -> 25`, `findCandidates 2000 -> 25`, `readFile=3025`.

`codex-rules` after parity optimization vs previous codex measurement:

- Duplicate targets:
  - median `18.539834ms -> 11.775333ms`.
  - `36.49%` faster.
  - calls unchanged: `findProjectRoot=25`, `findCandidates=25`, `readFile=3025`.
- Distinct same-directory targets:
  - median `108.491875ms -> 83.71575ms`.
  - `22.84%` faster, `1.30x`.
  - calls improved: `findCandidates 2000 -> 25`.

Current `pi-rules` vs current `codex-rules`:

- Duplicate targets: `pi-rules` is `25.80%` faster.
- Distinct same-directory targets: `pi-rules` is `30.56%` faster.

## Commit and install results

- `pi-rules`: `1072bd2 perf(rules): cache dynamic rule discovery`, pushed to `origin/main`.
- `codex-rules`: `e1cf80c perf(rules): cache sorted dynamic candidates`, pushed to `origin/main`.
- `codex-rules`: `63cb080 fix(cli): mark bundled bin executable`, pushed to `origin/main`.
- Local install verification:
  - `npm ls -g --depth=0 @code-yeongyu/pi-rules @code-yeongyu/codex-rules` shows both packages linked from local workspaces.
  - `codex-rules --help` prints usage, proving the global bin is executable.

## GPT-5.2 xhigh audit

Result: `NO BLOCKERS`.

Checked:

- `pi-rules` dynamic candidate discovery cache key, sorting, dedupe behavior, nested project behavior.
- `pi-rules` full-content hash dynamic match invalidation.
- `pi-rules` symlink project root containment behavior.
- `pi-rules` candidate `realPath` trust against finder behavior.
- `codex-rules` candidate discovery caching.
- `codex-rules` source/dist parity.
- TypeScript strictness and quality gates in both repos.

Minor non-blocking note:

- Cache keys use `dirname(resolve(targetFile))`, not target directory realpath, so different symlink paths to the same physical target directory may not share cache entries. This is a performance-only edge case, not a correctness blocker.
