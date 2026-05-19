import type { LoadedRule, ParsedRule, RuleCandidate, RuleFrontmatter, RuleSource } from "../../src/rules/types.js";

export function frontmatterBlock(meta: Partial<RuleFrontmatter>): string {
	const lines: string[] = ["---"];
	for (const [key, value] of Object.entries(meta)) {
		if (Array.isArray(value)) {
			lines.push(`${key}: [${value.map((item) => JSON.stringify(item)).join(", ")}]`);
		} else if (typeof value === "boolean") {
			lines.push(`${key}: ${value}`);
		} else if (typeof value === "string") {
			lines.push(`${key}: ${JSON.stringify(value)}`);
		}
	}
	lines.push("---");
	return lines.join("\n");
}

export function ruleMarkdown(meta: Partial<RuleFrontmatter>, body: string): string {
	if (Object.keys(meta).length === 0) return body;
	return `${frontmatterBlock(meta)}\n${body}`;
}

export function malformedFrontmatter(body: string = "rule body"): string {
	return `---\nglobs: [unclosed\nalwaysApply: true\n---\n${body}`;
}

export function bomMarkdown(meta: Partial<RuleFrontmatter>, body: string): string {
	return `\uFEFF${ruleMarkdown(meta, body)}`;
}

export function crlfMarkdown(meta: Partial<RuleFrontmatter>, body: string): string {
	return ruleMarkdown(meta, body).replace(/\n/g, "\r\n");
}

export function largeRuleBody(charCount: number): string {
	return "x".repeat(charCount);
}

export function makeRuleCandidate(overrides: Partial<RuleCandidate> = {}): RuleCandidate {
	const path = overrides.path ?? "/tmp/sample/.omo/rules/sample.md";
	const realPath = overrides.realPath ?? path;
	const source: RuleSource = overrides.source ?? ".omo/rules";
	return {
		path,
		realPath,
		source,
		distance: overrides.distance ?? 0,
		isGlobal: overrides.isGlobal ?? false,
		isSingleFile: overrides.isSingleFile ?? false,
		relativePath: overrides.relativePath ?? ".omo/rules/sample.md",
	};
}

export function makeLoadedRule(overrides: Partial<LoadedRule> = {}): LoadedRule {
	const candidate = makeRuleCandidate(overrides);
	return {
		...candidate,
		frontmatter: overrides.frontmatter ?? {},
		body: overrides.body ?? "Sample rule body.",
		contentHash: overrides.contentHash ?? "deadbeef",
		matchReason: overrides.matchReason ?? "alwaysApply",
	};
}

export function makeParsedRule(overrides: Partial<ParsedRule> = {}): ParsedRule {
	const parsed: ParsedRule = {
		frontmatter: overrides.frontmatter ?? {},
		body: overrides.body ?? "body",
	};
	if (overrides.diagnostic !== undefined) parsed.diagnostic = overrides.diagnostic;
	return parsed;
}
