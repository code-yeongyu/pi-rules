import { realpathSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { GLOBAL_DISTANCE } from "../src/rules/constants.js";
import { findRuleCandidates } from "../src/rules/finder.js";
import type { RuleCandidate, RuleSource } from "../src/rules/types.js";
import { createTempFs, type TempFs } from "./helpers/temp-fs.js";

describe("findRuleCandidates", () => {
	const tempFileSystems: TempFs[] = [];

	const createTrackedTempFs = (): TempFs => {
		const tempFileSystem = createTempFs();
		tempFileSystems.push(tempFileSystem);
		return tempFileSystem;
	};

	afterEach(() => {
		for (const tempFileSystem of tempFileSystems) {
			tempFileSystem.cleanup();
		}
		tempFileSystems.length = 0;
	});

	const findByRelativePath = (candidates: RuleCandidate[], relativePath: string): RuleCandidate => {
		const candidate = candidates.find((item) => item.relativePath === relativePath);
		if (candidate === undefined) {
			throw new Error(`Missing candidate for relative path: ${relativePath}`);
		}
		return candidate;
	};

	const findBySource = (candidates: RuleCandidate[], source: RuleSource): RuleCandidate => {
		const candidate = candidates.find((item) => item.source === source);
		if (candidate === undefined) {
			throw new Error(`Missing candidate for source: ${source}`);
		}
		return candidate;
	};

	it('#given project with .omo/rules/core.md #when finding from project root #then candidate has source ".omo/rules" and distance 0', () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		const rulePath = tempFileSystem.write("repo/.omo/rules/core.md", "Core rule.");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile: null, homeDir: tempFileSystem.path("home") });

		// then
		expect(result).toContainEqual({
			path: rulePath,
			realPath: realpathSync.native(rulePath),
			source: ".omo/rules",
			distance: 0,
			isGlobal: false,
			isSingleFile: false,
			relativePath: ".omo/rules/core.md",
		});
	});

	it("#given project with .omo/rules in nested package #when finding from nested file #then both project-root and nested rules included with correct distances", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		const rootRulePath = tempFileSystem.write("repo/.omo/rules/root.md", "Root rule.");
		const nestedRulePath = tempFileSystem.write("repo/packages/app/.omo/rules/nested.md", "Nested rule.");
		const targetFile = tempFileSystem.write("repo/packages/app/src/index.ts", "export {};\n");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile, homeDir: tempFileSystem.path("home") });

		// then
		expect(findByRelativePath(result, ".omo/rules/root.md")).toMatchObject({
			path: rootRulePath,
			source: ".omo/rules",
			distance: 3,
		});
		expect(findByRelativePath(result, "packages/app/.omo/rules/nested.md")).toMatchObject({
			path: nestedRulePath,
			source: ".omo/rules",
			distance: 1,
		});
	});

	it('#given project with AGENTS.md at root #when finding #then candidate has source "AGENTS.md" and isSingleFile true', () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		const rulePath = tempFileSystem.write("repo/AGENTS.md", "Agent rule.");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile: null, homeDir: tempFileSystem.path("home") });

		// then
		expect(result).toContainEqual({
			path: rulePath,
			realPath: realpathSync.native(rulePath),
			source: "AGENTS.md",
			distance: 0,
			isGlobal: false,
			isSingleFile: true,
			relativePath: "AGENTS.md",
		});
	});

	it("#given project with CLAUDE.md and AGENTS.md and CONTEXT.md at root #when finding #then ALL three returned (dedup is caller's job)", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		tempFileSystem.write("repo/AGENTS.md", "Agent rule.");
		tempFileSystem.write("repo/CLAUDE.md", "Claude rule.");
		tempFileSystem.write("repo/CONTEXT.md", "Context rule.");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile: null, homeDir: tempFileSystem.path("home") });

		// then
		expect(result.map((candidate) => candidate.source)).toEqual(
			expect.arrayContaining(["AGENTS.md", "CLAUDE.md", "CONTEXT.md"]),
		);
	});

	it('#given project with .cursor/rules/ui.mdc #when finding #then .mdc included with source ".cursor/rules"', () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		const rulePath = tempFileSystem.write("repo/.cursor/rules/ui.mdc", "Cursor rule.");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile: null, homeDir: tempFileSystem.path("home") });

		// then
		expect(findBySource(result, ".cursor/rules")).toMatchObject({
			path: rulePath,
			source: ".cursor/rules",
			relativePath: ".cursor/rules/ui.mdc",
		});
	});

	it('#given project with .github/instructions/foo.instructions.md #when finding #then included with source ".github/instructions"', () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		const rulePath = tempFileSystem.write("repo/.github/instructions/foo.instructions.md", "GitHub instruction.");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile: null, homeDir: tempFileSystem.path("home") });

		// then
		expect(findBySource(result, ".github/instructions")).toMatchObject({
			path: rulePath,
			source: ".github/instructions",
			relativePath: ".github/instructions/foo.instructions.md",
		});
	});

	it('#given project with .github/copilot-instructions.md #when finding #then included with source ".github/copilot-instructions.md" and isSingleFile true', () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		const rulePath = tempFileSystem.write("repo/.github/copilot-instructions.md", "Copilot instruction.");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile: null, homeDir: tempFileSystem.path("home") });

		// then
		expect(findBySource(result, ".github/copilot-instructions.md")).toMatchObject({
			path: rulePath,
			isSingleFile: true,
			relativePath: ".github/copilot-instructions.md",
		});
	});

	it("#given user home with ~/.omo/rules/global.md #when finding with homeDir override #then candidate has isGlobal true and distance GLOBAL_DISTANCE", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const homeDir = tempFileSystem.mkdir("home");
		const rulePath = tempFileSystem.write("home/.omo/rules/global.md", "Global rule.");

		// when
		const result = findRuleCandidates({ projectRoot: null, targetFile: null, homeDir });

		// then
		expect(result).toContainEqual({
			path: rulePath,
			realPath: realpathSync.native(rulePath),
			source: "~/.omo/rules",
			distance: GLOBAL_DISTANCE,
			isGlobal: true,
			isSingleFile: false,
			relativePath: ".omo/rules/global.md",
		});
	});

	it('#given user home with ~/.config/opencode/AGENTS.md #when finding with homeDir override #then included with source "~/.config/opencode/AGENTS.md"', () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const homeDir = tempFileSystem.mkdir("home");
		const rulePath = tempFileSystem.write("home/.config/opencode/AGENTS.md", "OpenCode agent rule.");

		// when
		const result = findRuleCandidates({ projectRoot: null, targetFile: null, homeDir });

		// then
		expect(result).toContainEqual({
			path: rulePath,
			realPath: realpathSync.native(rulePath),
			source: "~/.config/opencode/AGENTS.md",
			distance: GLOBAL_DISTANCE,
			isGlobal: true,
			isSingleFile: true,
			relativePath: ".config/opencode/AGENTS.md",
		});
	});

	it('#given disabledSources contains ".cursor/rules" #when finding #then no .cursor candidates', () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		tempFileSystem.write("repo/.cursor/rules/ui.mdc", "Cursor rule.");
		tempFileSystem.write("repo/.omo/rules/core.md", "Core rule.");

		// when
		const result = findRuleCandidates({
			projectRoot,
			targetFile: null,
			homeDir: tempFileSystem.path("home"),
			disabledSources: new Set([".cursor/rules"]),
		});

		// then
		expect(result.some((candidate) => candidate.source === ".cursor/rules")).toBe(false);
		expect(result.some((candidate) => candidate.source === ".omo/rules")).toBe(true);
	});

	it("#given skipUserHome=true #when finding #then no user-home candidates regardless of files", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		const homeDir = tempFileSystem.mkdir("home");
		tempFileSystem.write("home/.omo/rules/global.md", "Global rule.");
		tempFileSystem.write("home/.config/opencode/AGENTS.md", "OpenCode agent rule.");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile: null, homeDir, skipUserHome: true });

		// then
		expect(result.some((candidate) => candidate.isGlobal)).toBe(false);
	});

	it("#given projectRoot is null and skipUserHome is true #when finding #then empty array", () => {
		// given
		const tempFileSystem = createTrackedTempFs();

		// when
		const result = findRuleCandidates({
			projectRoot: null,
			targetFile: null,
			homeDir: tempFileSystem.path("home"),
			skipUserHome: true,
		});

		// then
		expect(result).toEqual([]);
	});

	it("#given projectRoot is null and skipUserHome is false #when finding #then user-home candidates returned", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const homeDir = tempFileSystem.mkdir("home");
		tempFileSystem.write("home/.claude/rules/global.md", "Claude global rule.");

		// when
		const result = findRuleCandidates({ projectRoot: null, targetFile: null, homeDir });

		// then
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ source: "~/.claude/rules", isGlobal: true });
	});

	it("#given walk-up from nested target file #when finding #then rules from each ancestor level discovered", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		tempFileSystem.write("repo/.omo/rules/root.md", "Root rule.");
		tempFileSystem.write("repo/packages/.omo/rules/packages.md", "Packages rule.");
		tempFileSystem.write("repo/packages/app/.omo/rules/app.md", "App rule.");
		const targetFile = tempFileSystem.write("repo/packages/app/src/file.ts", "export {};\n");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile, homeDir: tempFileSystem.path("home") });

		// then
		expect(findByRelativePath(result, "packages/app/.omo/rules/app.md")).toMatchObject({ distance: 1 });
		expect(findByRelativePath(result, "packages/.omo/rules/packages.md")).toMatchObject({ distance: 2 });
		expect(findByRelativePath(result, ".omo/rules/root.md")).toMatchObject({ distance: 3 });
	});

	it("#given target file in subdir with own .omo/rules #when finding #then closest .omo rules have distance 0, parent .omo rules have distance > 0", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		tempFileSystem.write("repo/.omo/rules/root.md", "Root rule.");
		tempFileSystem.write("repo/src/.omo/rules/src.md", "Src rule.");
		const targetFile = tempFileSystem.write("repo/src/file.ts", "export {};\n");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile, homeDir: tempFileSystem.path("home") });

		// then
		expect(findByRelativePath(result, "src/.omo/rules/src.md")).toMatchObject({ distance: 0 });
		expect(findByRelativePath(result, ".omo/rules/root.md")).toMatchObject({ distance: 1 });
	});

	it("#given symlink to a rule file #when finding #then realPath populated correctly", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const projectRoot = tempFileSystem.mkdir("repo");
		const targetRulePath = tempFileSystem.write("repo/shared/target.md", "Shared rule.");
		const linkPath = tempFileSystem.symlink("repo/shared/target.md", "repo/.omo/rules/linked.md");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile: null, homeDir: tempFileSystem.path("home") });

		// then
		expect(findByRelativePath(result, ".omo/rules/linked.md")).toMatchObject({
			path: linkPath,
			realPath: realpathSync.native(targetRulePath),
		});
	});

	it("#given project root marker (.git) and rules above it #when finding #then rules outside project root NOT included", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		tempFileSystem.mkdir("outer/.git");
		tempFileSystem.write("outer/.omo/rules/outside.md", "Outside rule.");
		const projectRoot = tempFileSystem.mkdir("outer/packages/app");
		tempFileSystem.mkdir("outer/packages/app/.git");
		tempFileSystem.write("outer/packages/app/.omo/rules/inside.md", "Inside rule.");
		const targetFile = tempFileSystem.write("outer/packages/app/src/index.ts", "export {};\n");

		// when
		const result = findRuleCandidates({ projectRoot, targetFile, homeDir: tempFileSystem.path("home") });

		// then
		expect(result.map((candidate) => candidate.path)).toContain(join(projectRoot, ".omo/rules/inside.md"));
		expect(result.map((candidate) => candidate.path)).not.toContain(
			tempFileSystem.path("outer/.omo/rules/outside.md"),
		);
	});
});
