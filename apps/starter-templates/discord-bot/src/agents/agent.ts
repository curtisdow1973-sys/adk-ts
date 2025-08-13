import * as fs from "node:fs";
import * as path from "node:path";
import { AgentBuilder, createDatabaseSessionService } from "@iqai/adk";
import { getJokeAgent } from "./joke-agent/agent";
import { getWeatherAgent } from "./weather-agent/agent";

export const getRootAgent = () => {
	const jokeAgent = getJokeAgent();
	const weatherAgent = getWeatherAgent();

	return AgentBuilder.create("root_agent")
		.withDescription(
			"Root agent that delegates tasks to sub-agents for telling jokes and providing weather information.",
		)
		.withInstruction(
			"Use the joke sub-agent for humor requests and the weather sub-agent for weather-related queries. Route user requests to the appropriate sub-agent.",
		)
		.withModel("gemini-2.5-flash")
		.withSessionService(
			createDatabaseSessionService(getSqliteConnectionString("discord_bot")),
		)
		.withSubAgents([jokeAgent, weatherAgent])
		.build();
};

/**
 * Get SQLite connection string for the database
 */
function getSqliteConnectionString(dbName: string): string {
	const dbPath = path.join(__dirname, "data", `${dbName}.db`);
	if (!fs.existsSync(path.dirname(dbPath))) {
		fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	}
	return `sqlite://${dbPath}`;
}
