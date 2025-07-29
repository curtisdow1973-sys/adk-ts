/**
 * Chat Bot Integration Examples
 *
 * This example demonstrates how to create chat bots for various platforms using ADK.
 * We'll show examples for Discord and Telegram bots with customizable personalities.
 *
 * Key concepts covered:
 * - Platform-specific MCP integrations
 * - Bot personality configuration
 * - Message handling and responses
 * - Session management for chat bots
 * - Environment-based configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { env } from "node:process";
import {
	AgentBuilder,
	McpDiscord,
	McpTelegram,
	createDatabaseSessionService,
	createSamplingHandler,
} from "@iqai/adk";

// Utility function to create SQLite connection string
function getSqliteConnectionString(dbName: string): string {
	const dbPath = path.join(__dirname, "data", `${dbName}.db`);
	if (!fs.existsSync(path.dirname(dbPath))) {
		fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	}
	return `sqlite://${dbPath}`;
}

/**
 * Discord Bot Example
 *
 * Creates a Discord bot with a witty, sarcastic personality.
 * The bot can participate in Discord channels and respond to messages.
 */
async function createDiscordBot() {
	console.log("🤖 Initializing Discord bot...");

	const { runner } = await AgentBuilder.create("discord_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("You are a Discord bot agent that communicates with users")
		.withInstruction(`
			You are a Discord bot agent. Be witty, sarcastic, and engaging. You will be fed with user messages from discord channels you are a participant in.
			Persona:
			- Genz slang master
			- Can create a meme out of any situation
			- Easily irritated
			- Does not back down on roasting users
			- Often replies messages with a laughing emoji and sometimes with a thumbs down emoji
			- Is very sarcastic and witty
		`)
		.withSessionService(
			createDatabaseSessionService(getSqliteConnectionString("discord_agent")),
		)
		.build();

	const samplingHandler = createSamplingHandler(runner.ask);
	const discordToolset = McpDiscord({
		samplingHandler,
		env: {
			DISCORD_TOKEN: env.DISCORD_TOKEN,
			PATH: env.PATH,
		},
	});

	await discordToolset.getTools();
	console.log("✅ Discord bot initialized");

	return { runner, discordToolset };
}

/**
 * Telegram Bot Example
 *
 * Creates a Telegram bot with similar personality but platform-specific adaptations.
 */
async function createTelegramBot() {
	console.log("🤖 Initializing Telegram bot...");

	const { runner } = await AgentBuilder.create("telegram_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription(
			"You are a Telegram bot agent that communicates with users",
		)
		.withInstruction(`
			You are a Telegram bot agent. Be witty, sarcastic, and engaging. You will be fed with user messages from telegram channels you are a participant in.
			Persona:
			- Genz slang master
			- Can create a meme out of any situation
			- Easily irritated
			- Does not back down on roasting users
			- Often replies messages with a laughing emoji and sometimes with a thumbs down emoji
			- Is very sarcastic and witty
		`)
		.withSessionService(
			createDatabaseSessionService(getSqliteConnectionString("telegram_agent")),
		)
		.build();

	const samplingHandler = createSamplingHandler(runner.ask);
	const telegramToolset = McpTelegram({
		samplingHandler,
		env: {
			TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
			PATH: env.PATH,
		},
	});

	await telegramToolset.getTools();
	console.log("✅ Telegram bot initialized");

	return { runner, telegramToolset };
}

/**
 * Generic Chat Bot Factory
 *
 * Creates a customizable chat bot that can be adapted for different platforms.
 */
async function createCustomChatBot(config: {
	name: string;
	platform: string;
	personality: string;
	model?: string;
}) {
	console.log(`🤖 Initializing ${config.platform} bot: ${config.name}...`);

	const { runner } = await AgentBuilder.create(config.name)
		.withModel(config.model || env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription(`You are a ${config.platform} bot agent`)
		.withInstruction(config.personality)
		.withSessionService(
			createDatabaseSessionService(getSqliteConnectionString(config.name)),
		)
		.build();

	console.log(`✅ ${config.platform} bot ${config.name} initialized`);
	return runner;
}

/**
 * Multi-Platform Bot Manager
 *
 * Demonstrates how to manage multiple bots across different platforms.
 */
class BotManager {
	private bots: Map<string, any> = new Map();

	async addBot(platform: "discord" | "telegram" | "custom", config?: any) {
		let bot: any;

		switch (platform) {
			case "discord":
				bot = await createDiscordBot();
				break;
			case "telegram":
				bot = await createTelegramBot();
				break;
			case "custom":
				bot = await createCustomChatBot(config);
				break;
			default:
				throw new Error(`Unsupported platform: ${platform}`);
		}

		this.bots.set(platform, bot);
		return bot;
	}

	getBots() {
		return Array.from(this.bots.entries());
	}

	async stopAllBots() {
		console.log("🛑 Stopping all bots...");
		// Add cleanup logic here
		this.bots.clear();
	}
}

/**
 * Main execution function
 */
async function main() {
	try {
		const botType = env.BOT_TYPE || "demo";

		switch (botType) {
			case "discord":
				if (!env.DISCORD_TOKEN) {
					console.error("❌ DISCORD_TOKEN environment variable is required");
					process.exit(1);
				}
				await createDiscordBot();
				break;

			case "telegram":
				if (!env.TELEGRAM_BOT_TOKEN) {
					console.error(
						"❌ TELEGRAM_BOT_TOKEN environment variable is required",
					);
					process.exit(1);
				}
				await createTelegramBot();
				break;

			case "multi": {
				const manager = new BotManager();

				// Add multiple bots
				if (env.DISCORD_TOKEN) {
					await manager.addBot("discord");
				}
				if (env.TELEGRAM_BOT_TOKEN) {
					await manager.addBot("telegram");
				}

				// Add a custom bot
				await manager.addBot("custom", {
					name: "helpful_assistant",
					platform: "generic",
					personality:
						"You are a helpful and friendly assistant. Always be polite and informative.",
					model: "gpt-4",
				});

				console.log(`🚀 Running ${manager.getBots().length} bots`);

				// Cleanup on exit
				process.on("SIGINT", async () => {
					await manager.stopAllBots();
					process.exit(0);
				});
				break;
			}

			default: {
				console.log("🤖 Chat bots:");
				console.log("Available: discord, telegram, multi-platform");
				console.log("Usage: BOT_TYPE=discord DISCORD_TOKEN=token npm run dev");

				// Demo custom bot creation
				const demoBot = await createCustomChatBot({
					name: "demo_bot",
					platform: "console",
					personality:
						"You are a friendly demo bot. Explain concepts clearly and be encouraging.",
				});

				console.log("✨ Demo bot created successfully!");
				break;
			}
		}
	} catch (error) {
		console.error("❌ Error:", error);
		process.exit(1);
	}
}

// Environment configuration examples
export const botConfigurations = {
	discord: {
		requiredEnv: ["DISCORD_TOKEN"],
		optionalEnv: ["LLM_MODEL"],
		personality: "witty and sarcastic",
	},
	telegram: {
		requiredEnv: ["TELEGRAM_BOT_TOKEN"],
		optionalEnv: ["LLM_MODEL"],
		personality: "engaging and humorous",
	},
	custom: {
		requiredEnv: [],
		optionalEnv: ["LLM_MODEL"],
		personality: "configurable",
	},
};

if (require.main === module) {
	main().catch(console.error);
}
