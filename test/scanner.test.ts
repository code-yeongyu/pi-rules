import { realpathSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { scanRuleFiles } from "../src/rules/scanner.js";
import { createTempFs, type TempFs } from "./helpers/temp-fs.js";

describe("scanRuleFiles", () => {
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

	it("#given empty directory #when scanning #then returns empty array", () => {
		// given
		const tempFileSystem = createTrackedTempFs();

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([]);
	});

	it("#given directory with one .md file #when scanning #then returns it", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const rulePath = tempFileSystem.write("rule.md", "Use strict TypeScript.");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([{ path: rulePath, realPath: rulePath }]);
	});

	it("#given directory with .md and .mdc files #when scanning #then both included", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const markdownPath = tempFileSystem.write("a.md", "Markdown rule.");
		const cursorPath = tempFileSystem.write("b.mdc", "Cursor rule.");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([
			{ path: markdownPath, realPath: markdownPath },
			{ path: cursorPath, realPath: cursorPath },
		]);
	});

	it("#given non-rule file extensions #when scanning #then excluded", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		tempFileSystem.write("note.txt", "Not a rule.");
		tempFileSystem.write("script.ts", "export {};");
		tempFileSystem.write("markdown.md.tmp", "Not a rule.");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([]);
	});

	it("#given nested rules #when scanning #then recursion finds nested files", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const rootRulePath = tempFileSystem.write("root.md", "Root rule.");
		const nestedRulePath = tempFileSystem.write("nested/deep/rule.mdc", "Nested rule.");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([
			{ path: nestedRulePath, realPath: nestedRulePath },
			{ path: rootRulePath, realPath: rootRulePath },
		]);
	});

	it("#given node_modules dir #when scanning #then excluded", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		tempFileSystem.write("node_modules/pkg/rule.md", "Ignored rule.");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([]);
	});

	it("#given .git dir #when scanning #then excluded", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		tempFileSystem.write(".git/hooks/rule.md", "Ignored rule.");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([]);
	});

	it("#given dist and build dirs #when scanning #then excluded", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		tempFileSystem.write("dist/rule.md", "Ignored dist rule.");
		tempFileSystem.write("build/rule.mdc", "Ignored build rule.");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([]);
	});

	it("#given hidden directory like .config #when scanning #then included unless explicitly excluded", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const rulePath = tempFileSystem.write(".config/rule.md", "Hidden dir rule.");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([{ path: rulePath, realPath: rulePath }]);
	});

	it("#given symlink to a file inside the same root #when scanning #then included with realPath resolved", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const targetPath = tempFileSystem.write("target.md", "Target rule.");
		const linkPath = tempFileSystem.symlink("target.md", "linked.md");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toContainEqual({ path: linkPath, realPath: realpathSync.native(targetPath) });
	});

	it("#given symlink to external real file #when scanning #then included with external realPath", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const externalFileSystem = createTrackedTempFs();
		const externalRulePath = externalFileSystem.write("external.md", "External rule.");
		const linkPath = tempFileSystem.symlink(externalRulePath, "linked-external.md");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([{ path: linkPath, realPath: realpathSync.native(externalRulePath) }]);
	});

	it("#given cyclic symlink #when scanning #then terminates without infinite loop", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const rulePath = tempFileSystem.write("rule.md", "Root rule.");
		tempFileSystem.symlink(".", "loop");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([{ path: rulePath, realPath: rulePath }]);
	});

	it("#given path that does not exist #when scanning #then returns empty without throw", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const missingPath = tempFileSystem.path("missing");

		// when
		const scan = (): ReturnType<typeof scanRuleFiles> => scanRuleFiles({ rootDir: missingPath });

		// then
		expect(scan).not.toThrow();
		expect(scan()).toEqual([]);
	});

	it("#given path that is a file #when scanning #then returns empty without throw", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const filePath = tempFileSystem.write("rule.md", "Root file.");

		// when
		const scan = (): ReturnType<typeof scanRuleFiles> => scanRuleFiles({ rootDir: filePath });

		// then
		expect(scan).not.toThrow();
		expect(scan()).toEqual([]);
	});

	it("#given two files with same realPath via symlink #when scanning #then both ScannedFile entries returned", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const targetPath = tempFileSystem.write("target.md", "Target rule.");
		const linkPath = tempFileSystem.symlink("target.md", "linked.md");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		expect(result).toEqual([
			{ path: linkPath, realPath: realpathSync.native(targetPath) },
			{ path: targetPath, realPath: targetPath },
		]);
	});

	it("#given deeply nested directories beyond maxDepth #when scanning #then deeper files excluded", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const shallowRulePath = tempFileSystem.write("level-one/shallow.md", "Shallow rule.");
		tempFileSystem.write("level-one/level-two/deep.md", "Deep rule.");

		// when
		const result = scanRuleFiles({ rootDir: tempFileSystem.root, maxDepth: 1 });

		// then
		expect(result).toEqual([{ path: shallowRulePath, realPath: shallowRulePath }]);
	});

	it("#given alphabetical sort #when scanning #then results are deterministic across runs", () => {
		// given
		const tempFileSystem = createTrackedTempFs();
		const alphaRulePath = tempFileSystem.write("alpha.md", "Alpha rule.");
		const betaRulePath = tempFileSystem.write("beta/rule.md", "Beta rule.");
		const zetaRulePath = tempFileSystem.write("zeta.md", "Zeta rule.");

		// when
		const firstResult = scanRuleFiles({ rootDir: tempFileSystem.root });
		const secondResult = scanRuleFiles({ rootDir: tempFileSystem.root });

		// then
		const expected = [
			{ path: alphaRulePath, realPath: alphaRulePath },
			{ path: betaRulePath, realPath: betaRulePath },
			{ path: zetaRulePath, realPath: zetaRulePath },
		];
		expect(firstResult).toEqual(expected);
		expect(secondResult).toEqual(expected);
	});
});
