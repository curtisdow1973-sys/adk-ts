import { env } from "node:process";
import { AgentBuilder } from "@iqai/adk";
import { getEthPriceAgent } from "./eth-price-agent/agent";
import { getEthSentimentAgent } from "./eth-sentiment-agent/agent";

/**
 * Creates and configures the root agent for the simple agent demonstration.
 *
 * This agent serves as the main orchestrator that routes user requests to
 * specialized sub-agents based on the request type. It demonstrates the
 * basic ADK pattern of using a root agent to coordinate multiple specialized
 * agents for different domains (jokes and weather).
 *
 * @returns The fully constructed root agent instance ready to process requests
 */
export const main = async () => {
	const ethPriceAgent = getEthPriceAgent();
	const ethSentimentAgent = getEthSentimentAgent();

	const initialState = { headlines: "", price: 0, sentiment: "" };

	const { runner, session, sessionService } = await AgentBuilder.create(
		"root_agent",
	)
		.withDescription(
			"Root agent that delegates tasks to sub-agents for fetching Ethereum price and sentiment information.",
		)
		.withInstruction(
			"when asked about ethereum information first check ethereum's price, then sentiment",
		)
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.asParallel([ethSentimentAgent, ethPriceAgent])
		.withQuickSession({ state: initialState })
		.build();

	// Run models to get price and sentiment
	const response = await runner.ask("Give ethereum's price and sentiment");
	const currentSession = await sessionService.getSession(
		session.appName,
		session.userId,
		session.id,
	);

	if (!currentSession) {
		throw Error("session not found");
	}

	const { price, sentiment } = currentSession.state as {
		price: number;
		sentiment: string;
	};

	console.log({
		price,
		sentiment,
		state: currentSession.state,
		response,
		responseShape: Array.isArray(response) ? "array" : "string",
	});

	// Keep the process alive
	process.on("SIGINT", () => {
		console.log("🛑 Shutting down...");
		process.exit(0);
	});
};

if (require.main === module) {
	main().catch(console.error);
}
