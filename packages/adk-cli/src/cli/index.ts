import { program } from "commander";
import chalk from "chalk";
import { createProject } from "./commands/new.js";
import { runAgent } from "./commands/run.js";
import { startWebUI } from "./commands/web.js";

const packageJson = {
	name: "@iqai/adk-cli",
	version: "0.1.0",
	description: "CLI tool for creating, running, and testing ADK agents",
};

program
	.name("adk")
	.description(packageJson.description)
	.version(packageJson.version);

program
	.command("new")
	.description("Create a new ADK project")
	.argument("[project-name]", "Name of the project to create")
	.option(
		"-t, --template <template>",
		"Template to use (simple-agent, discord-bot, telegram-bot, hono-server, mcp-starter)",
		"simple-agent",
	)
	.action(async (projectName, options) => {
		try {
			await createProject(projectName, options);
		} catch (error) {
			console.error(chalk.red("Error creating project:"), error);
			process.exit(1);
		}
	});

program
	.command("run")
	.description("Run an agent from the current directory")
	.argument(
		"[agent-path]",
		"Path to the agent file (default: looks for agent.ts in current/agents directory)",
	)
	.option("-w, --watch", "Watch for file changes and restart agent")
	.option("-p, --port <port>", "Port for agent server (if applicable)", "3000")
	.action(async (agentPath, options) => {
		try {
			await runAgent(agentPath, options);
		} catch (error) {
			console.error(chalk.red("Error running agent:"), error);
			process.exit(1);
		}
	});

program
	.command("web")
	.description("Start a web interface for testing agents")
	.option("-p, --port <port>", "Port for web server", "3001")
	.option(
		"-d, --dir <directory>",
		"Directory to scan for agents (default: ./agents)",
		"./agents",
	)
	.action(async (options) => {
		try {
			await startWebUI(options);
		} catch (error) {
			console.error(chalk.red("Error starting web UI:"), error);
			process.exit(1);
		}
	});

program.parse();
