import { realpathSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_RESULT_CHARS, DEFAULT_MAX_RULE_CHARS } from "../src/rules/constants.js";
import { createEngine, type DynamicTargetFingerprint, defaultConfig, type EngineDeps } from "../src/rules/engine.js";
import { matchRule as defaultMatchRule } from "../src/rules/matcher.js";
import type { LoadedRule, PiRulesConfig, RuleCandidate, RuleSource } from "../src/rules/types.js";
import { createTempFs } from "./helpers/temp-fs.js";

const PROJECT_ROOT = "/workspace/project";

function makeCandidate(overrides: Partial<RuleCandidate> = {}): RuleCandidate {
	const path = overrides.path ?? `${PROJECT_ROOT}/.omo/rules/sample.md`;
	const source: RuleSource = overrides.source ?? ".omo/rules";

	return {
		path,
		realPath: overrides.realPath ?? path,
		source,
		distance: overrides.distance ?? 0,
		isGlobal: overrides.isGlobal ?? false,
		isSingleFile: overrides.isSingleFile ?? false,
		relativePath: overrides.relativePath ?? ".omo/rules/sample.md",
	};
}

function makeRule(overrides: Partial<LoadedRule> = {}): LoadedRule {
	const candidate = makeCandidate(overrides);

	return {
		...candidate,
		frontmatter: overrides.frontmatter ?? {},
		body: overrides.body ?? "Sample rule body.",
		contentHash: overrides.contentHash ?? "hash",
		matchReason: overrides.matchReason ?? "alwaysApply",
	};
}

function ruleMarkdown(frontmatter: string, body: string): string {
	return frontmatter.length === 0 ? body : `---\n${frontmatter}\n---\n${body}`;
}

function createDeps(candidates: RuleCandidate[], files: ReadonlyMap<string, string | null>): EngineDeps {
	return {
		findCandidates: () => candidates,
		readFile: (path) => files.get(path) ?? null,
		findProjectRoot: () => PROJECT_ROOT,
		extractToolPaths: () => [],
	};
}

function createDepsForTargets(
	candidatesByTarget: ReadonlyMap<string | null, RuleCandidate[]>,
	files: ReadonlyMap<string, string | null>,
): EngineDeps {
	return {
		findCandidates: ({ targetFile }) => candidatesByTarget.get(targetFile) ?? [],
		readFile: (path) => files.get(path) ?? null,
		findProjectRoot: () => PROJECT_ROOT,
		extractToolPaths: () => [],
	};
}

type FindCandidatesOptionsWithCache = Parameters<EngineDeps["findCandidates"]>[0] & {
	readonly cache?: object;
};

function createTestEngine(
	overrides: Partial<PiRulesConfig>,
	candidates: RuleCandidate[],
	files: ReadonlyMap<string, string | null>,
) {
	return createEngine({ ...defaultConfig(), ...overrides }, createDeps(candidates, files));
}

describe("defaultConfig", () => {
	it('#given defaultConfig #when called #then returns { disabled: false, mode: "both", maxRuleChars: 12000, maxResultChars: 40000, enabledSources: "auto" }', () => {
		// given
		const expected = {
			disabled: false,
			mode: "both",
			maxRuleChars: DEFAULT_MAX_RULE_CHARS,
			maxResultChars: DEFAULT_MAX_RESULT_CHARS,
			enabledSources: "auto",
		};

		// when
		const result = defaultConfig();

		// then
		expect(result).toEqual(expected);
	});
});

describe("loadStaticRules", () => {
	it("#given config.disabled=true #when loadStaticRules #then returns empty rules", () => {
		// given
		const engine = createTestEngine({ disabled: true }, [], new Map());

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result).toEqual({ rules: [], diagnostics: [] });
	});

	it('#given config.mode="off" #when loadStaticRules #then returns empty rules', () => {
		// given
		const engine = createTestEngine({ mode: "off" }, [], new Map());

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result).toEqual({ rules: [], diagnostics: [] });
	});

	it('#given config.mode="dynamic" #when loadStaticRules #then returns empty rules', () => {
		// given
		const engine = createTestEngine({ mode: "dynamic" }, [], new Map());

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result).toEqual({ rules: [], diagnostics: [] });
	});

	it('#given single-file candidate #when loadStaticRules #then candidate included with matchReason "single-file"', () => {
		// given
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/AGENTS.md`,
			realPath: `${PROJECT_ROOT}/AGENTS.md`,
			source: "AGENTS.md",
			isSingleFile: true,
			relativePath: "AGENTS.md",
		});
		const engine = createTestEngine({}, [candidate], new Map([[candidate.path, "Use project rules."]]));

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.matchReason).toBe("single-file");
	});

	it('#given alwaysApply rule #when loadStaticRules #then included with matchReason "alwaysApply"', () => {
		// given
		const candidate = makeCandidate();
		const engine = createTestEngine(
			{},
			[candidate],
			new Map([[candidate.path, ruleMarkdown("alwaysApply: true", "Always apply this rule.")]]),
		);

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.matchReason).toBe("alwaysApply");
	});

	it("#given glob-only rule (no alwaysApply, no single-file) #when loadStaticRules #then NOT included (static mode requires target)", () => {
		// given
		const candidate = makeCandidate();
		const engine = createTestEngine(
			{},
			[candidate],
			new Map([[candidate.path, ruleMarkdown('globs: "src/**/*.ts"', "Only dynamic.")]]),
		);

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result.rules).toEqual([]);
	});

	it("#given AGENTS.md and CLAUDE.md both at project root #when loadStaticRules #then ONLY AGENTS.md included (first-match-wins per priority)", () => {
		// given
		const agents = makeCandidate({
			path: `${PROJECT_ROOT}/AGENTS.md`,
			realPath: `${PROJECT_ROOT}/AGENTS.md`,
			source: "AGENTS.md",
			isSingleFile: true,
			relativePath: "AGENTS.md",
		});
		const claude = makeCandidate({
			path: `${PROJECT_ROOT}/CLAUDE.md`,
			realPath: `${PROJECT_ROOT}/CLAUDE.md`,
			source: "CLAUDE.md",
			isSingleFile: true,
			relativePath: "CLAUDE.md",
		});
		const engine = createTestEngine(
			{},
			[claude, agents],
			new Map([
				[agents.path, "Agents rule."],
				[claude.path, "Claude rule."],
			]),
		);

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result.rules.map((rule) => rule.source)).toEqual(["AGENTS.md"]);
	});

	it("#given AGENTS.md at root and AGENTS.md in subdir #when loadStaticRules #then both included (first-match-wins only at distance 0)", () => {
		// given
		const rootAgents = makeCandidate({
			path: `${PROJECT_ROOT}/AGENTS.md`,
			realPath: `${PROJECT_ROOT}/AGENTS.md`,
			source: "AGENTS.md",
			distance: 0,
			isSingleFile: true,
			relativePath: "AGENTS.md",
		});
		const nestedAgents = makeCandidate({
			path: `${PROJECT_ROOT}/packages/app/AGENTS.md`,
			realPath: `${PROJECT_ROOT}/packages/app/AGENTS.md`,
			source: "AGENTS.md",
			distance: 1,
			isSingleFile: true,
			relativePath: "packages/app/AGENTS.md",
		});
		const engine = createTestEngine(
			{},
			[rootAgents, nestedAgents],
			new Map([
				[rootAgents.path, "Root agents rule."],
				[nestedAgents.path, "Nested agents rule."],
			]),
		);

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result.rules.map((rule) => rule.relativePath)).toEqual(["AGENTS.md", "packages/app/AGENTS.md"]);
	});

	it("#given malformed rule file #when loadStaticRules #then diagnostic recorded but other rules still loaded", () => {
		// given
		const malformed = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/bad.md`,
			relativePath: ".omo/rules/bad.md",
		});
		const valid = makeCandidate({
			path: `${PROJECT_ROOT}/AGENTS.md`,
			realPath: `${PROJECT_ROOT}/AGENTS.md`,
			source: "AGENTS.md",
			isSingleFile: true,
			relativePath: "AGENTS.md",
		});
		const engine = createTestEngine(
			{},
			[malformed, valid],
			new Map([
				[malformed.path, "---\nglobs: [unclosed\n---\nMalformed body."],
				[valid.path, "Valid body."],
			]),
		);

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]?.source).toBe(malformed.path);
		expect(result.rules.map((rule) => rule.path)).toContain(valid.path);
	});

	it("#given readFile returns null #when loadStaticRules #then diagnostic recorded for that path, other rules loaded", () => {
		// given
		const missing = makeCandidate({ path: `${PROJECT_ROOT}/.omo/rules/missing.md` });
		const valid = makeCandidate({
			path: `${PROJECT_ROOT}/AGENTS.md`,
			realPath: `${PROJECT_ROOT}/AGENTS.md`,
			source: "AGENTS.md",
			isSingleFile: true,
			relativePath: "AGENTS.md",
		});
		const engine = createTestEngine({}, [missing, valid], new Map([[valid.path, "Valid body."]]));

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result.diagnostics).toContainEqual({
			severity: "warning",
			source: missing.path,
			message: "Unable to read rule file",
		});
		expect(result.rules.map((rule) => rule.path)).toContain(valid.path);
	});

	it("#given project rule realPath escapes project root #when loadStaticRules #then skipped before readFile", () => {
		// given
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/leak.md`,
			realPath: "/Users/example/.ssh/id_rsa",
			relativePath: ".omo/rules/leak.md",
		});
		const engine = createTestEngine(
			{},
			[candidate],
			new Map([[candidate.path, ruleMarkdown("alwaysApply: true", "secret")]]),
		);

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result.rules).toEqual([]);
		expect(result.diagnostics).toContainEqual({
			severity: "warning",
			source: candidate.path,
			message: "Rule file resolves outside project root",
		});
	});

	it("#given symlinked project root and realpathed candidate #when loadStaticRules #then rule is treated as inside project", () => {
		// given
		const tempFs = createTempFs("pi-rules-engine-");
		try {
			const realProjectRoot = tempFs.mkdir("real-project");
			tempFs.write("real-project/.omo/rules/typescript.md", ruleMarkdown("alwaysApply: true", "TypeScript rule."));
			const symlinkProjectRoot = tempFs.symlink(realProjectRoot, "linked-project");
			const symlinkRulePath = tempFs.path("linked-project", ".omo", "rules", "typescript.md");
			const candidate = makeCandidate({
				path: symlinkRulePath,
				realPath: realpathSync.native(symlinkRulePath),
				relativePath: ".omo/rules/typescript.md",
			});
			const engine = createEngine(defaultConfig(), {
				findProjectRoot: () => symlinkProjectRoot,
				findCandidates: () => [candidate],
				readFile: () => ruleMarkdown("alwaysApply: true", "TypeScript rule."),
				extractToolPaths: () => [],
			});

			// when
			const result = engine.loadStaticRules(symlinkProjectRoot);

			// then
			expect(result.diagnostics).toEqual([]);
			expect(result.rules.map((rule) => rule.path)).toEqual([symlinkRulePath]);
		} finally {
			tempFs.cleanup();
		}
	});
});

describe("loadDynamicRules", () => {
	it('#given config.mode="static" #when loadDynamicRules #then returns empty', () => {
		// given
		const engine = createTestEngine({ mode: "static" }, [], new Map());

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, [`${PROJECT_ROOT}/src/index.ts`]);

		// then
		expect(result).toEqual({ rules: [], diagnostics: [] });
	});

	it("#given empty targetPaths #when loadDynamicRules #then returns empty", () => {
		// given
		const engine = createTestEngine({}, [], new Map());

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, []);

		// then
		expect(result).toEqual({ rules: [], diagnostics: [] });
	});

	it('#given target file matches glob #when loadDynamicRules #then matched rule included with matchReason {kind:"glob",pattern:...}', () => {
		// given
		const candidate = makeCandidate();
		const engine = createTestEngine(
			{},
			[candidate],
			new Map([[candidate.path, ruleMarkdown('globs: "src/**/*.ts"', "TypeScript rule.")]]),
		);

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, [`${PROJECT_ROOT}/src/index.ts`]);

		// then
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.matchReason).toEqual({ kind: "glob", pattern: "src/**/*.ts" });
	});

	it("#given target file does not match any glob #when loadDynamicRules #then no rules", () => {
		// given
		const candidate = makeCandidate();
		const engine = createTestEngine(
			{},
			[candidate],
			new Map([[candidate.path, ruleMarkdown('globs: "docs/**/*.md"', "Docs only.")]]),
		);

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, [`${PROJECT_ROOT}/src/index.ts`]);

		// then
		expect(result.rules).toEqual([]);
	});

	it("#given alwaysApply rule and target #when loadDynamicRules #then alwaysApply rule included", () => {
		// given
		const candidate = makeCandidate();
		const engine = createTestEngine(
			{},
			[candidate],
			new Map([[candidate.path, ruleMarkdown("alwaysApply: true", "Always applies dynamically.")]]),
		);

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, [`${PROJECT_ROOT}/src/index.ts`]);

		// then
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.matchReason).toBe("alwaysApply");
	});

	it("#given multiple matching rules #when loadDynamicRules #then sorted via ordering (closest first)", () => {
		// given
		const rootRule = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/root.md`,
			realPath: `${PROJECT_ROOT}/.omo/rules/root.md`,
			distance: 3,
			relativePath: ".omo/rules/root.md",
		});
		const nestedRule = makeCandidate({
			path: `${PROJECT_ROOT}/packages/app/.omo/rules/nested.md`,
			realPath: `${PROJECT_ROOT}/packages/app/.omo/rules/nested.md`,
			distance: 1,
			relativePath: "packages/app/.omo/rules/nested.md",
		});
		const engine = createTestEngine(
			{},
			[rootRule, nestedRule],
			new Map([
				[rootRule.path, ruleMarkdown('globs: "src/**/*.ts"', "Root rule.")],
				[nestedRule.path, ruleMarkdown('globs: "src/**/*.ts"', "Nested rule.")],
			]),
		);

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, [`${PROJECT_ROOT}/src/index.ts`]);

		// then
		expect(result.rules.map((rule) => rule.relativePath)).toEqual([
			"packages/app/.omo/rules/nested.md",
			".omo/rules/root.md",
		]);
	});

	it("#given same dynamic rule matches multiple target files #when loadDynamicRules #then rule returned once", () => {
		// given
		const firstTarget = `${PROJECT_ROOT}/src/first.ts`;
		const secondTarget = `${PROJECT_ROOT}/src/second.ts`;
		const candidate = makeCandidate();
		const deps = createDepsForTargets(
			new Map([
				[firstTarget, [candidate]],
				[secondTarget, [candidate]],
			]),
			new Map([[candidate.path, ruleMarkdown('globs: "src/**/*.ts"', "TypeScript rule.")]]),
		);
		const engine = createEngine(defaultConfig(), deps);

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, [firstTarget, secondTarget]);

		// then
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.path).toBe(candidate.path);
	});

	it("#given target file in nested project #when loadDynamicRules #then nearest target project root is used", () => {
		// given
		const nestedProjectRoot = `${PROJECT_ROOT}/packages/app`;
		const targetPath = `${nestedProjectRoot}/src/index.ts`;
		const candidate = makeCandidate({
			path: `${nestedProjectRoot}/.omo/rules/typescript.md`,
			realPath: `${nestedProjectRoot}/.omo/rules/typescript.md`,
			relativePath: ".omo/rules/typescript.md",
		});
		const projectRootCalls: string[] = [];
		const deps = {
			findProjectRoot: (startPath) => {
				projectRootCalls.push(startPath);
				return startPath === targetPath ? nestedProjectRoot : PROJECT_ROOT;
			},
			findCandidates: ({ projectRoot }) => (projectRoot === nestedProjectRoot ? [candidate] : []),
			readFile: () => ruleMarkdown('globs: "src/**/*.ts"', "TypeScript rule."),
			extractToolPaths: () => [],
		} satisfies EngineDeps;
		const engine = createEngine(defaultConfig(), deps);

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, [targetPath]);

		// then
		expect(projectRootCalls).toEqual([targetPath]);
		expect(result.rules).toHaveLength(1);
		expect(result.rules[0]?.path).toBe(candidate.path);
	});

	it("#given duplicate target paths #when loadDynamicRules #then repeated discovery and parsing work is avoided", () => {
		// given
		const targetPath = `${PROJECT_ROOT}/src/app.ts`;
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			realPath: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			relativePath: ".omo/rules/typescript.md",
		});
		const counters = {
			findProjectRoot: 0,
			findCandidates: 0,
			readFile: 0,
		};
		const deps = {
			findProjectRoot: () => {
				counters.findProjectRoot += 1;
				return PROJECT_ROOT;
			},
			findCandidates: () => {
				counters.findCandidates += 1;
				return [candidate];
			},
			readFile: () => {
				counters.readFile += 1;
				return ruleMarkdown('globs: "src/**/*.ts"', "TypeScript rule.");
			},
			extractToolPaths: () => [],
		} satisfies EngineDeps;
		const engine = createEngine(defaultConfig(), deps);

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, [targetPath, targetPath, targetPath]);

		// then
		expect(result.rules).toHaveLength(1);
		expect(counters).toEqual({
			findProjectRoot: 1,
			findCandidates: 1,
			readFile: 1,
		});
	});

	it("#given distinct target files in same directory #when loadDynamicRules #then project root lookup is reused", () => {
		// given
		const firstTarget = `${PROJECT_ROOT}/src/first.ts`;
		const secondTarget = `${PROJECT_ROOT}/src/second.ts`;
		const thirdTarget = `${PROJECT_ROOT}/src/third.ts`;
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			realPath: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			relativePath: ".omo/rules/typescript.md",
		});
		let findProjectRootCalls = 0;
		const deps = {
			findProjectRoot: () => {
				findProjectRootCalls += 1;
				return PROJECT_ROOT;
			},
			findCandidates: () => [candidate],
			readFile: () => ruleMarkdown('globs: "src/**/*.ts"', "TypeScript rule."),
			extractToolPaths: () => [],
		} satisfies EngineDeps;
		const engine = createEngine(defaultConfig(), deps);

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, [firstTarget, secondTarget, thirdTarget]);

		// then
		expect(result.rules).toHaveLength(1);
		expect(findProjectRootCalls).toBe(1);
	});

	it("#given multiple dynamic target files #when loadDynamicRules #then discovery cache is shared across candidate lookups", () => {
		// given
		const firstTarget = `${PROJECT_ROOT}/src/first.ts`;
		const secondTarget = `${PROJECT_ROOT}/test/second.ts`;
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			realPath: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			relativePath: ".omo/rules/typescript.md",
		});
		const observedCaches: Array<object | undefined> = [];
		const deps = {
			findProjectRoot: () => PROJECT_ROOT,
			findCandidates: (options: FindCandidatesOptionsWithCache) => {
				observedCaches.push(options.cache);
				return [candidate];
			},
			readFile: () => ruleMarkdown('globs: "src/**/*.ts"', "TypeScript rule."),
			extractToolPaths: () => [],
		} satisfies EngineDeps;
		const engine = createEngine(defaultConfig(), deps);

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, [firstTarget, secondTarget]);

		// then
		expect(result.rules).toHaveLength(1);
		expect(observedCaches).toHaveLength(2);
		expect(observedCaches[0]).toBeDefined();
		expect(observedCaches[1]).toBe(observedCaches[0]);
	});

	it("#given distinct target files in same directory #when loadDynamicRules #then candidate discovery is reused", () => {
		// given
		const firstTarget = `${PROJECT_ROOT}/src/first.ts`;
		const secondTarget = `${PROJECT_ROOT}/src/second.ts`;
		const thirdTarget = `${PROJECT_ROOT}/src/third.ts`;
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			realPath: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			relativePath: ".omo/rules/typescript.md",
		});
		let findCandidatesCalls = 0;
		const deps = {
			findProjectRoot: () => PROJECT_ROOT,
			findCandidates: () => {
				findCandidatesCalls += 1;
				return [candidate];
			},
			readFile: () => ruleMarkdown('globs: "src/**/*.ts"', "TypeScript rule."),
			extractToolPaths: () => [],
		} satisfies EngineDeps;
		const engine = createEngine(defaultConfig(), deps);

		// when
		const result = engine.loadDynamicRules(PROJECT_ROOT, [firstTarget, secondTarget, thirdTarget]);

		// then
		expect(result.rules).toHaveLength(1);
		expect(findCandidatesCalls).toBe(1);
	});

	it("#given same target and unchanged rule body #when loadDynamicRules is called twice #then match decision is reused", () => {
		// given
		const targetPath = `${PROJECT_ROOT}/src/app.ts`;
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			realPath: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			relativePath: ".omo/rules/typescript.md",
		});
		let matchRuleCalls = 0;
		const deps = {
			findProjectRoot: () => PROJECT_ROOT,
			findCandidates: () => [candidate],
			readFile: () => ruleMarkdown('globs: "src/**/*.ts"', "TypeScript rule."),
			extractToolPaths: () => [],
			matchRule: (input) => {
				matchRuleCalls += 1;
				return defaultMatchRule(input);
			},
		} satisfies EngineDeps;
		const engine = createEngine(defaultConfig(), deps);

		// when
		const firstResult = engine.loadDynamicRules(PROJECT_ROOT, [targetPath]);
		const secondResult = engine.loadDynamicRules(PROJECT_ROOT, [targetPath]);

		// then
		expect(firstResult.rules).toHaveLength(1);
		expect(secondResult.rules).toHaveLength(1);
		expect(matchRuleCalls).toBe(1);
	});

	it("#given same target and changed rule body #when loadDynamicRules is called again #then match decision is re-evaluated", () => {
		// given
		const targetPath = `${PROJECT_ROOT}/src/app.ts`;
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			realPath: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			relativePath: ".omo/rules/typescript.md",
		});
		let body = "TypeScript rule.";
		let matchRuleCalls = 0;
		const deps = {
			findProjectRoot: () => PROJECT_ROOT,
			findCandidates: () => [candidate],
			readFile: () => ruleMarkdown('globs: "src/**/*.ts"', body),
			extractToolPaths: () => [],
			matchRule: (input) => {
				matchRuleCalls += 1;
				return defaultMatchRule(input);
			},
		} satisfies EngineDeps;
		const engine = createEngine(defaultConfig(), deps);

		// when
		engine.loadDynamicRules(PROJECT_ROOT, [targetPath]);
		body = "Updated TypeScript rule.";
		engine.loadDynamicRules(PROJECT_ROOT, [targetPath]);

		// then
		expect(matchRuleCalls).toBe(2);
	});

	it("#given same target and changed rule frontmatter #when loadDynamicRules is called again #then match decision is re-evaluated", () => {
		// given
		const targetPath = `${PROJECT_ROOT}/src/app.ts`;
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			realPath: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			relativePath: ".omo/rules/typescript.md",
		});
		let frontmatter = 'globs: "src/**/*.ts"';
		let matchRuleCalls = 0;
		const deps = {
			findProjectRoot: () => PROJECT_ROOT,
			findCandidates: () => [candidate],
			readFile: () => ruleMarkdown(frontmatter, "Same body."),
			extractToolPaths: () => [],
			matchRule: (input) => {
				matchRuleCalls += 1;
				return defaultMatchRule(input);
			},
		} satisfies EngineDeps;
		const engine = createEngine(defaultConfig(), deps);

		// when
		const firstResult = engine.loadDynamicRules(PROJECT_ROOT, [targetPath]);
		frontmatter = 'globs: "docs/**/*.md"';
		const secondResult = engine.loadDynamicRules(PROJECT_ROOT, [targetPath]);

		// then
		expect(firstResult.rules).toHaveLength(1);
		expect(secondResult.rules).toEqual([]);
		expect(matchRuleCalls).toBe(2);
	});

	it("#given unchanged rule and different target files #when loadDynamicRules is called #then cache separates target paths", () => {
		// given
		const firstTarget = `${PROJECT_ROOT}/src/app.ts`;
		const secondTarget = `${PROJECT_ROOT}/src/app.test.ts`;
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			realPath: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			relativePath: ".omo/rules/typescript.md",
		});
		let matchRuleCalls = 0;
		const deps = {
			findProjectRoot: () => PROJECT_ROOT,
			findCandidates: () => [candidate],
			readFile: () => ruleMarkdown('globs: ["src/**/*.ts", "!src/**/*.test.ts"]', "TypeScript rule."),
			extractToolPaths: () => [],
			matchRule: (input) => {
				matchRuleCalls += 1;
				return defaultMatchRule(input);
			},
		} satisfies EngineDeps;
		const engine = createEngine(defaultConfig(), deps);

		// when
		const firstResult = engine.loadDynamicRules(PROJECT_ROOT, [firstTarget]);
		const secondResult = engine.loadDynamicRules(PROJECT_ROOT, [secondTarget]);

		// then
		expect(firstResult.rules).toHaveLength(1);
		expect(secondResult.rules).toEqual([]);
		expect(matchRuleCalls).toBe(2);
	});
});

describe("formatting", () => {
	it('#given formatStatic with one rule #when called #then returns string starting with "## Project Instructions"', () => {
		// given
		const engine = createTestEngine({}, [], new Map());
		const rule = makeRule();

		// when
		const result = engine.formatStatic([rule]);

		// then
		expect(result.startsWith("\n\n## Project Instructions")).toBe(true);
	});

	it('#given formatDynamic with one rule #when called #then returns string with "Additional project instructions matched for"', () => {
		// given
		const engine = createTestEngine({}, [], new Map());
		const rule = makeRule();

		// when
		const result = engine.formatDynamic([rule], "src/index.ts");

		// then
		expect(result).toContain("Additional project instructions matched for src/index.ts");
	});
});

describe("session state", () => {
	it("#given resetSession #when state had injected entries #then cleared", () => {
		// given
		const engine = createTestEngine({}, [], new Map());
		const rule = makeRule();
		engine.markStaticInjected(rule);
		engine.markDynamicInjected("/workspace/project/src/app.ts", rule);

		// when
		engine.resetSession("/workspace/other");

		// then
		expect(engine.state.staticDedup.size).toBe(0);
		expect(engine.state.dynamicDedup.size).toBe(0);
		expect(engine.state.cwd).toBe("/workspace/other");
	});

	it("#given markStaticInjected called twice for same rule #when called second time #then returns false", () => {
		// given
		const engine = createTestEngine({}, [], new Map());
		const rule = makeRule();

		// when
		const firstResult = engine.markStaticInjected(rule);
		const secondResult = engine.markStaticInjected(rule);

		// then
		expect(firstResult).toBe(true);
		expect(secondResult).toBe(false);
	});

	it("#given isStaticInjected after marking #then returns true", () => {
		// given
		const engine = createTestEngine({}, [], new Map());
		const rule = makeRule();

		// when
		engine.markStaticInjected(rule);

		// then
		expect(engine.isStaticInjected(rule)).toBe(true);
	});

	it("#given markDynamicInjected for same rule and target path twice #when both called #then second returns false", () => {
		// given
		const engine = createTestEngine({}, [], new Map());
		const scopeKey = "/workspace/project/src/app.ts";
		const rule = makeRule();

		// when
		const firstResult = engine.markDynamicInjected(scopeKey, rule);
		const secondResult = engine.markDynamicInjected(scopeKey, rule);

		// then
		expect(firstResult).toBe(true);
		expect(secondResult).toBe(false);
	});

	it("#given fingerprintDynamicTargets called twice for unchanged target #when commit #then second call short-circuits via isDynamicTargetFingerprintCurrent", () => {
		// given
		const targetPath = `${PROJECT_ROOT}/src/app.ts`;
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			realPath: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			relativePath: ".omo/rules/typescript.md",
		});
		let findCandidatesCalls = 0;
		const deps = {
			findProjectRoot: () => PROJECT_ROOT,
			findCandidates: () => {
				findCandidatesCalls += 1;
				return [candidate];
			},
			readFile: () => ruleMarkdown('globs: "src/**/*.ts"', "TypeScript rule."),
			extractToolPaths: () => [],
			fileFingerprint: () => "stable",
		} satisfies EngineDeps;
		const engine = createEngine(defaultConfig(), deps);

		// when
		const firstFingerprints = engine.fingerprintDynamicTargets(PROJECT_ROOT, [targetPath]);
		expect(firstFingerprints).toHaveLength(1);
		const firstFingerprint = firstFingerprints[0];
		expect(firstFingerprint).toBeDefined();
		expect(engine.isDynamicTargetFingerprintCurrent(firstFingerprint as DynamicTargetFingerprint)).toBe(false);
		engine.commitDynamicTargetFingerprints(firstFingerprints);
		const secondFingerprints = engine.fingerprintDynamicTargets(PROJECT_ROOT, [targetPath]);

		// then
		expect(secondFingerprints).toHaveLength(1);
		const secondFingerprint = secondFingerprints[0];
		expect(secondFingerprint).toBeDefined();
		expect(engine.isDynamicTargetFingerprintCurrent(secondFingerprint as DynamicTargetFingerprint)).toBe(true);
		expect(findCandidatesCalls).toBe(2);
	});

	it("#given fingerprintDynamicTargets called after fileFingerprint changes #when checked #then isDynamicTargetFingerprintCurrent returns false", () => {
		// given
		const targetPath = `${PROJECT_ROOT}/src/app.ts`;
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			realPath: `${PROJECT_ROOT}/.omo/rules/typescript.md`,
			relativePath: ".omo/rules/typescript.md",
		});
		let fingerprintValue = "version-a";
		const deps = {
			findProjectRoot: () => PROJECT_ROOT,
			findCandidates: () => [candidate],
			readFile: () => ruleMarkdown('globs: "src/**/*.ts"', "TypeScript rule."),
			extractToolPaths: () => [],
			fileFingerprint: () => fingerprintValue,
		} satisfies EngineDeps;
		const engine = createEngine(defaultConfig(), deps);

		// when
		const first = engine.fingerprintDynamicTargets(PROJECT_ROOT, [targetPath]);
		engine.commitDynamicTargetFingerprints(first);
		fingerprintValue = "version-b";
		const second = engine.fingerprintDynamicTargets(PROJECT_ROOT, [targetPath]);
		const secondFingerprint = second[0];

		// then
		expect(secondFingerprint).toBeDefined();
		expect(engine.isDynamicTargetFingerprintCurrent(secondFingerprint as DynamicTargetFingerprint)).toBe(false);
	});

	it("#given resetSession #when previously committed fingerprints #then dynamicTargetFingerprints is cleared", () => {
		// given
		const engine = createTestEngine({}, [], new Map());
		engine.commitDynamicTargetFingerprints([{ targetPath: "/x/y.ts", cacheKey: "/x/y.ts", fingerprint: "abc" }]);
		expect(engine.state.dynamicTargetFingerprints.size).toBe(1);

		// when
		engine.resetSession(PROJECT_ROOT);

		// then
		expect(engine.state.dynamicTargetFingerprints.size).toBe(0);
	});

	it("#given previous loaded state #when loadStaticRules returns early #then public loaded state is cleared", () => {
		// given
		const candidate = makeCandidate({
			path: `${PROJECT_ROOT}/AGENTS.md`,
			realPath: `${PROJECT_ROOT}/AGENTS.md`,
			source: "AGENTS.md",
			isSingleFile: true,
			relativePath: "AGENTS.md",
		});
		const config = defaultConfig();
		const engine = createEngine(config, createDeps([candidate], new Map([[candidate.path, "Project rule."]])));
		engine.loadStaticRules(PROJECT_ROOT);
		config.mode = "dynamic";

		// when
		const result = engine.loadStaticRules(PROJECT_ROOT);

		// then
		expect(result).toEqual({ rules: [], diagnostics: [] });
		expect(engine.state.loadedRules).toEqual([]);
		expect(engine.state.diagnostics).toEqual([]);
	});
});
