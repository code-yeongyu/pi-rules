import { describe, expect, it } from "vitest";
import {
	getMatcherCacheStats,
	hashContent,
	matchRule,
	normalizeGlobs,
	resetMatcherCache,
} from "../src/rules/matcher.js";
import type { RuleFrontmatter } from "../src/rules/types.js";

const defaultPathBases = {
	projectRelative: "src/rules/foo.ts",
	scopeRelative: "rules/foo.ts",
	basename: "foo.ts",
};

describe("matchRule", () => {
	it("#given same glob set is matched repeatedly #when matching multiple path bases #then compiles each pattern once", () => {
		// given
		resetMatcherCache();
		const frontmatter: RuleFrontmatter = { globs: ["**/*.ts", "!**/*.test.ts"] };
		const pathBases = {
			projectRelative: "src/rules/foo.ts",
			scopeRelative: "rules/foo.ts",
			basename: "foo.ts",
		};

		// when
		for (let index = 0; index < 20; index += 1) {
			const result = matchRule({ frontmatter, isSingleFile: false, pathBases });
			expect(result.matched).toBe(true);
		}

		// then
		expect(getMatcherCacheStats()).toEqual({ entries: 1, compiledPatterns: 2 });
	});

	it("#given many unique glob sets #when matching repeatedly #then matcher cache stays bounded", () => {
		// given
		resetMatcherCache();

		// when
		for (let index = 0; index < 300; index += 1) {
			matchRule({
				frontmatter: { globs: `src/file-${index}.ts` },
				isSingleFile: false,
				pathBases: { projectRelative: `src/file-${index}.ts`, basename: `file-${index}.ts` },
			});
		}

		// then
		expect(getMatcherCacheStats().entries).toBeLessThanOrEqual(256);
	});

	it("#given single-file rule #when matching any path bases #then always matches with single-file reason", () => {
		// given
		const frontmatter: RuleFrontmatter = { globs: "never-matches" };

		// when
		const result = matchRule({ frontmatter, isSingleFile: true, pathBases: defaultPathBases });

		// then
		expect(result).toEqual({ matched: true, reason: "single-file" });
	});

	it("#given alwaysApply true #when globs do not match #then matches with alwaysApply reason", () => {
		// given
		const frontmatter: RuleFrontmatter = { alwaysApply: true, globs: "never-matches" };

		// when
		const result = matchRule({ frontmatter, isSingleFile: false, pathBases: defaultPathBases });

		// then
		expect(result).toEqual({ matched: true, reason: "alwaysApply" });
	});

	it("#given alwaysApply false and matching glob #when matching project path #then matches with glob reason", () => {
		// given
		const frontmatter: RuleFrontmatter = { alwaysApply: false, globs: "src/**/*.ts" };

		// when
		const result = matchRule({ frontmatter, isSingleFile: false, pathBases: defaultPathBases });

		// then
		expect(result).toEqual({ matched: true, reason: { kind: "glob", pattern: "src/**/*.ts" } });
	});

	it("#given single string glob #when matching TypeScript file #then matches with that pattern", () => {
		// given
		const frontmatter: RuleFrontmatter = { globs: "**/*.ts" };

		// when
		const result = matchRule({ frontmatter, isSingleFile: false, pathBases: defaultPathBases });

		// then
		expect(result).toEqual({ matched: true, reason: { kind: "glob", pattern: "**/*.ts" } });
	});

	it("#given array globs #when second positive pattern matches #then returns first matching positive pattern", () => {
		// given
		const frontmatter: RuleFrontmatter = { globs: ["**/*.md", "src/**/*.ts", "**/*.ts"] };

		// when
		const result = matchRule({ frontmatter, isSingleFile: false, pathBases: defaultPathBases });

		// then
		expect(result).toEqual({ matched: true, reason: { kind: "glob", pattern: "src/**/*.ts" } });
	});

	it("#given array globs all negative #when matching file #then returns no match", () => {
		// given
		const frontmatter: RuleFrontmatter = { globs: ["!**/foo.ts", "!src/**/*.ts"] };

		// when
		const result = matchRule({ frontmatter, isSingleFile: false, pathBases: defaultPathBases });

		// then
		expect(result).toEqual({ matched: false, reason: { kind: "no-match" } });
	});

	it("#given positive and negation glob #when file is excluded #then returns no match", () => {
		// given
		const frontmatter: RuleFrontmatter = { globs: ["**/*.ts", "!**/foo.ts"] };

		// when
		const result = matchRule({ frontmatter, isSingleFile: false, pathBases: defaultPathBases });

		// then
		expect(result).toEqual({ matched: false, reason: { kind: "no-match" } });
	});

	it("#given paths alias #when normalizing globs #then paths are included as globs", () => {
		// given
		const frontmatter: RuleFrontmatter = { paths: "src/**/*.ts" };

		// when
		const globs = normalizeGlobs(frontmatter);

		// then
		expect(globs).toEqual(["src/**/*.ts"]);
	});

	it("#given applyTo alias #when normalizing globs #then applyTo is included as globs", () => {
		// given
		const frontmatter: RuleFrontmatter = { applyTo: ["**/*.md", "**/*.ts"] };

		// when
		const globs = normalizeGlobs(frontmatter);

		// then
		expect(globs).toEqual(["**/*.md", "**/*.ts"]);
	});

	it("#given paths applyTo and globs #when normalizing globs #then all aliases are merged", () => {
		// given
		const frontmatter: RuleFrontmatter = { globs: "**/*.ts", paths: ["src/**"], applyTo: "test/**" };

		// when
		const globs = normalizeGlobs(frontmatter);

		// then
		expect(globs).toEqual(["**/*.ts", "src/**", "test/**"]);
	});

	it("#given empty globs array #when not single-file and not alwaysApply #then returns no match", () => {
		// given
		const frontmatter: RuleFrontmatter = { globs: [] };

		// when
		const result = matchRule({ frontmatter, isSingleFile: false, pathBases: defaultPathBases });

		// then
		expect(result).toEqual({ matched: false, reason: { kind: "no-match" } });
	});

	it("#given basename-only pattern #when basename matches #then matches with basename pattern", () => {
		// given
		const frontmatter: RuleFrontmatter = { globs: "foo.ts" };

		// when
		const result = matchRule({ frontmatter, isSingleFile: false, pathBases: defaultPathBases });

		// then
		expect(result).toEqual({ matched: true, reason: { kind: "glob", pattern: "foo.ts" } });
	});

	it("#given Windows-style path separators #when matching glob #then normalizes to POSIX before matching", () => {
		// given
		const frontmatter: RuleFrontmatter = { globs: "src/**/*.ts" };
		const pathBases = {
			projectRelative: "src\\rules\\foo.ts",
			scopeRelative: "rules\\foo.ts",
			basename: "foo.ts",
		};

		// when
		const result = matchRule({ frontmatter, isSingleFile: false, pathBases });

		// then
		expect(result).toEqual({ matched: true, reason: { kind: "glob", pattern: "src/**/*.ts" } });
	});

	it("#given duplicate patterns across aliases #when normalizing globs #then identical patterns are deduplicated", () => {
		// given
		const frontmatter: RuleFrontmatter = {
			globs: ["**/*.ts", "src/**"],
			paths: "**/*.ts",
			applyTo: ["src/**", "test/**"],
		};

		// when
		const globs = normalizeGlobs(frontmatter);

		// then
		expect(globs).toEqual(["**/*.ts", "src/**", "test/**"]);
	});
});

describe("hashContent", () => {
	it("#given same body twice #when hashing #then returns deterministic SHA-256 hex", () => {
		// given
		const body = "Use strict TypeScript.";

		// when
		const firstHash = hashContent(body);
		const secondHash = hashContent(body);

		// then
		expect(firstHash).toBe(secondHash);
		expect(firstHash).toMatch(/^[a-f0-9]{64}$/);
	});

	it("#given empty body #when hashing #then returns known empty string SHA-256", () => {
		// given
		const body = "";

		// when
		const hash = hashContent(body);

		// then
		expect(hash).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
	});
});
