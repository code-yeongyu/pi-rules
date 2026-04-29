import { describe, expect, it } from "vitest";

import { findProjectRoot } from "../src/rules/project-root.js";
import { createTempFs } from "./helpers/temp-fs.js";

describe("findProjectRoot", () => {
	it("#given dir with .git marker #when finding root #then returns that dir", () => {
		// given
		const tempFs = createTempFs();
		const root = tempFs.mkdir("repo");
		tempFs.mkdir("repo/.git");

		try {
			// when
			const result = findProjectRoot(root);

			// then
			expect(result).toBe(root);
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given dir with package.json marker #when finding root #then returns that dir", () => {
		// given
		const tempFs = createTempFs();
		const root = tempFs.mkdir("repo");
		tempFs.writeJson("repo/package.json", { name: "repo" });

		try {
			// when
			const result = findProjectRoot(root);

			// then
			expect(result).toBe(root);
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given dir with go.mod marker #when finding root #then returns that dir", () => {
		// given
		const tempFs = createTempFs();
		const root = tempFs.mkdir("repo");
		tempFs.write("repo/go.mod", "module example.com/repo\n");

		try {
			// when
			const result = findProjectRoot(root);

			// then
			expect(result).toBe(root);
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given startPath is a file inside a marker dir #when finding root #then returns parent dir with marker", () => {
		// given
		const tempFs = createTempFs();
		const root = tempFs.mkdir("repo");
		tempFs.writeJson("repo/package.json", { name: "repo" });
		const filePath = tempFs.write("repo/src/index.ts", "export const value = 1;\n");

		try {
			// when
			const result = findProjectRoot(filePath);

			// then
			expect(result).toBe(root);
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given nested project (.git inside subdir of an outer .git) #when finding root from inner #then returns INNER dir (nearest wins)", () => {
		// given
		const tempFs = createTempFs();
		const innerRoot = tempFs.mkdir("outer/packages/inner");
		tempFs.mkdir("outer/.git");
		tempFs.mkdir("outer/packages/inner/.git");
		const startPath = tempFs.mkdir("outer/packages/inner/src/features");

		try {
			// when
			const result = findProjectRoot(startPath);

			// then
			expect(result).toBe(innerRoot);
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given no markers anywhere up to root #when finding root #then returns null", () => {
		// given
		const tempFs = createTempFs();
		const startPath = tempFs.mkdir("plain/nested");

		try {
			// when
			const result = findProjectRoot(startPath);

			// then
			expect(result).toBeNull();
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given startPath does not exist #when finding root #then returns null", () => {
		// given
		const tempFs = createTempFs();
		const missingPath = tempFs.path("missing");

		try {
			// when
			const result = findProjectRoot(missingPath);

			// then
			expect(result).toBeNull();
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given custom markers list #when finding root #then uses that list instead of defaults", () => {
		// given
		const tempFs = createTempFs();
		tempFs.writeJson("repo/package.json", { name: "repo" });
		const customRoot = tempFs.mkdir("repo/packages/app");
		tempFs.write("repo/packages/app/custom.marker", "custom\n");
		const startPath = tempFs.mkdir("repo/packages/app/src");

		try {
			// when
			const result = findProjectRoot(startPath, ["custom.marker"]);

			// then
			expect(result).toBe(customRoot);
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given dir with package.json AND .git #when finding root #then returns first match (consistent ordering)", () => {
		// given
		const tempFs = createTempFs();
		const root = tempFs.mkdir("repo");
		tempFs.mkdir("repo/.git");
		tempFs.writeJson("repo/package.json", { name: "repo" });

		try {
			// when
			const result = findProjectRoot(root);

			// then
			expect(result).toBe(root);
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given .venv directory marker #when finding root #then returns dir", () => {
		// given
		const tempFs = createTempFs();
		const root = tempFs.mkdir("repo");
		tempFs.mkdir("repo/.venv");
		const startPath = tempFs.mkdir("repo/src");

		try {
			// when
			const result = findProjectRoot(startPath);

			// then
			expect(result).toBe(root);
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given .git is a file (not dir, gitsubmodule) #when finding root #then still recognized", () => {
		// given
		const tempFs = createTempFs();
		const root = tempFs.mkdir("repo");
		tempFs.write("repo/.git", "gitdir: ../.git/modules/repo\n");
		const startPath = tempFs.mkdir("repo/src");

		try {
			// when
			const result = findProjectRoot(startPath);

			// then
			expect(result).toBe(root);
		} finally {
			tempFs.cleanup();
		}
	});
});
