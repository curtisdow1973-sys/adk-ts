#!/usr/bin/env node
import {
	intro,
	outro,
	select,
	text,
	confirm,
	note,
	spinner,
} from "@clack/prompts";
import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";
import { runCli } from "./cli/operations";
import { createApiServer } from "./cli/api-server";
import { startWebServer } from "./cli/web-server";

/**
 * Interactive-first CLI for ADK
 */
export class AdkCli {
	async run(): Promise<void> {
		intro(chalk.magenta.bold("🚀 ADK - Agent Development Kit"));

		try {
			const action = await this.selectMainAction();
			await this.executeAction(action);
		} catch (error: any) {
			if (error.message !== "User cancelled") {
				outro(chalk.red.bold(`❌ Error: ${error.message}`));
			}
		}

		outro(chalk.magenta.bold("👋 Thanks for using ADK!"));
	}

	private async selectMainAction(): Promise<string> {
		return (await select({
			message: "What would you like to do?",
			options: [
				{
					value: "create",
					label: "🏗️  Create new project",
					hint: "Generate a new ADK project from template",
				},
				{
					value: "run",
					label: "▶️  Run agent",
					hint: "Start interactive chat session",
				},
				{
					value: "web",
					label: "🌐 Launch web UI",
					hint: "Start browser-based interface",
				},
				{
					value: "api",
					label: "🔌 Start API server",
					hint: "Run headless API server",
				},
			],
		})) as string;
	}

	private async executeAction(action: string): Promise<void> {
		switch (action) {
			case "create":
				await this.createFlow();
				break;
			case "run":
				await this.runFlow();
				break;
			case "web":
				await this.webFlow();
				break;
			case "api":
				await this.apiFlow();
				break;
			default:
				throw new Error(`Unknown action: ${action}`);
		}
	}

	private async createFlow(): Promise<void> {
		note(chalk.magenta.bold("🏗️ Creating a new ADK project"));

		// Import and run the create-adk-project functionality
		const { main: runCreateProject } = await import("./create-project");
		await runCreateProject();
	}

	private async runFlow(): Promise<void> {
		note(chalk.cyan.bold("▶️ Running an agent"));

		const agentPath = await text({
			message: "Enter agent directory path:",
			placeholder: "./my-agent or /full/path/to/agent",
			validate: (value) => {
				if (!value.trim()) return "Agent path is required";

				const resolvedPath = path.resolve(value.trim());
				if (!fs.existsSync(resolvedPath)) {
					return "Directory does not exist";
				}

				const stat = fs.statSync(resolvedPath);
				if (!stat.isDirectory()) {
					return "Path must be a directory";
				}

				// Check if it's a valid agent directory
				if (!this.isAgentDirectory(resolvedPath)) {
					return "Directory does not contain a valid agent file (agent.ts or index.ts)";
				}

				return undefined;
			},
		});

		if (typeof agentPath !== "string") return;

		const resolvedAgentPath = path.resolve(agentPath.trim());
		const agentName = path.basename(resolvedAgentPath);

		const s = spinner();
		s.start(`Starting ${agentName}...`);

		try {
			const agentParentDir = path.dirname(resolvedAgentPath);
			const agentFolderName = path.basename(resolvedAgentPath);

			// Stop spinner before starting interactive chat
			s.stop(`🚀 Launching ${agentName}`);

			await runCli({
				agentParentDir,
				agentFolderName,
				saveSession: false,
			});
		} catch (error: any) {
			s.stop("❌ Failed to start agent");
			throw error;
		}
	}

	private async webFlow(): Promise<void> {
		note(chalk.green.bold("🌐 Starting web interface"));

		const agentPath = await text({
			message: "Enter agent directory path:",
			placeholder: "./my-agent or /full/path/to/agent",
			validate: (value) => {
				if (!value.trim()) return "Agent path is required";

				const resolvedPath = path.resolve(value.trim());
				if (!fs.existsSync(resolvedPath)) {
					return "Directory does not exist";
				}

				if (!this.isAgentDirectory(resolvedPath)) {
					return "Directory does not contain a valid agent file";
				}

				return undefined;
			},
		});

		if (typeof agentPath !== "string") return;

		const port = await text({
			message: "Port number:",
			placeholder: "3000",
			validate: (value) => {
				if (!value) return undefined; // Allow empty for default
				const portNum = Number.parseInt(value);
				if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
					return "Port must be a number between 1 and 65535";
				}
				return undefined;
			},
		});

		if (typeof port === "symbol") return;

		const resolvedAgentPath = path.resolve(agentPath.trim());
		const portNumber = port ? Number.parseInt(port) : 3000;

		const s = spinner();
		s.start("Starting web server...");

		try {
			s.stop("🌐 Web server starting");
			await startWebServer({
				agentDir: resolvedAgentPath,
				port: portNumber,
			});
		} catch (error: any) {
			s.stop("❌ Failed to start web server");
			throw error;
		}
	}

	private async apiFlow(): Promise<void> {
		note(chalk.blue.bold("🔌 Starting API server"));

		const agentPath = await text({
			message: "Enter agent directory path:",
			placeholder: "./my-agent or /full/path/to/agent",
			validate: (value) => {
				if (!value.trim()) return "Agent path is required";

				const resolvedPath = path.resolve(value.trim());
				if (!fs.existsSync(resolvedPath)) {
					return "Directory does not exist";
				}

				if (!this.isAgentDirectory(resolvedPath)) {
					return "Directory does not contain a valid agent file";
				}

				return undefined;
			},
		});

		if (typeof agentPath !== "string") return;

		const port = await text({
			message: "Port number:",
			placeholder: "8000",
			validate: (value) => {
				if (!value) return undefined; // Allow empty for default
				const portNum = Number.parseInt(value);
				if (Number.isNaN(portNum) || portNum < 1 || portNum > 65535) {
					return "Port must be a number between 1 and 65535";
				}
				return undefined;
			},
		});

		if (typeof port === "symbol") return;

		const resolvedAgentPath = path.resolve(agentPath.trim());
		const portNumber = port ? Number.parseInt(port) : 8000;

		const s = spinner();
		s.start("Starting API server...");

		try {
			s.stop("🔌 API server starting");
			await createApiServer({
				agentDir: resolvedAgentPath,
				port: portNumber,
			});
		} catch (error: any) {
			s.stop("❌ Failed to start API server");
			throw error;
		}
	}

	private isAgentDirectory(dirPath: string): boolean {
		const possibleFiles = [
			path.join(dirPath, "src", "agent.ts"),
			path.join(dirPath, "src", "index.ts"),
			path.join(dirPath, "agent.ts"),
			path.join(dirPath, "index.ts"),
		];

		return possibleFiles.some((filePath) => fs.existsSync(filePath));
	}
}

export async function runAdkCli(): Promise<void> {
	const cli = new AdkCli();
	await cli.run();
}
