import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { ToolResultEvent } from "@mariozechner/pi-coding-agent";

import {
	clearSession,
	createSessionState,
	isDynamicInjected as isDynamicInjectedInState,
	isStaticInjected as isStaticInjectedInState,
	markDynamicInjected as markDynamicInjectedInState,
	markStaticInjected as markStaticInjectedInState,
} from "./cache.js";
import {
	DEFAULT_MAX_RESULT_CHARS,
	DEFAULT_MAX_RULE_CHARS,
	PROJECT_SINGLE_FILES,
	SOURCE_PRIORITY,
} from "./constants.js";
import { formatDynamicBlock, formatStaticBlock } from "./formatter.js";
import { hashContent, matchRule } from "./matcher.js";
import { sortCandidates } from "./ordering.js";
import { parseRule } from "./parser.js";
import type { LoadedRule, MatchReason, PiRulesConfig, RuleCandidate, RuleDiagnostic, SessionState } from "./types.js";

interface LoadedRuleContent {
	frontmatter: LoadedRule["frontmatter"];
	body: string;
	contentHash: string;
	diagnostic?: string;
}

type CandidateProjectMembership = Map<string, boolean>;

export interface EngineDeps {
	findCandidates: (options: {
		projectRoot: string | null;
		targetFile: string | null;
		homeDir?: string;
		disabledSources?: ReadonlySet<string>;
		skipUserHome?: boolean;
	}) => RuleCandidate[];
	readFile: (path: string) => string | null;
	findProjectRoot: (startPath: string) => string | null;
	extractToolPaths: (event: ToolResultEvent, cwd: string) => string[];
}

export interface Engine {
	state: SessionState;
	config: PiRulesConfig;
	loadStaticRules(cwd: string): { rules: LoadedRule[]; diagnostics: RuleDiagnostic[] };
	loadDynamicRules(
		cwd: string,
		targetPaths: ReadonlyArray<string>,
	): { rules: LoadedRule[]; diagnostics: RuleDiagnostic[] };
	formatStatic(rules: ReadonlyArray<LoadedRule>): string;
	formatDynamic(rules: ReadonlyArray<LoadedRule>, target: string): string;
	resetSession(cwd?: string): void;
	isStaticInjected(rule: LoadedRule): boolean;
	isDynamicInjected(rule: LoadedRule): boolean;
	markStaticInjected(rule: LoadedRule): boolean;
	markDynamicInjected(rule: LoadedRule): boolean;
}

const ROOT_SINGLE_FILE_SOURCES = new Set(PROJECT_SINGLE_FILES.filter((source) => !source.includes("/")));

export function defaultConfig(): PiRulesConfig {
	return {
		disabled: false,
		mode: "both",
		maxRuleChars: DEFAULT_MAX_RULE_CHARS,
		maxResultChars: DEFAULT_MAX_RESULT_CHARS,
		enabledSources: "auto",
	};
}

export function createEngine(config: PiRulesConfig, deps: EngineDeps): Engine {
	const state = createSessionState();

	function loadStaticRules(cwd: string): { rules: LoadedRule[]; diagnostics: RuleDiagnostic[] } {
		state.cwd = cwd;
		if (config.disabled || config.mode === "off" || config.mode === "dynamic") {
			return emptyLoadResult(state);
		}

		const projectRoot = deps.findProjectRoot(cwd);
		const candidates = deps.findCandidates({
			projectRoot,
			targetFile: null,
			disabledSources: disabledSourcesFor(config),
		});
		const result = loadStaticCandidates(candidates, deps, projectRoot);
		storeLastLoad(state, result.rules, result.diagnostics);
		return result;
	}

	function loadDynamicRules(
		cwd: string,
		targetPaths: ReadonlyArray<string>,
	): { rules: LoadedRule[]; diagnostics: RuleDiagnostic[] } {
		state.cwd = cwd;
		if (config.disabled || config.mode === "off" || config.mode === "static" || targetPaths.length === 0) {
			return emptyLoadResult(state);
		}

		const rules: LoadedRule[] = [];
		const diagnostics: RuleDiagnostic[] = [];
		const seenRules = new Set<string>();
		const loadedRuleContent = new Map<string, LoadedRuleContent | null>();
		const projectMembership = new Map<string, boolean>();
		const disabledSources = disabledSourcesFor(config);

		for (const targetFile of uniqueStrings(targetPaths)) {
			const projectRoot = deps.findProjectRoot(targetFile);
			const candidates = deps.findCandidates({ projectRoot, targetFile, disabledSources });

			for (const candidate of sortCandidates(candidates)) {
				const loadedRule = loadCandidate(
					candidate,
					deps,
					diagnostics,
					projectRoot,
					loadedRuleContent,
					projectMembership,
				);
				if (loadedRule === null) {
					continue;
				}

				const matchResult = matchRule({
					frontmatter: loadedRule.frontmatter,
					isSingleFile: candidate.isSingleFile,
					pathBases: pathBasesForTarget(projectRoot, targetFile, candidate),
				});

				if (!matchResult.matched) {
					continue;
				}

				const dedupKey = ruleDedupKey(loadedRule);
				if (seenRules.has(dedupKey)) {
					continue;
				}

				seenRules.add(dedupKey);
				rules.push({ ...loadedRule, matchReason: matchResult.reason });
			}
		}

		const sortedRules = sortCandidates(rules);
		storeLastLoad(state, sortedRules, diagnostics);
		return { rules: sortedRules, diagnostics };
	}

	return {
		state,
		config,
		loadStaticRules,
		loadDynamicRules,
		formatStatic: (rules) =>
			formatStaticBlock(rules, { maxRuleChars: config.maxRuleChars, maxResultChars: config.maxResultChars }),
		formatDynamic: (rules, target) =>
			formatDynamicBlock(rules, target, {
				maxRuleChars: config.maxRuleChars,
				maxResultChars: config.maxResultChars,
			}),
		resetSession: (cwd) => {
			clearSession(state);
			if (cwd !== undefined) {
				state.cwd = cwd;
			}
		},
		isStaticInjected: (rule) => isStaticInjectedInState(state, rule),
		isDynamicInjected: (rule) => isDynamicInjectedInState(state, rule),
		markStaticInjected: (rule) => markStaticInjectedInState(state, rule),
		markDynamicInjected: (rule) => markDynamicInjectedInState(state, rule),
	};
}

function loadStaticCandidates(candidates: ReadonlyArray<RuleCandidate>, deps: EngineDeps, projectRoot: string | null) {
	const rules: LoadedRule[] = [];
	const diagnostics: RuleDiagnostic[] = [];
	let rootSingleFileSelected = false;

	for (const candidate of sortCandidates(candidates)) {
		if (isDedupedRootSingleFile(candidate, rootSingleFileSelected)) {
			continue;
		}

		const loadedRule = loadCandidate(candidate, deps, diagnostics, projectRoot);
		if (loadedRule === null) {
			continue;
		}

		const matchReason = staticMatchReason(loadedRule);
		if (matchReason === null) {
			continue;
		}

		if (isRootSingleFile(candidate)) {
			rootSingleFileSelected = true;
		}

		rules.push({ ...loadedRule, matchReason });
	}

	return { rules: sortCandidates(rules), diagnostics };
}

function loadCandidate(
	candidate: RuleCandidate,
	deps: EngineDeps,
	diagnostics: RuleDiagnostic[],
	projectRoot: string | null,
	loadedRuleContent?: Map<string, LoadedRuleContent | null>,
	projectMembership?: CandidateProjectMembership,
): (LoadedRule & { matchReason: MatchReason }) | null {
	if (!isCandidateWithinProjectCached(candidate, projectRoot, projectMembership)) {
		diagnostics.push({
			severity: "warning",
			source: candidate.path,
			message: "Rule file resolves outside project root",
		});
		return null;
	}

	const cachedContent = loadedRuleContent?.get(candidate.realPath);
	if (cachedContent !== undefined) {
		return loadedRuleFromContent(candidate, cachedContent, diagnostics);
	}

	const content = deps.readFile(candidate.path);
	if (content === null) {
		loadedRuleContent?.set(candidate.realPath, null);
		diagnostics.push({ severity: "warning", source: candidate.path, message: "Unable to read rule file" });
		return null;
	}

	const parsed = parseRule(content);
	const loadedContent = {
		frontmatter: parsed.frontmatter,
		body: parsed.body,
		contentHash: hashContent(parsed.body),
		diagnostic: parsed.diagnostic,
	} satisfies LoadedRuleContent;
	loadedRuleContent?.set(candidate.realPath, loadedContent);
	return loadedRuleFromContent(candidate, loadedContent, diagnostics);
}

function loadedRuleFromContent(
	candidate: RuleCandidate,
	content: LoadedRuleContent | null,
	diagnostics: RuleDiagnostic[],
): (LoadedRule & { matchReason: MatchReason }) | null {
	if (content === null) {
		diagnostics.push({ severity: "warning", source: candidate.path, message: "Unable to read rule file" });
		return null;
	}

	if (content.diagnostic !== undefined) {
		diagnostics.push({ severity: "warning", source: candidate.path, message: content.diagnostic });
	}

	return {
		...candidate,
		frontmatter: content.frontmatter,
		body: content.body,
		contentHash: content.contentHash,
		matchReason: { kind: "no-match" },
	};
}

function ruleDedupKey(rule: LoadedRule): string {
	return `${rule.realPath}::${rule.contentHash}`;
}

function isCandidateWithinProject(candidate: RuleCandidate, projectRoot: string | null): boolean {
	if (candidate.isGlobal) {
		return true;
	}

	if (projectRoot === null) {
		return false;
	}

	const relativeRealPath = relative(resolve(projectRoot), resolve(candidate.realPath));
	return relativeRealPath === "" || (!relativeRealPath.startsWith("..") && !isAbsolute(relativeRealPath));
}

function isCandidateWithinProjectCached(
	candidate: RuleCandidate,
	projectRoot: string | null,
	projectMembership: CandidateProjectMembership | undefined,
): boolean {
	if (projectMembership === undefined) {
		return isCandidateWithinProject(candidate, projectRoot);
	}

	const cacheKey = `${projectRoot ?? ""}\0${candidate.realPath}`;
	const cached = projectMembership.get(cacheKey);
	if (cached !== undefined) {
		return cached;
	}

	const isWithinProject = isCandidateWithinProject(candidate, projectRoot);
	projectMembership.set(cacheKey, isWithinProject);
	return isWithinProject;
}

function staticMatchReason(rule: LoadedRule): MatchReason | null {
	if (rule.frontmatter.alwaysApply === true) {
		return "alwaysApply";
	}

	if (rule.isSingleFile) {
		return "single-file";
	}

	return null;
}

function disabledSourcesFor(config: PiRulesConfig): ReadonlySet<string> | undefined {
	if (config.enabledSources === "auto") {
		return undefined;
	}

	const enabledSources = new Set(config.enabledSources);
	return new Set([...SOURCE_PRIORITY.keys()].filter((source) => !enabledSources.has(source)));
}

function isDedupedRootSingleFile(candidate: RuleCandidate, rootSingleFileSelected: boolean): boolean {
	return rootSingleFileSelected && isRootSingleFile(candidate);
}

function isRootSingleFile(candidate: RuleCandidate): boolean {
	return candidate.distance === 0 && candidate.isSingleFile && ROOT_SINGLE_FILE_SOURCES.has(candidate.source);
}

function pathBasesForTarget(
	projectRoot: string | null,
	targetFile: string,
	candidate: RuleCandidate,
): { projectRelative: string; scopeRelative?: string; basename: string } {
	const targetBasename = basename(targetFile);
	if (projectRoot === null) {
		return { projectRelative: targetBasename, basename: targetBasename };
	}

	const projectRelative = toPosixPath(relative(projectRoot, targetFile));
	const scopeDirectory = scopeDirectoryForCandidate(projectRoot, candidate);
	if (scopeDirectory === null) {
		return { projectRelative, basename: targetBasename };
	}

	return {
		projectRelative,
		scopeRelative: toPosixPath(relative(scopeDirectory, targetFile)),
		basename: targetBasename,
	};
}

function scopeDirectoryForCandidate(projectRoot: string, candidate: RuleCandidate): string | null {
	if (candidate.isGlobal) {
		return null;
	}

	if (candidate.isSingleFile) {
		return dirname(candidate.path);
	}

	const sourceIndex = candidate.relativePath.indexOf(candidate.source);
	if (sourceIndex === -1) {
		return projectRoot;
	}

	const scopeRelativeDirectory = candidate.relativePath.slice(0, sourceIndex).replace(/\/$/, "");
	return scopeRelativeDirectory.length === 0 ? projectRoot : join(projectRoot, scopeRelativeDirectory);
}

function toPosixPath(path: string): string {
	return path.replaceAll("\\", "/");
}

function uniqueStrings(values: ReadonlyArray<string>): string[] {
	return [...new Set(values)];
}

function storeLastLoad(
	state: SessionState,
	rules: ReadonlyArray<LoadedRule>,
	diagnostics: ReadonlyArray<RuleDiagnostic>,
): void {
	state.loadedRules.length = 0;
	state.loadedRules.push(...rules);
	state.diagnostics.length = 0;
	state.diagnostics.push(...diagnostics);
}

function emptyLoadResult(state: SessionState): { rules: LoadedRule[]; diagnostics: RuleDiagnostic[] } {
	storeLastLoad(state, [], []);
	return { rules: [], diagnostics: [] };
}
