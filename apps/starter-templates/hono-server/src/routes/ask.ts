import type { Context } from "hono";
import { getRootAgent } from "../agents/agent";

export const askHandler = async (c: Context) => {
	try {
		const body = await c.req.json();
		const { question } = body;

		if (!question) {
			return c.json({ error: "Question is required" }, 400);
		}

		console.log(`📝 Question received: ${question}`);

		// answer with our root agent
		const { runner } = await getRootAgent();
		const response = runner.ask(question);

		console.log(`🤖 Response generated: ${response}`);

		return c.json({
			question,
			response,
			timestamp: new Date().toISOString(),
		});
	} catch (error) {
		console.error("Error processing request:", error);
		return c.json(
			{
				error: "Internal server error",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
	}
};
