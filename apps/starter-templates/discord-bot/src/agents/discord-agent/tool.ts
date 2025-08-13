import { McpDiscord, type SamplingHandler } from "@iqai/adk";
import { env } from "../../env";

export const getDiscordMcpTools = async (samplingHandler: SamplingHandler) => {
	const mcpToolset = McpDiscord({
		samplingHandler,
		env: {
			DISCORD_TOKEN: env.DISCORD_TOKEN,
		},
	});
	const tools = await mcpToolset.getTools();
	return tools;
};
