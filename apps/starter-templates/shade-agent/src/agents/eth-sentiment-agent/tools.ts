import { createTool } from "@iqai/adk";
import * as z from "zod";

/**
 * Tool for fetching latest Ethereum-related news headlines.
 *
 * Uses the CryptoPanic public API to retrieve recent headlines about Ethereum.
 * Returns a formatted list of headlines or an error message if unavailable.
 */
export const ethHeadlinesTool = createTool({
	name: "get_eth_headlines",
	description: "Get latest Ethereum-related news headlines",
	schema: z.object({
		limit: z
			.number()
			.int()
			.min(1)
			.max(10)
			.default(5)
			.describe("Number of headlines to fetch"),
	}),
	fn: async ({ limit }) => {
		try {
			const response = await fetch(
				"https://cryptopanic.com/api/v1/posts/?currencies=ETH&public=true",
			);
			const data = await response.json();
			if (!data.results || !Array.isArray(data.results)) {
				return "No headlines found.";
			}
			const headlines = data.results
				.slice(0, limit)
				.map((item: any, idx: number) => `${idx + 1}. ${item.title}`);
			return headlines.join("\n");
		} catch {
			return "Ethereum headlines unavailable at the moment.";
		}
	},
});
