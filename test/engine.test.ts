import { describe, expect, it } from "vitest";

import { DEFAULT_MAX_RESULT_CHARS, DEFAULT_MAX_RULE_CHARS } from "../src/rules/constants.js";
import { createEngine, defaultConfig, type EngineDeps } from "../src/rules/engine.js";
import type { LoadedRule, PiRulesConfig, RuleCandidate, RuleSource } from "../src/rules/types.js";

const PROJECT_ROOT = "/workspace/project";

function makeCandidate(overrides: Partial<RuleCandidate> = {}): RuleCandidate {
	const path = overrides.path ?? `${PROJECT_ROOT}/.sisyphus/rules/sample.md`;
	const source: RuleSource = overrides.source ?? ".sisyphus/rules";

	return {
		path,
		realPath: overrides.realPath ?? path,
		source,
		distance: overrides.distance ?? 0,
		isGlobal: overrides.isGlobal ?? false,
		isSingleFile: overrides.isSingleFile ?? false,
		relativePath: overrides.relativePath ?? ".sisyphus/rules/sample.md",
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
			path: `${PROJECT_ROOT}/.sisyphus/rules/bad.md`,
			relativePath: ".sisyphus/rules/bad.md",
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
		const missing = makeCandidate({ path: `${PROJECT_ROOT}/.sisyphus/rules/missing.md` });
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
			path: `${PROJECT_ROOT}/.sisyphus/rules/leak.md`,
			realPath: "/Users/example/.ssh/id_rsa",
			relativePath: ".sisyphus/rules/leak.md",
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
			path: `${PROJECT_ROOT}/.sisyphus/rules/root.md`,
			realPath: `${PROJECT_ROOT}/.sisyphus/rules/root.md`,
			distance: 3,
			relativePath: ".sisyphus/rules/root.md",
		});
		const nestedRule = makeCandidate({
			path: `${PROJECT_ROOT}/packages/app/.sisyphus/rules/nested.md`,
			realPath: `${PROJECT_ROOT}/packages/app/.sisyphus/rules/nested.md`,
			distance: 1,
			relativePath: "packages/app/.sisyphus/rules/nested.md",
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
			"packages/app/.sisyphus/rules/nested.md",
			".sisyphus/rules/root.md",
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
		engine.markDynamicInjected(rule);

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

	it("#given markDynamicInjected for same rule twice #when both called #then second returns false", () => {
		// given
		const engine = createTestEngine({}, [], new Map());
		const rule = makeRule();

		// when
		const firstResult = engine.markDynamicInjected(rule);
		const secondResult = engine.markDynamicInjected(rule);

		// then
		expect(firstResult).toBe(true);
		expect(secondResult).toBe(false);
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
