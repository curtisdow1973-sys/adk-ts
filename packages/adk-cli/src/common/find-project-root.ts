import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Discover the project root by traversing up from a given directory
 * looking for package.json, tsconfig.json, .env, or .git files.
 */
export function findProjectRoot(startDir: string) {
	let projectRoot = resolve(startDir);

	while (projectRoot !== "/" && projectRoot !== dirname(projectRoot)) {
		if (
			existsSync(join(projectRoot, "package.json")) ||
			existsSync(join(projectRoot, "tsconfig.json")) ||
			existsSync(join(projectRoot, ".env")) ||
			existsSync(join(projectRoot, ".git"))
		) {
			break;
		}
		projectRoot = dirname(projectRoot);
	}

	// If no markers found, fall back to startDir
	if (projectRoot === "/" || projectRoot === dirname(projectRoot)) {
		projectRoot = resolve(startDir);
	}

	return projectRoot;
}
