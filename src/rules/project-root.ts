import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { PROJECT_MARKERS } from "./constants.js";

export function findProjectRoot(startPath: string, markers: ReadonlyArray<string> = PROJECT_MARKERS): string | null {
	const normalizedStartPath = resolve(startPath);

	if (!existsSync(normalizedStartPath)) {
		return null;
	}

	let resolvedStartPath: string;
	try {
		resolvedStartPath = realpathSync.native(normalizedStartPath);
	} catch {
		return null;
	}

	const startStats = statSync(resolvedStartPath);
	let currentDirectory = startStats.isDirectory() ? resolvedStartPath : dirname(resolvedStartPath);
	const filesystemRoot = resolve("/");

	while (true) {
		for (const marker of markers) {
			if (existsSync(join(currentDirectory, marker))) {
				return currentDirectory;
			}
		}

		if (currentDirectory === filesystemRoot) {
			return null;
		}

		currentDirectory = dirname(currentDirectory);
	}
}
