import { describe, expect, it } from "vitest";

import { GLOBAL_DISTANCE } from "../src/rules/constants.js";
import { compareCandidates, sortCandidates } from "../src/rules/ordering.js";
import type { RuleCandidate, RuleSource } from "../src/rules/types.js";
import { makeRuleCandidate } from "./helpers/rule-fixtures.js";

describe("sortCandidates", () => {
	it("#given local and global rules #when sorting #then local first", () => {
		// given
		const localRule = makeRuleCandidate({ relativePath: ".omo/rules/local.md", isGlobal: false });
		const globalRule = makeRuleCandidate({
			source: "~/.omo/rules",
			relativePath: "",
			distance: GLOBAL_DISTANCE,
			isGlobal: true,
		});

		// when
		const result = sortCandidates([globalRule, localRule]);

		// then
		expect(result).toEqual([localRule, globalRule]);
	});

	it("#given multiple distances #when sorting #then closest distance first", () => {
		// given
		const farRule = makeRuleCandidate({ distance: 3, relativePath: ".omo/rules/far.md" });
		const closeRule = makeRuleCandidate({ distance: 0, relativePath: ".omo/rules/close.md" });
		const middleRule = makeRuleCandidate({ distance: 1, relativePath: ".omo/rules/middle.md" });

		// when
		const result = sortCandidates([farRule, closeRule, middleRule]);

		// then
		expect(result).toEqual([closeRule, middleRule, farRule]);
	});

	it("#given same distance different sources #when sorting #then .omo/rules before .claude/rules", () => {
		// given
		const claudeRule = makeRuleCandidate({ source: ".claude/rules", relativePath: ".claude/rules/typescript.md" });
		const sisyphusRule = makeRuleCandidate({
			source: ".omo/rules",
			relativePath: ".omo/rules/typescript.md",
		});

		// when
		const result = sortCandidates([claudeRule, sisyphusRule]);

		// then
		expect(result).toEqual([sisyphusRule, claudeRule]);
	});

	it("#given same source same distance #when sorting #then alphabetical relativePath order", () => {
		// given
		const zebraRule = makeRuleCandidate({ relativePath: ".omo/rules/zebra.md" });
		const alphaRule = makeRuleCandidate({ relativePath: ".omo/rules/alpha.md" });

		// when
		const result = sortCandidates([zebraRule, alphaRule]);

		// then
		expect(result).toEqual([alphaRule, zebraRule]);
	});

	it("#given identical candidates #when sorting #then result deterministic across runs (stable)", () => {
		// given
		type TaggedCandidate = RuleCandidate & { label: string };
		const firstRule: TaggedCandidate = { ...makeRuleCandidate(), label: "first" };
		const secondRule: TaggedCandidate = { ...makeRuleCandidate(), label: "second" };
		const candidates = [secondRule, firstRule];

		// when
		const firstResult = sortCandidates(candidates).map((candidate) => candidate.label);
		const secondResult = sortCandidates(candidates).map((candidate) => candidate.label);

		// then
		expect(firstResult).toEqual(["second", "first"]);
		expect(secondResult).toEqual(firstResult);
	});

	it("#given .github/copilot-instructions.md vs AGENTS.md #when sorting #then copilot-instructions first per SOURCE_PRIORITY", () => {
		// given
		const agentsRule = makeRuleCandidate({ source: "AGENTS.md", relativePath: "AGENTS.md", isSingleFile: true });
		const copilotRule = makeRuleCandidate({
			source: ".github/copilot-instructions.md",
			relativePath: ".github/copilot-instructions.md",
			isSingleFile: true,
		});

		// when
		const result = sortCandidates([agentsRule, copilotRule]);

		// then
		expect(result).toEqual([copilotRule, agentsRule]);
	});

	it("#given user-home rule and project rule with distance 0 #when sorting #then project rule first regardless of distance", () => {
		// given
		const globalRule = makeRuleCandidate({
			source: "~/.omo/rules",
			distance: 0,
			isGlobal: true,
			relativePath: "",
		});
		const projectRule = makeRuleCandidate({ source: ".omo/rules", distance: 0, isGlobal: false });

		// when
		const result = sortCandidates([globalRule, projectRule]);

		// then
		expect(result).toEqual([projectRule, globalRule]);
	});

	it("#given user-home rules across different sources #when sorting #then ~/.omo/rules before ~/.claude/rules", () => {
		// given
		const claudeRule = makeRuleCandidate({
			source: "~/.claude/rules",
			distance: GLOBAL_DISTANCE,
			isGlobal: true,
			relativePath: ".claude/rules/typescript.md",
		});
		const sisyphusRule = makeRuleCandidate({
			source: "~/.omo/rules",
			distance: GLOBAL_DISTANCE,
			isGlobal: true,
			relativePath: ".omo/rules/typescript.md",
		});

		// when
		const result = sortCandidates([claudeRule, sisyphusRule]);

		// then
		expect(result).toEqual([sisyphusRule, claudeRule]);
	});

	it("#given input array #when sorting #then input not mutated", () => {
		// given
		const zebraRule = makeRuleCandidate({ relativePath: ".omo/rules/zebra.md" });
		const alphaRule = makeRuleCandidate({ relativePath: ".omo/rules/alpha.md" });
		const candidates = [zebraRule, alphaRule];

		// when
		const result = sortCandidates(candidates);

		// then
		expect(result).toEqual([alphaRule, zebraRule]);
		expect(candidates).toEqual([zebraRule, alphaRule]);
	});

	it("#given empty array #when sorting #then empty result", () => {
		// given
		const candidates: RuleCandidate[] = [];

		// when
		const result = sortCandidates(candidates);

		// then
		expect(result).toEqual([]);
	});

	it("#given source missing from priority map #when sorting #then sorted to the end", () => {
		// given
		const missingSource = "missing/rules" as RuleSource;
		const knownRule = makeRuleCandidate({ source: "CONTEXT.md", relativePath: "CONTEXT.md", isSingleFile: true });
		const missingRule = makeRuleCandidate({ source: missingSource, relativePath: "missing/rules/rule.md" });

		// when
		const result = sortCandidates([missingRule, knownRule]);

		// then
		expect(result).toEqual([knownRule, missingRule]);
	});

	it("#given AGENTS.md vs CLAUDE.md vs CONTEXT.md #when sorting #then AGENTS.md first", () => {
		// given
		const contextRule = makeRuleCandidate({ source: "CONTEXT.md", relativePath: "CONTEXT.md", isSingleFile: true });
		const claudeRule = makeRuleCandidate({ source: "CLAUDE.md", relativePath: "CLAUDE.md", isSingleFile: true });
		const agentsRule = makeRuleCandidate({ source: "AGENTS.md", relativePath: "AGENTS.md", isSingleFile: true });

		// when
		const result = sortCandidates([contextRule, claudeRule, agentsRule]);

		// then
		expect(result).toEqual([agentsRule, claudeRule, contextRule]);
	});
});

describe("compareCandidates", () => {
	it("#given lower-priority candidate on the right #when comparing #then returns negative", () => {
		// given
		const earlierRule = makeRuleCandidate({ relativePath: ".omo/rules/a.md" });
		const laterRule = makeRuleCandidate({ relativePath: ".omo/rules/b.md" });

		// when
		const result = compareCandidates(earlierRule, laterRule);

		// then
		expect(result).toBeLessThan(0);
	});

	it("#given identical candidates #when comparing #then returns zero", () => {
		// given
		const leftRule = makeRuleCandidate();
		const rightRule = makeRuleCandidate();

		// when
		const result = compareCandidates(leftRule, rightRule);

		// then
		expect(result).toBe(0);
	});
});
