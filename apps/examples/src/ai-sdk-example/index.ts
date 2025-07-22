import { env } from "node:process";
import { google } from "@ai-sdk/google";
import { AgentBuilder, createTool } from "@iqai/adk";
import * as z from "zod/v4";

const weatherTool = createTool({
	name: "getWeather",
	description: "Gets weather for a location",
	schema: z.object({
		location: z.string(),
	}),
	fn: ({ location }) => {
		return `The weather in ${location} is 22°C and sunny.`;
	},
});

async function main() {
	const { runner } = await AgentBuilder.create("weather_agent")
		.withModel(google("gemini-2.5-flash")) // Ensure setting GOOGLE_GENERATIVE_AI_API_KEY in .env
		.withTools(weatherTool)
		.build();

	const response = await runner.ask("What's the weather in London?");
	console.log(response);
}

main().catch(console.error);
