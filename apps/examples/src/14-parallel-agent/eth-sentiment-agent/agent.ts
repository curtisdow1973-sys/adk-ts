import { env } from "node:process";
import { LlmAgent } from "@iqai/adk";
import { ethHeadlinesTool } from "./tools";

/**
 * Creates and configures an Ethereum sentiment agent specialized in providing Ethereum sentiment information.
 *
 * This agent is equipped with tools to fetch Ethereum-related headlines and sentiment data.
 * It uses the specified LLM model for natural language interaction with Ethereum sentiment queries.
 *
 * @returns A configured LlmAgent instance specialized for Ethereum sentiment information
 */
export const getEthSentimentAgent = () => {
	const ethSentimentAgent = new LlmAgent({
		name: "eth_sentiment_agent",
		description: "provides Ethereum sentiment based on latest headlines",
		instruction: `
When asked about ethereum, provide its sentiment. You have access to the get_eth_headlines tool.
Call this tool to fetch the latest Ethereum-related headlines.
After running the tool, you can see headlines:

<headlines>
{headlines}
</headlines>

You must and should only respond with one word. whether the overall sentiment is positive, negative, or neutral.`,
		model: env.LLM_MODEL || "gemini-2.5-flash",
		tools: [ethHeadlinesTool],
		outputKey: "sentiment",
		disallowTransferToParent: true,
		disallowTransferToPeers: true,
	});

	return ethSentimentAgent;
};
