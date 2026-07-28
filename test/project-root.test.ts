import { tmpdir } from "node:os";
import { parse } from "node:path";

import { describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({
	forceExists: false,
	statError: null as NodeJS.ErrnoException | null,
}));

const homeMock = vi.hoisted(() => ({ path: "" }));

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		existsSync: (path: Parameters<typeof actual.existsSync>[0]) =>
			fsMock.forceExists ? true : actual.existsSync(path),
		statSync: (...args: Parameters<typeof actual.statSync>) => {
			if (fsMock.statError !== null) {
				throw fsMock.statError;
			}
			return actual.statSync(...args);
		},
	};
});

vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return {
		...actual,
		homedir: () => (homeMock.path === "" ? actual.homedir() : homeMock.path),
	};
});

import { realpathSync } from "node:fs";

import { findProjectRoot, widenToRepositoryRoot } from "../src/rules/project-root.js";
import { createTempFs } from "./helpers/temp-fs.js";

function canonicalPath(path: string): string {
	return realpathSync.native(path);
}

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
			expect(result).toBe(canonicalPath(root));
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
			expect(result).toBe(canonicalPath(root));
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
			expect(result).toBe(canonicalPath(root));
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
			expect(result).toBe(canonicalPath(root));
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given file reached through a symlink outside its project #when finding root #then resolves the project's marker", () => {
		// given
		const tempFs = createTempFs();
		const root = tempFs.mkdir("repo");
		tempFs.writeJson("repo/package.json", { name: "repo" });
		tempFs.write("repo/src/index.ts", "export const value = 1;\n");
		const linkedDirectory = tempFs.symlink("repo/src", "outside/linked-src");

		try {
			// when
			const result = findProjectRoot(`${linkedDirectory}/index.ts`);

			// then
			expect(result).toBe(canonicalPath(root));
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
			expect(result).toBe(canonicalPath(innerRoot));
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

	it("#given start path disappears after existence check #when finding root #then returns null without throwing", () => {
		// given
		const tempFs = createTempFs();
		const startPath = tempFs.mkdir("repo");
		const statError = new Error("No such file or directory") as NodeJS.ErrnoException;
		statError.code = "ENOENT";
		fsMock.forceExists = true;
		fsMock.statError = statError;

		try {
			// when
			const result = findProjectRoot(startPath);

			// then
			expect(result).toBeNull();
		} finally {
			fsMock.forceExists = false;
			fsMock.statError = null;
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
			expect(result).toBe(canonicalPath(customRoot));
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
			expect(result).toBe(canonicalPath(root));
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
			expect(result).toBe(canonicalPath(root));
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
			expect(result).toBe(canonicalPath(root));
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given startPath on a different drive than cwd (Windows cross-drive) #when finding root #then terminates with null instead of looping forever", () => {
		// Cross-drive paths only exist on Windows; this scenario cannot occur elsewhere.
		if (process.platform !== "win32") {
			return;
		}
		// The bug needs the temp dir and cwd on different drive roots; skip the body on single-drive machines.
		if (parse(tmpdir()).root.toLowerCase() === parse(process.cwd()).root.toLowerCase()) {
			return;
		}
		// given
		const tempFs = createTempFs();
		const startPath = tempFs.mkdir("plain/nested");

		try {
			// when
			const result = findProjectRoot(startPath, [".nonexistent-marker-pi-rules"]);

			// then
			expect(result).toBeNull();
		} finally {
			tempFs.cleanup();
		}
	});
});

describe("widenToRepositoryRoot", () => {
	it("#given project root with no .git above #when widening #then project root is returned unchanged", () => {
		// given
		const tempFs = createTempFs();
		const projectRoot = tempFs.mkdir("project");

		try {
			// when
			const result = widenToRepositoryRoot(projectRoot);

			// then
			expect(result).toBe(projectRoot);
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given project root is the repository root itself #when widening #then the repository root is returned", () => {
		// given
		const tempFs = createTempFs();
		const projectRoot = tempFs.mkdir("repo");
		tempFs.mkdir("repo/.git");

		try {
			// when
			const result = widenToRepositoryRoot(projectRoot);

			// then
			expect(result).toBe(canonicalPath(projectRoot));
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given nested workspace member inside a git repository #when widening #then repository root is returned", () => {
		// given
		const tempFs = createTempFs();
		const repositoryRoot = tempFs.mkdir("repo");
		tempFs.mkdir("repo/.git");
		tempFs.write("repo/backend/Cargo.toml", "");
		const memberRoot = tempFs.mkdir("repo/backend/crates/member");
		tempFs.write("repo/backend/crates/member/Cargo.toml", "");

		try {
			// when
			const result = widenToRepositoryRoot(memberRoot);

			// then
			expect(result).toBe(canonicalPath(repositoryRoot));
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given nested git repo inside a parent git repo #when widening #then innermost repository root is returned", () => {
		// given
		const tempFs = createTempFs();
		const outerRoot = tempFs.mkdir("outer");
		tempFs.mkdir("outer/.git");
		const innerRoot = tempFs.mkdir("outer/inner");
		tempFs.mkdir("outer/inner/.git");
		const memberRoot = tempFs.mkdir("outer/inner/crates/member");

		try {
			// when
			const result = widenToRepositoryRoot(memberRoot);

			// then
			expect(result).toBe(canonicalPath(innerRoot));
			expect(result).not.toBe(canonicalPath(outerRoot));
		} finally {
			tempFs.cleanup();
		}
	});

	it("#given project under a home directory that is itself a git repo #when widening #then home .git is ignored", () => {
		// given
		const tempFs = createTempFs();
		const homeDirectory = tempFs.mkdir("home");
		tempFs.mkdir("home/.git");
		const projectRoot = tempFs.mkdir("home/project");
		homeMock.path = homeDirectory;

		try {
			// when
			const result = widenToRepositoryRoot(projectRoot);

			// then
			expect(result).toBe(projectRoot);
		} finally {
			homeMock.path = "";
			tempFs.cleanup();
		}
	});

	it("#given null project root #when widening #then null is returned", () => {
		// given / when / then
		expect(widenToRepositoryRoot(null)).toBe(null);
	});
});
