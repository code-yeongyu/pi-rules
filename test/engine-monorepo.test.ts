import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { EngineDeps } from "../src/rules/engine.js";
import { createEngine, defaultConfig } from "../src/rules/engine.js";
import { findRuleCandidates } from "../src/rules/finder.js";
import { findProjectRoot } from "../src/rules/project-root.js";
import { createTempFs } from "./helpers/temp-fs.js";

/**
 * Monorepo semantics: a Cargo/pnpm workspace member (nested project marker) must still
 * discover rule directories from the workspace and repository levels because
 * `loadDynamicRules` widens the per-target project root to the enclosing git root
 * (see `widenToRepositoryRoot`).
 */
describe("loadDynamicRules (monorepo workspace)", () => {
	it("#given workspace member target with workspace-level rules #when loadDynamicRules #then workspace rule and single-file rules from walk levels are returned", () => {
		// given
		const fs = createTempFs("pi-rules-monorepo-");
		try {
			fs.mkdir("repo/.git");
			fs.write("repo/backend/Cargo.toml", "");
			const rustRule = fs.write(
				"repo/backend/.github/instructions/rust.instructions.md",
				'---\napplyTo: "crates/**/*.rs"\n---\nBackend Rust rule.\n',
			);
			const agents = fs.write("repo/backend/AGENTS.md", "# Backend AGENTS\n");
			fs.write("repo/backend/crates/member/Cargo.toml", "");
			const targetPath = fs.write("repo/backend/crates/member/src/lib.rs", "pub fn f() {}\n");

			const deps: EngineDeps = {
				findProjectRoot,
				findCandidates: findRuleCandidates,
				readFile: (path) => {
					try {
						return readFileSync(path, "utf-8");
					} catch {
						return null;
					}
				},
				extractToolPaths: () => [],
			};
			const engine = createEngine(defaultConfig(), deps);

			// when
			const result = engine.loadDynamicRules(fs.path("repo"), [targetPath]);

			// then
			const paths = result.rules.map((rule) => rule.path);
			expect(paths).toContain(rustRule);
			expect(paths).toContain(agents);
		} finally {
			fs.cleanup();
		}
	});

	it("#given workspace member target #when loadDynamicRules #then repository-level rules match via repo-relative globs", () => {
		// given
		const fs = createTempFs("pi-rules-monorepo-");
		try {
			fs.mkdir("repo/.git");
			fs.write("repo/backend/Cargo.toml", "");
			const rootLevelRule = fs.write(
				"repo/.github/instructions/scripts.instructions.md",
				'---\napplyTo: "backend/crates/**/*.rs"\n---\nRepository Rust rule.\n',
			);
			fs.write("repo/backend/crates/member/Cargo.toml", "");
			const targetPath = fs.write("repo/backend/crates/member/src/lib.rs", "pub fn f() {}\n");

			const deps: EngineDeps = {
				findProjectRoot,
				findCandidates: findRuleCandidates,
				readFile: (path) => {
					try {
						return readFileSync(path, "utf-8");
					} catch {
						return null;
					}
				},
				extractToolPaths: () => [],
			};
			const engine = createEngine(defaultConfig(), deps);

			// when
			const result = engine.loadDynamicRules(fs.path("repo"), [targetPath]);

			// then
			expect(result.rules.map((rule) => rule.path)).toContain(rootLevelRule);
		} finally {
			fs.cleanup();
		}
	});

	it("#given workspace-level globs scoped to another subtree #when loadDynamicRules #then rule does not match", () => {
		// given
		const fs = createTempFs("pi-rules-monorepo-");
		try {
			fs.mkdir("repo/.git");
			fs.write("repo/backend/Cargo.toml", "");
			fs.write(
				"repo/backend/.github/instructions/scripts.instructions.md",
				'---\napplyTo: "scripts/**"\n---\nScripts rule.\n',
			);
			fs.write("repo/backend/crates/member/Cargo.toml", "");
			const targetPath = fs.write("repo/backend/crates/member/src/lib.rs", "pub fn f() {}\n");

			const deps: EngineDeps = {
				findProjectRoot,
				findCandidates: findRuleCandidates,
				readFile: (path) => {
					try {
						return readFileSync(path, "utf-8");
					} catch {
						return null;
					}
				},
				extractToolPaths: () => [],
			};
			const engine = createEngine(defaultConfig(), deps);

			// when
			const result = engine.loadDynamicRules(fs.path("repo"), [targetPath]);

			// then
			expect(result.rules.map((rule) => rule.path)).toHaveLength(0);
		} finally {
			fs.cleanup();
		}
	});
});
