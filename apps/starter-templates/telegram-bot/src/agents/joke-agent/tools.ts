import { createTool } from "@iqai/adk";

export const jokeTool = createTool({
	name: "get_joke",
	description: "Fetches a random joke",
	fn: async () => {
		try {
			const response = await fetch(
				"https://official-joke-api.appspot.com/random_joke",
			);
			return await response.text();
		} catch {
			return "Joke unavailable right now.";
		}
	},
});
