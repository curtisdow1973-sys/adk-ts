import { McpTelegram, type SamplingHandler } from "@iqai/adk";
import { env } from "../../env";

export const getTelegramMcpTools = async (samplingHandler: SamplingHandler) => {
	const mcpToolset = McpTelegram({
		samplingHandler,
		env: {
			TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN,
		},
	});
	const tools = await mcpToolset.getTools();
	return tools;
};
