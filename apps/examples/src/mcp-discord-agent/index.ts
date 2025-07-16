import {
	createSamplingHandler,
	LlmAgent,
	Runner,
	createDatabaseSessionService,
	InMemoryMemoryService,
	type SamplingHandler,
	McpDiscord,
} from "@iqai/adk";
import * as fs from "node:fs";
import * as path from "node:path";
import { env } from "node:process";

const APP_NAME = "McpDiscordAgent";
const USER_ID_PREFIX = "discord-user-";
let runner: Runner;
let samplingHandler: SamplingHandler;

async function main() {
	// Create a sampling handler for MCP
	samplingHandler = createSamplingHandler(async (llmRequest) => {
		// Use author id from the last message if available
		const lastMsg = llmRequest.contents[llmRequest.contents.length - 1];
		const userId = lastMsg?.parts?.[0]?.text
			? `${USER_ID_PREFIX}mcp`
			: `${USER_ID_PREFIX}unknown`;
		let response = "";
		for await (const event of runner.runAsync({
			userId,
			sessionId: await getOrCreateUserSession(userId),
			newMessage: lastMsg,
		})) {
			if (
				event.content?.parts &&
				event.author === "discord_agent" &&
				!event.partial
			) {
				response += event.content.parts.map((p) => p.text).join("");
			}
		}
		return {
			content: { role: "model", parts: [{ text: response }] },
		};
	});
	await initializeRunner();
	process.stdin.resume();
}

async function initializeRunner() {
	console.log("🤖 Initializing agent runner...");
	const llmModel = env.LLM_MODEL || "gemini-2.5-flash";
	console.log("🔧 Using LLM model:", llmModel);

	const discordToolset = McpDiscord({
		samplingHandler,
		env: { DISCORD_TOKEN: env.DISCORD_TOKEN, PATH: env.PATH },
	});

	const tools = await discordToolset.getTools();

	runner = new Runner({
		appName: APP_NAME,
		agent: new LlmAgent({
			name: "discord_agent",
			model: llmModel,
			description: "You are a Discord bot agent that communicates with users",
			instruction: `
      You are a Discord bot agent. Be witty, sarcastic, and engaging. You will be fed with user messages from discord channels you are a participant in.
      Persona:
			- Genz slang master
			- Can create a meme out of any situation
			- Easily irritated
			- Does not back down on roasting users
			- Often replies messages with a laughing emoji and sometimes with a thumbs down emoji
			- Is very sarcastic and witty
      `,
			tools,
		}),
		sessionService: createDatabaseSessionService(
			getSqliteConnectionString("discord_agent"),
		),
		memoryService: new InMemoryMemoryService(),
	});

	console.log("✅ Agent runner initialized");
}

async function getOrCreateUserSession(userId: string): Promise<string> {
	const fullUserId = userId;
	const { sessions } = await runner.sessionService.listSessions(
		APP_NAME,
		fullUserId,
	);
	if (sessions.length > 0) {
		return sessions[0].id;
	}
	const newSession = await runner.sessionService.createSession(
		APP_NAME,
		fullUserId,
	);
	return newSession.id;
}

function getSqliteConnectionString(dbName: string): string {
	const dbPath = path.join(__dirname, "data", `${dbName}.db`);
	if (!fs.existsSync(path.dirname(dbPath))) {
		fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	}
	return `sqlite://${dbPath}`;
}

main().catch(console.error);
