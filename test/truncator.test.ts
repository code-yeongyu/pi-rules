import { describe, expect, it } from "vitest";

import { TRUNCATION_NOTICE } from "../src/rules/constants.js";
import { truncateBudget, truncateRule } from "../src/rules/truncator.js";

const relativePath = ".omo/rules/typescript.md";

function noticeFor(path: string): string {
	return TRUNCATION_NOTICE.replace("{path}", path);
}

describe("truncateRule", () => {
	it("#given body shorter than maxChars #when truncating #then returns unchanged with truncated=false", () => {
		// given
		const body = "Use strict TypeScript.";

		// when
		const result = truncateRule(body, { maxChars: 100, relativePath });

		// then
		expect(result).toEqual({ body, truncated: false, originalLength: body.length });
	});

	it("#given body equal to maxChars #when truncating #then unchanged", () => {
		// given
		const body = "1234567890";

		// when
		const result = truncateRule(body, { maxChars: body.length, relativePath });

		// then
		expect(result).toEqual({ body, truncated: false, originalLength: body.length });
	});

	it("#given body longer than maxChars #when truncating #then result <= maxChars and ends with notice", () => {
		// given
		const body = "a".repeat(200);
		const maxChars = 100;
		const notice = noticeFor(relativePath);

		// when
		const result = truncateRule(body, { maxChars, relativePath });

		// then
		expect(result.truncated).toBe(true);
		expect(result.body.length).toBeLessThanOrEqual(maxChars);
		expect(result.body.endsWith(notice)).toBe(true);
	});

	it("#given body length within notice length of maxChars #when truncating #then result has notice", () => {
		// given
		const notice = noticeFor(relativePath);
		const maxChars = notice.length + 5;
		const body = "b".repeat(maxChars + 1);

		// when
		const result = truncateRule(body, { maxChars, relativePath });

		// then
		expect(result.truncated).toBe(true);
		expect(result.body).toBe(`${"b".repeat(5)}${notice}`);
	});

	it("#given relativePath substituted into notice #when truncating #then notice contains the path", () => {
		// given
		const body = "c".repeat(200);
		const customPath = ".claude/rules/python.md";

		// when
		const result = truncateRule(body, { maxChars: 100, relativePath: customPath });

		// then
		expect(result.body).toContain(customPath);
		expect(result.body).not.toContain("{path}");
	});

	it("#given originalLength preserved #when truncating large body #then originalLength === body.length", () => {
		// given
		const body = "d".repeat(500);

		// when
		const result = truncateRule(body, { maxChars: 120, relativePath });

		// then
		expect(result.originalLength).toBe(body.length);
	});

	it("#given maxChars smaller than notice #when truncating #then returns notice only", () => {
		// given
		const body = "e".repeat(200);
		const notice = noticeFor(relativePath);

		// when
		const result = truncateRule(body, { maxChars: notice.length - 1, relativePath });

		// then
		expect(result).toEqual({ body: notice, truncated: true, originalLength: body.length });
	});

	it("#given empty body #when truncating #then returns empty unchanged", () => {
		// given
		const body = "";

		// when
		const result = truncateRule(body, { maxChars: 10, relativePath });

		// then
		expect(result).toEqual({ body, truncated: false, originalLength: body.length });
	});

	it("#given multibyte unicode body #when truncating #then result is valid UTF-16 string", () => {
		// given
		const body = "😀".repeat(80);
		const notice = noticeFor(relativePath);
		const maxChars = notice.length + 9;

		// when
		const result = truncateRule(body, { maxChars, relativePath });
		const prefix = result.body.slice(0, -notice.length);

		// then
		expect(result.body.length).toBeLessThanOrEqual(maxChars);
		expect(result.body.endsWith(notice)).toBe(true);
		expect(prefix.endsWith("\ud83d")).toBe(false);
	});
});

describe("truncateBudget", () => {
	it("#given rules total within budget #when budgeting #then all included unchanged", () => {
		// given
		const rules = [
			{ body: "first", relativePath: "first.md" },
			{ body: "second", relativePath: "second.md" },
		];

		// when
		const result = truncateBudget({ rules, maxResultChars: 20 });

		// then
		expect(result).toEqual([
			{ body: "first", truncated: false, relativePath: "first.md" },
			{ body: "second", truncated: false, relativePath: "second.md" },
		]);
	});

	it("#given first rule exceeds budget #when budgeting #then first rule truncated", () => {
		// given
		const rules = [{ body: "a".repeat(100), relativePath }];
		const notice = noticeFor(relativePath);
		const maxResultChars = notice.length + 10;

		// when
		const result = truncateBudget({ rules, maxResultChars });

		// then
		expect(result).toEqual([{ body: `${"a".repeat(10)}${notice}`, truncated: true, relativePath }]);
	});

	it("#given budget exhausted by first rule #when budgeting #then subsequent rules excluded", () => {
		// given
		const rules = [
			{ body: "exact", relativePath: "first.md" },
			{ body: "second", relativePath: "second.md" },
		];

		// when
		const result = truncateBudget({ rules, maxResultChars: "exact".length });

		// then
		expect(result).toEqual([{ body: "exact", truncated: false, relativePath: "first.md" }]);
	});

	it("#given empty rules array #when budgeting #then empty result", () => {
		// given
		const rules: ReadonlyArray<{ body: string; relativePath: string }> = [];

		// when
		const result = truncateBudget({ rules, maxResultChars: 100 });

		// then
		expect(result).toEqual([]);
	});

	it("#given rule body exactly equals budget #when budgeting #then included unchanged with no truncation", () => {
		// given
		const body = "12345";
		const rules = [{ body, relativePath }];

		// when
		const result = truncateBudget({ rules, maxResultChars: body.length });

		// then
		expect(result).toEqual([{ body, truncated: false, relativePath }]);
	});
});
