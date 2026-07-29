import { truncateBudget, truncateRule } from "./truncator.js";
import type { LoadedRule } from "./types.js";

export interface FormatOptions {
	maxRuleChars: number;
	maxResultChars: number;
}

type TruncatedRule = {
	path: string;
	relativePath: string;
	body: string;
};

function formatRule(rule: TruncatedRule): string {
	return `Instructions from: ${rule.path}\n${rule.body}`;
}

function truncateRules(rules: ReadonlyArray<LoadedRule>, options: FormatOptions, blockHeader: string): TruncatedRule[] {
	const truncatedRules: TruncatedRule[] = [];
	let remainingBudget = options.maxResultChars - blockHeader.length;

	for (const rule of rules) {
		const perRuleBody = truncateRule(rule.body, {
			maxChars: options.maxRuleChars,
			relativePath: rule.relativePath,
		}).body;
		const separator = truncatedRules.length === 0 ? "" : "\n\n";
		const ruleHeader = `${separator}Instructions from: ${rule.path}\n`;
		const budgetedRule = truncateBudget({
			rules: [{ body: perRuleBody, relativePath: rule.relativePath }],
			maxResultChars: remainingBudget - ruleHeader.length,
		})[0];
		if (budgetedRule === undefined) {
			break;
		}

		truncatedRules.push({
			path: rule.path,
			relativePath: budgetedRule.relativePath,
			body: budgetedRule.body,
		});
		remainingBudget -= ruleHeader.length + budgetedRule.body.length;
	}

	return truncatedRules;
}

export function formatStaticBlock(rules: ReadonlyArray<LoadedRule>, options: FormatOptions): string {
	if (rules.length === 0) {
		return "";
	}

	const blockHeader = "\n\n## Project Instructions\n";
	const truncatedRules = truncateRules(rules, options, blockHeader);
	return truncatedRules.length === 0 ? "" : `${blockHeader}${truncatedRules.map(formatRule).join("\n\n")}`;
}

export function formatDynamicBlock(
	rules: ReadonlyArray<LoadedRule>,
	targetRelativePath: string,
	options: FormatOptions,
): string {
	if (rules.length === 0) {
		return "";
	}

	const blockHeader = `\n\nAdditional project instructions matched for ${targetRelativePath}:\n\n`;
	const truncatedRules = truncateRules(rules, options, blockHeader);
	return truncatedRules.length === 0 ? "" : `${blockHeader}${truncatedRules.map(formatRule).join("\n\n")}`;
}
