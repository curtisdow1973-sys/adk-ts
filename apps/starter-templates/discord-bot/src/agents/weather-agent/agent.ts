import { LlmAgent } from "@iqai/adk";
import { weatherTool } from "./tools";

export const getWeatherAgent = () => {
	const weatherAgent = new LlmAgent({
		name: "weather_agent",
		description: "provides weather for a given city",
		model: "gemini-2.5-flash",
		tools: [weatherTool],
	});

	return weatherAgent;
};
