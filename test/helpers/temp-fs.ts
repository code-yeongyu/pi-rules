import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface TempFs {
	root: string;
	path(...parts: string[]): string;
	write(relPath: string, content: string): string;
	writeJson(relPath: string, data: unknown): string;
	mkdir(relPath: string): string;
	symlink(targetRelOrAbs: string, linkRelPath: string): string;
	cleanup(): void;
}

/**
 * Create an isolated temporary directory for filesystem-dependent tests.
 *
 * Always pass the returned `cleanup` to `afterEach`. The directory is created
 * under the OS tmp dir so it is never inside the user home.
 */
export function createTempFs(prefix = "pi-rules-"): TempFs {
	const root = mkdtempSync(join(tmpdir(), prefix));

	const path = (...parts: string[]): string => join(root, ...parts);

	const ensureDir = (filePath: string): void => {
		mkdirSync(dirname(filePath), { recursive: true });
	};

	const write = (relPath: string, content: string): string => {
		const abs = path(relPath);
		ensureDir(abs);
		writeFileSync(abs, content);
		return abs;
	};

	const writeJson = (relPath: string, data: unknown): string => write(relPath, JSON.stringify(data, null, 2));

	const mkdir = (relPath: string): string => {
		const abs = path(relPath);
		mkdirSync(abs, { recursive: true });
		return abs;
	};

	const symlink = (targetRelOrAbs: string, linkRelPath: string): string => {
		const linkAbs = path(linkRelPath);
		ensureDir(linkAbs);
		const targetAbs = resolve(root, targetRelOrAbs);
		symlinkSync(targetAbs, linkAbs);
		return linkAbs;
	};

	const cleanup = (): void => {
		try {
			rmSync(root, { recursive: true, force: true });
		} catch {
			// Best-effort cleanup; tests should still pass if rm fails on Windows / locked handles.
		}
	};

	return { root, path, write, writeJson, mkdir, symlink, cleanup };
}
