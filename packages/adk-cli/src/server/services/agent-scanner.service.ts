import { existsSync, readFile, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { promisify } from "node:util";
import type { AgentFile } from "../types.js";

export class AgentScannerService {
	private baseDir: string;

	constructor(baseDir: string) {
		this.baseDir = baseDir;
	}

	public getBaseDir(): string {
		return this.baseDir;
	}

	public async findAgentFiles(): Promise<AgentFile[]> {
		const agents: AgentFile[] = [];

		if (!existsSync(this.baseDir)) {
			return agents;
		}

		await this.scanDirectory(this.baseDir, agents);
		return agents;
	}

	private async scanDirectory(
		dir: string,
		agents: AgentFile[],
		baseDir: string = this.baseDir,
	): Promise<void> {
		try {
			const entries = readdirSync(dir);

			for (const entry of entries) {
				const fullPath = join(dir, entry);
				const stat = statSync(fullPath);

				if (stat.isDirectory()) {
					// Skip node_modules and other common directories we don't want to scan
					if (this.shouldSkipDirectory(entry, fullPath)) {
						continue;
					}
					await this.scanDirectory(fullPath, agents, baseDir);
				} else if (stat.isFile()) {
					// Look for agent files (TypeScript or JavaScript)
					if (await this.isAgentFile(entry, fullPath)) {
						const displayName = this.getAgentDisplayName(fullPath, baseDir);

						// Use the displayName as relativePath (without file extension)
						const relativePath = displayName;

						// Set directory to project root (where .env file is located)
						const projectRoot = basename(dir) === "src" ? dirname(dir) : dir;

						agents.push({
							path: fullPath,
							name: displayName,
							directory: projectRoot,
							relativePath,
						});
					}
				}
			}
		} catch (error) {
			// Ignore errors for directories we can't access
		}
	}

	private shouldSkipDirectory(dirName: string, fullPath: string): boolean {
		const skipDirs = [
			"node_modules",
			".git",
			".next",
			"dist",
			"build",
			".turbo",
			"coverage",
			".nyc_output",
			"__pycache__",
			".pytest_cache",
			".vscode",
			".idea",
		];

		return skipDirs.includes(dirName);
	}

	private async isAgentFile(
		fileName: string,
		fullPath: string,
	): Promise<boolean> {
		const name = basename(fileName, extname(fileName));
		const ext = extname(fileName);

		// Check for files explicitly named "agent.ts" or "agent.js"
		if (name === "agent" && (ext === ".ts" || ext === ".js")) {
			return await this.hasAgentContent(fullPath);
		}

		// Check for common entry points in src/ directory
		const commonEntryPoints = ["index", "main", "agent"];
		if (commonEntryPoints.includes(name) && (ext === ".ts" || ext === ".js")) {
			// Only consider src/ directory files as potential agents
			const dirName = basename(dirname(fullPath));
			if (dirName === "src") {
				return await this.hasAgentContent(fullPath);
			}
		}

		return false;
	}

	private async hasAgentContent(fullPath: string): Promise<boolean> {
		try {
			const readFileAsync = promisify(readFile);
			const content = await readFileAsync(fullPath, "utf-8");

			// Check for common agent export patterns
			const agentExportPatterns = [
				// Default exports of LlmAgent
				/export\s+default\s+.*(?:LlmAgent|Agent)/,
				// Named exports
				/export\s+(?:const|let|var)\s+(?:rootAgent|agent|Agent|RootAgent)/,
				// Object exports
				/export\s*\{\s*(?:rootAgent|agent|Agent|RootAgent|default)/,
				// Class exports that might be agents
				/export\s+(?:default\s+)?class\s+\w*Agent/,
				// Variable assignments that look like agents
				/(?:rootAgent|agent|Agent|RootAgent)\s*[:=]\s*new\s+LlmAgent/,
				// AgentBuilder patterns
				/AgentBuilder\.(?:create|withModel|withInstruction)/,
				// Simple function calls that might be agents
				/\.ask\(/,
				/\.run\(/,
			];

			// Check if any pattern matches
			const hasAgentExport = agentExportPatterns.some((pattern) =>
				pattern.test(content),
			);

			// Additional check for ADK imports (stronger signal this is an ADK agent)
			const hasAdkImport =
				/from\s+['"]@iqai\/adk['"]/.test(content) ||
				/import.*LlmAgent/.test(content) ||
				/import.*AgentBuilder/.test(content);

			return hasAgentExport || hasAdkImport;
		} catch (error) {
			// If we can't read the file, assume it's not a valid agent
			return false;
		}
	}

	private getAgentDisplayName(fullPath: string, baseDir: string): string {
		const relativePath = fullPath.replace(baseDir, "").replace(/^[/\\]/, "");
		const fileName = basename(fullPath, extname(fullPath));

		// If it's in a subdirectory, include the directory name
		const dir = dirname(relativePath);
		if (dir && dir !== ".") {
			return `${dir}/${fileName}`;
		}

		return fileName;
	}
}
