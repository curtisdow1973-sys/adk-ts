import { LlmAgent, type SamplingHandler } from "@iqai/adk";
import { getTelegramMcpTools } from "./tool";

export const getTelegramAgent = async (samplingHandler: SamplingHandler) => {
	const telegramMcpTools = await getTelegramMcpTools(samplingHandler);
	const telegramAgent = new LlmAgent({
		name: "telegram_agent",
		description:
			"An agent capable of interacting with Telegram. It can send messages, add reactions to messages, retrieve group and channel information, and perform various Telegram management tasks.",
		model: "gemini-2.5-flash",
		tools: telegramMcpTools,
	});
	return telegramAgent;
};
