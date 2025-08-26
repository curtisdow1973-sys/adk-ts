import { AgentBuilder } from "@iqai/adk";
import z from "zod";
import { env } from "../../env";

export const getFormatAgent = async () => {
	const builder = AgentBuilder.create("format_agent")
		.withDescription(
			"Formats the conversation so far to extract and provide Ethereum price and sentiment information.",
		)
		.withInstruction(
			`Given the conversation so far, extract the Ethereum price and overall sentiment.
Respond strictly using the following schema:
- price: the price of Ethereum as a number
- sentiment: one of "positive", "negative", or "neutral"
Do not include any additional text or explanation.`,
		)
		.withModel(env.LLM_MODEL)
		.withOutputSchema(
			z.object({
				price: z.number().describe("price of ethereum"),
				sentiment: z.enum(["positive", "negative", "neutral"]),
			}),
		);

	return builder.build();
};
