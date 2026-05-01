import { describe, expect, it } from "vitest";

import { parseRule } from "../src/rules/parser.js";
import {
	bomMarkdown,
	crlfMarkdown,
	frontmatterBlock,
	malformedFrontmatter,
	ruleMarkdown,
} from "./helpers/rule-fixtures.js";

describe("parseRule", () => {
	it("#given markdown without frontmatter #when parsing #then returns empty frontmatter and full body", () => {
		// given
		const content = "Use strict TypeScript.\n---\nKeep this horizontal rule.";

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: {}, body: content });
	});

	it("#given valid frontmatter #when parsing #then extracts description globs and alwaysApply", () => {
		// given
		const content = ruleMarkdown(
			{ description: "TypeScript rules", globs: ["**/*.ts", "**/*.tsx"], alwaysApply: true },
			"Use type-only imports.",
		);

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({
			frontmatter: { description: "TypeScript rules", globs: ["**/*.ts", "**/*.tsx"], alwaysApply: true },
			body: "Use type-only imports.",
		});
	});

	it("#given empty frontmatter #when parsing #then returns empty frontmatter and empty body", () => {
		// given
		const content = "---\n---\n";

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: {}, body: "" });
	});

	it("#given malformed YAML #when parsing #then keeps full content and returns diagnostic", () => {
		// given
		const content = malformedFrontmatter("body after malformed frontmatter");

		// when
		const result = parseRule(content);

		// then
		expect(result.frontmatter).toEqual({});
		expect(result.body).toBe(content);
		expect(result.diagnostic).toContain("Malformed frontmatter");
	});

	it("#given missing closing delimiter #when parsing #then treats full content as body with diagnostic", () => {
		// given
		const content = "---\ndescription: Missing close\nUse this as body.";

		// when
		const result = parseRule(content);

		// then
		expect(result.frontmatter).toEqual({});
		expect(result.body).toBe(content);
		expect(result.diagnostic).toContain("Missing closing frontmatter delimiter");
	});

	it("#given frontmatter only file #when parsing #then returns parsed frontmatter and empty body", () => {
		// given
		const content = frontmatterBlock({ alwaysApply: true, description: "Global" });

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { alwaysApply: true, description: "Global" }, body: "" });
	});

	it("#given CRLF line endings #when parsing #then extracts frontmatter and preserves CRLF body", () => {
		// given
		const content = crlfMarkdown({ globs: "**/*.ts" }, "Line one\nLine two");

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { globs: "**/*.ts" }, body: "Line one\r\nLine two" });
	});

	it("#given BOM prefixed content #when parsing #then strips BOM before frontmatter detection", () => {
		// given
		const content = bomMarkdown({ description: "BOM rule" }, "Body without BOM.");

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { description: "BOM rule" }, body: "Body without BOM." });
	});

	it("#given body containing horizontal rule markers #when parsing #then preserves body markers verbatim", () => {
		// given
		const body = "Before\n---\nAfter";
		const content = ruleMarkdown({ description: "Horizontal body" }, body);

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { description: "Horizontal body" }, body });
	});

	it("#given inline array globs #when parsing #then returns glob array", () => {
		// given
		const content = `---\nglobs: ["**/*.ts", "**/*.tsx"]\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { globs: ["**/*.ts", "**/*.tsx"] }, body: "body" });
	});

	it("#given comma separated globs #when parsing #then normalizes values into glob array", () => {
		// given
		const content = `---\nglobs: **/*.ts, **/*.tsx\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { globs: ["**/*.ts", "**/*.tsx"] }, body: "body" });
	});

	it("#given multi-line array globs #when parsing #then returns glob array", () => {
		// given
		const content = `---\nglobs:\n  - **/*.ts\n  - **/*.tsx\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { globs: ["**/*.ts", "**/*.tsx"] }, body: "body" });
	});

	it("#given paths alias #when parsing #then normalizes paths into globs", () => {
		// given
		const content = `---\npaths: ["src/**/*.ts", "test/**/*.ts"]\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { globs: ["src/**/*.ts", "test/**/*.ts"] }, body: "body" });
	});

	it("#given applyTo alias #when parsing #then normalizes applyTo into globs", () => {
		// given
		const content = `---\napplyTo: "src/**/*.tsx"\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { globs: "src/**/*.tsx" }, body: "body" });
	});

	it("#given globs paths and applyTo #when parsing #then merges and deduplicates in order", () => {
		// given
		const content = `---\nglobs: ["src/**/*.ts", "src/**/*.tsx"]\npaths: ["src/**/*.ts", "scripts/**/*.ts"]\napplyTo: scripts/**/*.ts, docs/**/*.md\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({
			frontmatter: { globs: ["src/**/*.ts", "src/**/*.tsx", "scripts/**/*.ts", "docs/**/*.md"] },
			body: "body",
		});
	});

	it("#given alwaysApply true #when parsing #then returns true boolean", () => {
		// given
		const content = `---\nalwaysApply: true\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { alwaysApply: true }, body: "body" });
	});

	it("#given alwaysApply false #when parsing #then returns false boolean", () => {
		// given
		const content = `---\nalwaysApply: false\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { alwaysApply: false }, body: "body" });
	});

	it("#given JSON quoted string values #when parsing #then unquotes escaped strings", () => {
		// given
		const content = `---\ndescription: "Use \\"strict\\" mode"\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { description: 'Use "strict" mode' }, body: "body" });
	});

	it("#given unicode body content #when parsing #then preserves unicode body", () => {
		// given
		const body = "Preserve unicode 世界 and emoji ✨ in the body.";
		const content = ruleMarkdown({ description: "Unicode" }, body);

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { description: "Unicode" }, body });
	});

	it("#given single glob string #when parsing #then keeps single glob as string", () => {
		// given
		const content = `---\nglobs: **/*.md\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { globs: "**/*.md" }, body: "body" });
	});

	it("#given unquoted description #when parsing #then returns raw string", () => {
		// given
		const content = `---\ndescription: Plain rule description\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { description: "Plain rule description" }, body: "body" });
	});

	it("#given unknown frontmatter keys #when parsing #then ignores unknown fields", () => {
		// given
		const content = `---\ndescription: Known\nunknown: ignored\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({ frontmatter: { description: "Known" }, body: "body" });
	});

	it("#given comments in frontmatter #when parsing #then removes comments before values", () => {
		// given
		const content = `---\n# top comment\ndescription: Commented # trailing comment\nglobs: ["**/*.ts", "**/*.tsx"] # trailing comment\n---\nbody`;

		// when
		const result = parseRule(content);

		// then
		expect(result).toEqual({
			frontmatter: { description: "Commented", globs: ["**/*.ts", "**/*.tsx"] },
			body: "body",
		});
	});
});
