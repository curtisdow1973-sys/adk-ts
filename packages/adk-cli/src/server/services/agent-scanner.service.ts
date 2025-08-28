import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Agent, LoadedAgent } from "../types.js";

export class AgentScanner {
	constructor(private quiet = false) {}

	scanAgents(
		agentsDir: string,
		loadedAgents: Map<string, LoadedAgent>,
	): Map<string, Agent> {
		const agents = new Map<string, Agent>();

		// Use current directory if agentsDir doesn't exist or is empty
		const scanDir =
			!agentsDir || !existsSync(agentsDir) ? process.cwd() : agentsDir;

		const shouldSkipDirectory = (dirName: string): boolean => {
			const skipDirs = [
				"node_modules",
				".git",
				".next",
				"dist",
				"build",
				".turbo",
				"coverage",
				".vscode",
				".idea",
			];
			return skipDirs.includes(dirName);
		};

		const scanDirectory = (dir: string): void => {
			if (!existsSync(dir)) return;

			const items = readdirSync(dir);
			for (const item of items) {
				const fullPath = join(dir, item);
				const stat = statSync(fullPath);

				if (stat.isDirectory()) {
					// Skip common build/dependency directories
					if (!shouldSkipDirectory(item)) {
						scanDirectory(fullPath);
					}
				} else if (item === "agent.ts" || item === "agent.js") {
					const relativePath = relative(scanDir, dir);

					// Try to get the actual agent name if it's already loaded
					const loadedAgent = loadedAgents.get(relativePath);
					let agentName = relativePath.split("/").pop() || "unknown";

					// If agent is loaded, use its actual name
					if (loadedAgent?.agent?.name) {
						agentName = loadedAgent.agent.name;
					} else {
						// Try to quickly extract name from agent file if not loaded
						try {
							const agentFilePath = join(dir, item);
							agentName =
								this.extractAgentNameFromFile(agentFilePath) || agentName;
						} catch {
							// Fallback to directory name if extraction fails
						}
					}

					agents.set(relativePath, {
						relativePath,
						name: agentName,
						absolutePath: dir,
						instance: loadedAgent?.agent,
					});
				}
			}
		};

		scanDirectory(scanDir);
		if (!this.quiet) {
			console.log(`✅ Agent scan complete. Found ${agents.size} agents.`);
		}

		return agents;
	}

	private extractAgentNameFromFile(filePath: string): string | null {
		try {
			const content = readFileSync(filePath, "utf-8");

			// Look for agent name in export statements
			// Match patterns like: name: "agent_name" or name:"agent_name"
			const nameMatch = content.match(/name\s*:\s*["']([^"']+)["']/);
			if (nameMatch?.[1]) {
				return nameMatch[1];
			}

			return null;
		} catch {
			return null;
		}
	}
}
