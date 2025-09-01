import { env } from "node:process";
import { LlmAgent } from "@iqai/adk";
import { ethPriceTool } from "./tools";

/**
 * Creates and configures an agent specialized in providing Ethereum price information.
 *
 * This agent is equipped with tools to fetch and deliver the current ETH price to users.
 * It uses the Gemini 2.5 Flash model for natural conversation flow and
 * can access ETH price-related tools for up-to-date information.
 *
 * @returns A configured LlmAgent instance specialized for ETH price delivery
 */
export const getEthPriceAgent = () => {
	const ethPriceAgent = new LlmAgent({
		name: "eth_price_agent",
		description: "provides the current Ethereum (ETH) price",
		instruction: "when asked about ethereum, provide its price",
		model: env.LLM_MODEL || "gemini-2.5-flash",
		tools: [ethPriceTool],
	});

	return ethPriceAgent;
};
