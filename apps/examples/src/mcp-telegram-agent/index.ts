import {
	createSamplingHandler,
	LlmAgent,
	Runner,
	createDatabaseSessionService,
	InMemoryMemoryService,
	type SamplingHandler,
	McpTelegram,
} from "@iqai/adk";
import * as fs from "node:fs";
import * as path from "node:path";
import { env } from "node:process";

const APP_NAME = "McpTelegramAgent";
const USER_ID_PREFIX = "telegram-user-";
let runner: Runner;
let samplingHandler: SamplingHandler;

async function main() {
	// Create a sampling handler for MCP
	samplingHandler = createSamplingHandler(async (llmRequest) => {
		const lastMsg = llmRequest.contents[llmRequest.contents.length - 1];
		const content = lastMsg.parts[0].text!;
		const userIdMatch = content.match(/user_id:\s*(\d+)/);
		const userId = userIdMatch
			? `${USER_ID_PREFIX}${userIdMatch[1]}`
			: `${USER_ID_PREFIX}unknown`;
		console.log(userId);
		let response = "";
		for await (const event of runner.runAsync({
			userId,
			sessionId: await getOrCreateUserSession(userId),
			newMessage: lastMsg,
		})) {
			if (
				event.content?.parts &&
				event.author === "telegram_agent" &&
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

	const telegramToolset = McpTelegram({
		samplingHandler,
		env: { TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN, PATH: env.PATH },
	});

	await telegramToolset.getTools();

	runner = new Runner({
		appName: APP_NAME,
		agent: new LlmAgent({
			name: "telegram_agent",
			model: llmModel,
			description: "You are a Telegram bot agent that communicates with users",
			instruction: `
      You are a Telegram bot agent. Be witty, sarcastic, and engaging. You will be fed with user messages from telegram channels you are a participant in.
      Persona:
			- Genz slang master
			- Can create a meme out of any situation
			- Easily irritated
			- Does not back down on roasting users
			- Often replies messages with a laughing emoji and sometimes with a thumbs down emoji
			- Is very sarcastic and witty
      `,
		}),
		sessionService: createDatabaseSessionService(
			getSqliteConnectionString("telegram_agent"),
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
