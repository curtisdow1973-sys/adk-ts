import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { text } from "@clack/prompts";
import chalk from "chalk";
import { LlmAgent } from "@iqai/adk";
import type { Content, Part } from "@google/genai";
import { Runner } from "@iqai/adk";
import type { BaseSessionService } from "@iqai/adk";
import { InMemorySessionService } from "@iqai/adk";
import type { Session } from "@iqai/adk";

import * as envs from "./utils/envs";

// Import ts-node programmatically to register TypeScript support
import { register } from "ts-node";
import { createRequire } from "node:module";

interface InputFile {
	state: Record<string, any>;
	queries: string[];
}

/**
 * Run an agent using input from a file
 *
 * @param appName Name of the application
 * @param userId User ID to create the session with
 * @param rootAgent The root agent to run
 * @param artifactService Service for managing artifacts
 * @param sessionService Service for managing sessions
 * @param inputPath Path to the input file
 * @returns The created session
 */
export async function runInputFile(
	appName: string,
	userId: string,
	rootAgent: LlmAgent,
	sessionService: BaseSessionService,
	inputPath: string,
): Promise<Session> {
	const runner = new Runner({
		appName,
		agent: rootAgent,
		sessionService,
	});

	const inputFileRaw = await promisify(fs.readFile)(inputPath, "utf-8");
	const inputFile: InputFile = JSON.parse(inputFileRaw);

	// Add time to state
	const state = { ...inputFile.state, _time: new Date() };

	// Create a new session with the state
	const session = await sessionService.createSession(appName, userId, state);

	for (const query of inputFile.queries) {
		console.log(
			`${chalk.green.bold("[User]")}${chalk.gray(":")} ${chalk.white(query)}`,
		);
		const content: Content = {
			role: "user",
			parts: [{ text: query } as Part],
		};

		for await (const event of runner.runAsync({
			userId: session.userId,
			sessionId: session.id,
			newMessage: content,
		})) {
			if (event.content?.parts) {
				const text = event.content.parts
					.map((part: Part) => part.text || "")
					.join("");

				if (text) {
					console.log(
						`${chalk.blue.bold("🤖")} ${chalk.cyan.bold(appName)}${chalk.gray(":")} ${chalk.white(text)}`,
					);
					console.log("");
				}
			}
		}
	}

	return session;
}

/**
 * Run an agent interactively via CLI
 *
 * @param rootAgent The root agent to run
 * @param artifactService Service for managing artifacts
 * @param session The session to use
 * @param sessionService Service for managing sessions
 */
export async function runInteractively(
	rootAgent: LlmAgent,
	session: Session,
	sessionService: BaseSessionService,
): Promise<void> {
	const runner = new Runner({
		appName: rootAgent.name,
		agent: rootAgent,
		sessionService,
	});

	console.log(
		`${chalk.green.bold("🚀 Starting interactive session with")} ${chalk.cyan.bold(rootAgent.name)}`,
	);
	console.log(`${chalk.gray("Type 'exit' to quit, 'clear' to clear session")}`);
	console.log("");

	while (true) {
		const userInput = await text({
			message: `${chalk.green.bold("You")}: `,
			placeholder: "Ask me anything...",
		});

		if (typeof userInput !== "string") {
			break;
		}

		if (userInput.toLowerCase() === "exit") {
			console.log(chalk.yellow.bold("👋 Goodbye!"));
			break;
		}

		if (userInput.toLowerCase() === "clear") {
			// Clear the session by creating a new one
			const newSession = await sessionService.createSession(
				rootAgent.name,
				session.userId,
				{},
			);
			// Replace session properties entirely
			Object.assign(session, newSession);
			console.log(chalk.yellow.bold("🧹 Session cleared!"));
			console.log("");
			continue;
		}

		const content: Content = {
			role: "user",
			parts: [{ text: userInput } as Part],
		};

		try {
			for await (const event of runner.runAsync({
				userId: session.userId,
				sessionId: session.id,
				newMessage: content,
			})) {
				if (event.content?.parts) {
					const text = event.content.parts
						.map((part: Part) => part.text || "")
						.join("");

					if (text) {
						console.log(
							`${chalk.blue.bold("🤖")} ${chalk.cyan.bold(rootAgent.name)}${chalk.gray(":")} ${chalk.white(text)}`,
						);
					}
				}
			}
		} catch (error) {
			console.error(chalk.red.bold("❌ Error:"), error);
		}

		console.log("");
	}
}

/**
 * Load and validate an agent from a TypeScript file
 *
 * @param agentFilePath Path to the agent file
 * @returns The loaded agent
 */
export async function loadAgentFromFile(
	agentFilePath: string,
): Promise<LlmAgent> {
	// Create require function for ESM compatibility
	const require = createRequire(import.meta.url);

	// Register TypeScript support
	register({
		compilerOptions: {
			module: "es2020",
			target: "es2020",
			moduleResolution: "node",
			esModuleInterop: true,
			allowSyntheticDefaultImports: true,
			skipLibCheck: true,
		},
		transpileOnly: true,
	});

	// Clear require cache
	const resolvedPath = require.resolve(agentFilePath);
	delete require.cache[resolvedPath];

	try {
		const agentModule = require(agentFilePath);

		let agent: LlmAgent | undefined;

		// Pattern 1: Direct LlmAgent exports
		if (agentModule.rootAgent && agentModule.rootAgent instanceof LlmAgent) {
			agent = agentModule.rootAgent;
		} else if (agentModule.agent && agentModule.agent instanceof LlmAgent) {
			agent = agentModule.agent;
		} else if (agentModule.default && agentModule.default instanceof LlmAgent) {
			agent = agentModule.default;
		}

		// Pattern 2: AgentBuilder exports
		else if (
			agentModule.rootAgent &&
			typeof agentModule.rootAgent?.build === "function"
		) {
			const { agent: builtAgent } = await agentModule.rootAgent.build();
			agent = builtAgent;
		} else if (
			agentModule.agent &&
			typeof agentModule.agent?.build === "function"
		) {
			const { agent: builtAgent } = await agentModule.agent.build();
			agent = builtAgent;
		} else if (
			agentModule.default &&
			typeof agentModule.default?.build === "function"
		) {
			const { agent: builtAgent } = await agentModule.default.build();
			agent = builtAgent;
		}

		// Pattern 3: Function that returns AgentBuilder
		else if (typeof agentModule.createAgent === "function") {
			const builder = agentModule.createAgent();
			if (typeof builder?.build === "function") {
				const { agent: builtAgent } = await builder.build();
				agent = builtAgent;
			}
		}

		// Pattern 4: Search for any AgentBuilder in exports
		else {
			for (const key in agentModule) {
				const exported = agentModule[key];
				if (exported && typeof exported?.build === "function") {
					const { agent: builtAgent } = await exported.build();
					agent = builtAgent;
					break;
				}
				// Fallback to LlmAgent check
				if (
					exported &&
					typeof exported === "object" &&
					exported.constructor?.name === "LlmAgent"
				) {
					agent = exported;
					break;
				}
			}
		}

		if (!agent) {
			throw new Error(
				"No agent found in the file. Please export an agent as 'rootAgent', 'agent', AgentBuilder instance, or default export.",
			);
		}

		// Verify it's an LlmAgent
		const isLlmAgent =
			agent instanceof LlmAgent ||
			(agent &&
				typeof agent === "object" &&
				((agent as any).constructor?.name === "LlmAgent" ||
					(agent as any).constructor?.name === "_LlmAgent"));

		if (!isLlmAgent) {
			throw new Error(
				"Agent must be an instance of LlmAgent (either direct or built from AgentBuilder)",
			);
		}

		return agent;
	} catch (error: any) {
		if (error.code === "MODULE_NOT_FOUND") {
			throw new Error(`Agent file not found: ${agentFilePath}`);
		}
		throw new Error(`Failed to load agent: ${error.message}`);
	}
}

/**
 * Main CLI runner function
 *
 * @param options Configuration options for running the CLI
 */
export async function runCli(options: {
	agentParentDir: string;
	agentFolderName: string;
	saveSession: boolean;
	inputPath?: string;
}): Promise<void> {
	const { agentParentDir, agentFolderName, saveSession, inputPath } = options;

	// Load environment variables
	envs.loadDotenvForAgent(agentFolderName, agentParentDir);

	// Find the agent file
	const agentDir = path.join(agentParentDir, agentFolderName);
	let agentFilePath: string;

	// Look for agent files in order of preference
	const possibleFiles = [
		path.join(agentDir, "src", "agent.ts"),
		path.join(agentDir, "src", "index.ts"),
		path.join(agentDir, "agent.ts"),
		path.join(agentDir, "index.ts"),
	];

	for (const filePath of possibleFiles) {
		if (fs.existsSync(filePath)) {
			agentFilePath = filePath;
			break;
		}
	}

	if (!agentFilePath!) {
		throw new Error(
			`No agent file found in ${agentDir}. Looking for: ${possibleFiles.join(", ")}`,
		);
	}

	// Load the agent
	const rootAgent = await loadAgentFromFile(agentFilePath);

	// Set up services
	const sessionService = new InMemorySessionService();

	if (inputPath) {
		// Run with input file
		await runInputFile(
			rootAgent.name,
			"user",
			rootAgent,
			sessionService,
			inputPath,
		);
	} else {
		// Run interactively
		const session = await sessionService.createSession(
			rootAgent.name,
			"user",
			{},
		);
		await runInteractively(rootAgent, session, sessionService);
	}
}
