import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { env } from "node:process";
import {
	InMemoryMemoryService,
	LlmAgent,
	Runner,
	createDatabaseSessionService,
} from "@iqai/adk";
import {
	Client as DiscordJsClient,
	Events,
	GatewayIntentBits,
	Partials,
} from "discord.js";

/**
 * Application configuration constants
 */
const APP_NAME = "DiscordAgent";
const USER_ID_PREFIX = "discord-user-";

let dClient: DiscordJsClient;
let runner: Runner;

async function main() {
	try {
		// Check required environment variables
		if (!env.DISCORD_TOKEN) {
			throw new Error("DISCORD_TOKEN environment variable is required");
		}

		await initializeRunner();
		await initializeDClient();
		await loginDiscordClient();
		listenToMessages();
	} catch (e) {
		console.error("❌ Failed to start bot:", e);
		process.exit(1);
	}
}

/**
 * Creates a runner with persistent SQLite storage for Discord agent
 */
async function initializeRunner() {
	console.log("🤖 Initializing agent runner...");
	const llmModel = env.LLM_MODEL || "gemini-2.5-flash";
	console.log("🔧 Using LLM model:", llmModel);

	runner = new Runner({
		appName: APP_NAME,
		agent: new LlmAgent({
			name: "discord_agent",
			model: llmModel,
			description: "You are a Discord bot agent that communicates with users",
			instruction:
				"You are an agent that communicates with users on Discord. Be helpful, friendly, and engaging in your responses.",
		}),
		sessionService: createDatabaseSessionService(
			getSqliteConnectionString("discord_agent"),
		),
		memoryService: new InMemoryMemoryService(),
	});

	console.log("✅ Agent runner initialized");
}

async function initializeDClient() {
	console.log("🔧 Initializing Discord client...");
	dClient = new DiscordJsClient({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.DirectMessages,
		],
		partials: [Partials.Channel],
	});
	console.log("✅ Discord client initialized");
}

async function loginDiscordClient() {
	console.log("🔑 Logging in to Discord...");

	dClient.once(Events.ClientReady, (client) => {
		console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
	});

	dClient.on(Events.Error, (error) => {
		console.error("❌ Discord client error:", error);
	});

	await dClient.login(env.DISCORD_TOKEN);
}

function listenToMessages() {
	console.log("👂 Setting up message listeners...");

	dClient.on(Events.MessageCreate, async (message) => {
		if (message.author.bot) return;

		console.log(
			`📝 Message from ${message.author.username} (${message.author.id}): ${message.content}`,
		);

		// Start typing indicator
		try {
			await message.channel.sendTyping();
		} catch (typingError) {
			console.warn("⚠️ Could not start typing indicator:", typingError);
		}

		try {
			const response = await processMessage(message.author.id, message.content);
			if (response) {
				await message.reply(response);
				console.log(`🤖 Replied: ${response}`);
			}
		} catch (error) {
			console.error("❌ Error handling message:", error);
			await message.reply(
				"Sorry, I encountered an error processing your message.",
			);
		}
	});
}

/**
 * Processes a Discord message and generates a response using the agent
 * @param userId Discord user ID
 * @param messageContent The message content from Discord
 * @returns Promise<string> The agent's response
 */
async function processMessage(
	userId: string,
	messageContent: string,
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
				parts: [{ text: messageContent }],
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
