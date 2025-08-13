import { LlmAgent } from "@iqai/adk";
import { jokeTool } from "./tools";

export const getJokeAgent = () => {
	const jokeAgent = new LlmAgent({
		name: "joke_agent",
		description: "provides a random joke",
		tools: [jokeTool],
	});

	return jokeAgent;
};
