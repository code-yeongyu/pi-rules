import { describe, expect, it } from "vitest";

import { TRUNCATION_NOTICE } from "../src/rules/constants.js";
import { formatDynamicBlock, formatStaticBlock } from "../src/rules/formatter.js";
import type { LoadedRule } from "../src/rules/types.js";
import { makeLoadedRule } from "./helpers/rule-fixtures.js";

function noticeFor(path: string): string {
	return TRUNCATION_NOTICE.replace("{path}", path);
}

describe("formatStaticBlock", () => {
	it("#given empty rules #when formatting static #then returns empty string", () => {
		// given
		const rules: LoadedRule[] = [];

		// when
		const result = formatStaticBlock(rules, { maxRuleChars: 100, maxResultChars: 100 });

		// then
		expect(result).toBe("");
	});

	it('#given one rule #when formatting static #then output starts with "## Project Instructions"', () => {
		// given
		const rule = makeLoadedRule();

		// when
		const result = formatStaticBlock([rule], { maxRuleChars: 100, maxResultChars: 100 });

		// then
		expect(result.startsWith("\n\n## Project Instructions\n")).toBe(true);
	});

	it('#given one rule #when formatting static #then output contains "Instructions from: <path>"', () => {
		// given
		const rule = makeLoadedRule({ path: "/project/AGENTS.md", relativePath: "AGENTS.md" });

		// when
		const result = formatStaticBlock([rule], { maxRuleChars: 100, maxResultChars: 100 });

		// then
		expect(result).toContain("Instructions from: /project/AGENTS.md");
	});

	it("#given one rule #when formatting static #then output contains rule body", () => {
		// given
		const rule = makeLoadedRule({ body: "Use strict TypeScript." });

		// when
		const result = formatStaticBlock([rule], { maxRuleChars: 100, maxResultChars: 100 });

		// then
		expect(result).toContain("Use strict TypeScript.");
	});

	it("#given multiple rules #when formatting static #then all included separated by blank lines", () => {
		// given
		const firstRule = makeLoadedRule({ path: "/project/AGENTS.md", relativePath: "AGENTS.md", body: "First rule." });
		const secondRule = makeLoadedRule({
			path: "/project/.omo/rules/test.md",
			relativePath: ".omo/rules/test.md",
			body: "Second rule.",
		});

		// when
		const result = formatStaticBlock([firstRule, secondRule], { maxRuleChars: 100, maxResultChars: 100 });

		// then
		expect(result).toContain("Instructions from: /project/AGENTS.md\nFirst rule.");
		expect(result).toContain("\n\nInstructions from: /project/.omo/rules/test.md\nSecond rule.");
	});

	it("#given rule body exceeds maxRuleChars #when formatting #then body truncated and ends with notice", () => {
		// given
		const relativePath = ".omo/rules/large.md";
		const rule = makeLoadedRule({ relativePath, body: "a".repeat(100) });
		const notice = noticeFor(relativePath);

		// when
		const result = formatStaticBlock([rule], { maxRuleChars: notice.length + 5, maxResultChars: 200 });

		// then
		expect(result).toContain(notice);
		expect(result.endsWith(notice)).toBe(true);
	});

	it("#given total exceeds maxResultChars #when formatting #then later rules truncated/excluded", () => {
		// given
		const firstRule = makeLoadedRule({ path: "/project/first.md", relativePath: "first.md", body: "first" });
		const secondRule = makeLoadedRule({ path: "/project/second.md", relativePath: "second.md", body: "second" });

		// when
		const result = formatStaticBlock([firstRule, secondRule], { maxRuleChars: 100, maxResultChars: "first".length });

		// then
		expect(result).toContain("Instructions from: /project/first.md\nfirst");
		expect(result).not.toContain("Instructions from: /project/second.md");
	});

	it("#given rule with multiline body #when formatting #then preserves newlines", () => {
		// given
		const body = "Line one.\nLine two.\nLine three.";
		const rule = makeLoadedRule({ body });

		// when
		const result = formatStaticBlock([rule], { maxRuleChars: 100, maxResultChars: 100 });

		// then
		expect(result).toContain(body);
	});

	it("#given output starts with double newline #when formatting #then ready to append to systemPrompt", () => {
		// given
		const rule = makeLoadedRule();

		// when
		const result = formatStaticBlock([rule], { maxRuleChars: 100, maxResultChars: 100 });

		// then
		expect(result.startsWith("\n\n")).toBe(true);
	});
});

describe("formatDynamicBlock", () => {
	it("#given empty rules #when formatting dynamic #then returns empty string", () => {
		// given
		const rules: LoadedRule[] = [];

		// when
		const result = formatDynamicBlock(rules, "src/index.ts", { maxRuleChars: 100, maxResultChars: 100 });

		// then
		expect(result).toBe("");
	});

	it("#given one rule and target path #when formatting dynamic #then includes target path in header line", () => {
		// given
		const rule = makeLoadedRule();

		// when
		const result = formatDynamicBlock([rule], "src/index.ts", { maxRuleChars: 100, maxResultChars: 100 });

		// then
		expect(result.startsWith("\n\nAdditional project instructions matched for src/index.ts:")).toBe(true);
	});

	it('#given multiple rules #when formatting dynamic #then each prefixed with "Instructions from:"', () => {
		// given
		const firstRule = makeLoadedRule({ path: "/project/first.md", relativePath: "first.md", body: "First." });
		const secondRule = makeLoadedRule({ path: "/project/second.md", relativePath: "second.md", body: "Second." });

		// when
		const result = formatDynamicBlock([firstRule, secondRule], "src/index.ts", {
			maxRuleChars: 100,
			maxResultChars: 100,
		});

		// then
		expect(result.match(/Instructions from:/g)).toHaveLength(2);
		expect(result).toContain("Instructions from: /project/first.md\nFirst.");
		expect(result).toContain("Instructions from: /project/second.md\nSecond.");
	});

	it("#given truncated rule body #when formatting dynamic #then truncation notice present", () => {
		// given
		const relativePath = ".omo/rules/dynamic.md";
		const rule = makeLoadedRule({ relativePath, body: "d".repeat(100) });
		const notice = noticeFor(relativePath);

		// when
		const result = formatDynamicBlock([rule], "src/index.ts", {
			maxRuleChars: notice.length + 4,
			maxResultChars: 200,
		});

		// then
		expect(result).toContain(notice);
	});

	it("#given output starts with double newline #when formatting dynamic #then ready to append to tool result content", () => {
		// given
		const rule = makeLoadedRule();

		// when
		const result = formatDynamicBlock([rule], "src/index.ts", { maxRuleChars: 100, maxResultChars: 100 });

		// then
		expect(result.startsWith("\n\n")).toBe(true);
	});
});
