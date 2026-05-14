import { createHash } from "node:crypto";
import picomatch from "picomatch";
import type { MatchReason, RuleFrontmatter } from "./types.js";

export interface MatcherInput {
	frontmatter: RuleFrontmatter;
	isSingleFile: boolean;
	/** Path bases to try matching against (POSIX-normalized). */
	pathBases: { projectRelative: string; scopeRelative?: string; basename: string };
}

export interface MatchResult {
	matched: boolean;
	reason: MatchReason;
}

export function matchRule(input: MatcherInput): MatchResult {
	if (input.isSingleFile) {
		return { matched: true, reason: "single-file" };
	}

	if (input.frontmatter.alwaysApply === true) {
		return { matched: true, reason: "alwaysApply" };
	}

	const patterns = normalizeGlobs(input.frontmatter);
	if (patterns.length === 0) {
		return noMatch();
	}

	const pathBases = [
		normalizePath(input.pathBases.projectRelative),
		input.pathBases.scopeRelative ? normalizePath(input.pathBases.scopeRelative) : undefined,
		normalizePath(input.pathBases.basename),
	].filter((pathBase): pathBase is string => pathBase !== undefined);

	const positivePatterns = patterns.filter((pattern) => !pattern.startsWith("!"));
	const negativePatterns = patterns.filter((pattern) => pattern.startsWith("!"));
	const negativeMatchers = negativePatterns.map((pattern) => picomatch(pattern.slice(1), { bash: true, dot: true }));

	for (const pattern of positivePatterns) {
		const isMatch = picomatch(pattern, { bash: true, dot: true });

		for (const pathBase of pathBases) {
			if (!isMatch(pathBase)) {
				continue;
			}

			if (isExcluded(pathBase, negativeMatchers)) {
				return noMatch();
			}

			return { matched: true, reason: { kind: "glob", pattern } };
		}
	}

	return noMatch();
}

export function normalizeGlobs(frontmatter: RuleFrontmatter): string[] {
	const patterns = [
		...normalizePatternList(frontmatter.globs),
		...normalizePatternList(frontmatter.paths),
		...normalizePatternList(frontmatter.applyTo),
	];

	return [...new Set(patterns.map(normalizePath))];
}

export function hashContent(body: string): string {
	return createHash("sha256").update(body).digest("hex");
}

function normalizePatternList(patterns: string | string[] | undefined): string[] {
	if (patterns === undefined) {
		return [];
	}

	return Array.isArray(patterns) ? patterns : [patterns];
}

function normalizePath(path: string): string {
	return path.replaceAll("\\", "/");
}

function isExcluded(pathBase: string, negativeMatchers: ReadonlyArray<(path: string) => boolean>): boolean {
	for (const isMatch of negativeMatchers) {
		if (isMatch(pathBase)) {
			return true;
		}
	}

	return false;
}

function noMatch(): MatchResult {
	return { matched: false, reason: { kind: "no-match" } };
}
