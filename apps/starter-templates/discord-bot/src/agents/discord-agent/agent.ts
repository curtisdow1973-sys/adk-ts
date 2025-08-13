import { LlmAgent, type SamplingHandler } from "@iqai/adk";
import { getDiscordMcpTools } from "./tool";

export const getDiscordAgent = async (samplingHandler: SamplingHandler) => {
	const discordMcpTools = await getDiscordMcpTools(samplingHandler);
	const discordAgent = new LlmAgent({
		name: "discord_agent",
		description:
			"An agent capable of interacting with Discord. It can send messages, add reactions to messages, retrieve group and channel information, and perform various Discord management tasks.",
		model: "gemini-2.5-flash",
		tools: discordMcpTools,
	});
	return discordAgent;
};
