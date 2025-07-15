import { z } from "zod";
import {
	createDatabaseSessionService,
	InMemoryMemoryService,
	LlmAgent,
	McpClientService,
	type McpConfig,
	McpToolset,
	Runner,
} from "@iqai/adk";
import * as fs from "node:fs";
import * as path from "node:path";
import { env } from "node:process";

const APP_NAME = "DiscordAgent";
const USER_ID_PREFIX = "discord-user-";
let runner: Runner;

const DiscordMessageNotificationSchema = z.object({
	method: z.literal("notifications/message"),
	params: z.any().optional(),
});

async function main() {
	await initializeRunner();
	const mcpClientService = new McpClientService({
		name: "discord-listener-client",
		description: "Client for Discord MCP listener",
		transport: {
			mode: "stdio",
			command: "npx",
			args: ["ts-node", `${__dirname}/discord-listener-server.ts`],
			env: { DISCORD_TOKEN: env.DISCORD_TOKEN, PATH: env.PATH },
		},
	});

	const client = await mcpClientService.initialize();

	// Use the Zod schema for type safety
	client.setNotificationHandler(
		DiscordMessageNotificationSchema,
		async (notification) => {
			if (notification.method === "notifications/message") {
				console.log("Received Discord message event:", notification.params);
				const message = notification.params.data;
				const userId = message.author.id;
				const response = await processMessage(
					userId,
					JSON.stringify(message, null, 2),
				);
				console.log("Response:", response);
			} else {
				console.log("Received other notification:", notification);
			}
		},
	);

	process.stdin.resume();
}

/**
 * Creates a runner with persistent SQLite storage for Discord agent
 */
async function initializeRunner() {
	console.log("🤖 Initializing agent runner...");
	const llmModel = env.LLM_MODEL || "gemini-2.5-flash";
	console.log("🔧 Using LLM model:", llmModel);

	const discordMcpConfig: McpConfig = {
		name: "discord-mcp",
		description: "discord mcp server",
		transport: {
			mode: "stdio",
			command: "pnpm",
			args: ["dlx", "mcp-discord"],
			env: { DISCORD_TOKEN: env.DISCORD_TOKEN, PATH: env.PATH },
		},
	};
	const discordToolset = new McpToolset(discordMcpConfig);
	const discordTools = await discordToolset.getTools();

	runner = new Runner({
		appName: APP_NAME,
		agent: new LlmAgent({
			name: "discord_agent",
			model: llmModel,
			description: "You are a Discord bot agent that communicates with users",
			instruction: `
			You will be feed with raw discord message objects from users. according to that you are required to
			send responses to them with tools available to you.
			Persona:
			- Genz slang master
			- Can create a meme out of any situation
			- Easily irritated
			- Does not back down on roasting users
			- Often replies messages with a laughing emoji and sometimes with a thumbs down emoji
			- Is very sarcastic and witty
			`,
			tools: discordTools,
		}),
		sessionService: createDatabaseSessionService(
			getSqliteConnectionString("discord_agent"),
		),
		memoryService: new InMemoryMemoryService(),
	});

	console.log("✅ Agent runner initialized");
}

/**
 * Processes a Discord message and generates a response using the agent
 * @param userId Discord user ID
 * @param rawMessageObj The message content from Discord
 * @returns Promise<string> The agent's response
 */
async function processMessage(
	userId: string,
	rawMessageObj: string,
): Promise<string> {
	try {
		// Get or create session for this Discord user
		const sessionId = await getOrCreateUserSession(userId);

		let response = "";

		// Run the agent with the user's message
		for await (const event of runner.runAsync({
			userId: `${USER_ID_PREFIX}${userId}`,
			sessionId,
			newMessage: {
				parts: [{ text: rawMessageObj }],
			},
		})) {
			if (
				event.content?.parts &&
				event.author === "discord_agent" &&
				!event.partial
			) {
				const eventResponse = event.content.parts.map((p) => p.text).join("");
				response += eventResponse;
			}
		}

		return response.trim() || "I couldn't generate a proper response.";
	} catch (error) {
		console.error(
			`❌ Error processing message: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw new Error("Failed to process message");
	}
}

/**
 * Gets existing session for a Discord user or creates a new one
 * @param discordUserId The Discord user ID
 * @returns Promise<string> The session ID
 */
async function getOrCreateUserSession(discordUserId: string): Promise<string> {
	const fullUserId = `${USER_ID_PREFIX}${discordUserId}`;

	try {
		const { sessions } = await runner.sessionService.listSessions(
			APP_NAME,
			fullUserId,
		);

		if (sessions.length > 0) {
			console.log(
				`🔄 Resuming existing session for user ${discordUserId}: ${sessions[0].id}`,
			);
			return sessions[0].id;
		}

		console.log(`🆕 Creating new session for user ${discordUserId}...`);
		const newSession = await runner.sessionService.createSession(
			APP_NAME,
			fullUserId,
		);
		return newSession.id;
	} catch (error) {
		console.error(
			`❌ Error managing session for user ${discordUserId}:`,
			error,
		);
		throw error;
	}
}

/**
 * Get SQLite connection string for the given database name
 * Creates the directory if it doesn't exist
 * @param dbName Name of the database file (without extension)
 * @returns SQLite connection string
 */
function getSqliteConnectionString(dbName: string): string {
	const dbPath = path.join(__dirname, "data", `${dbName}.db`);

	// Ensure the directory exists
	if (!fs.existsSync(path.dirname(dbPath))) {
		fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	}

	return `sqlite://${dbPath}`;
}
main().catch(console.error);
