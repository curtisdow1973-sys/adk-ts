import * as dotenv from "dotenv";
import { getRootAgent } from "./agents/agent";

dotenv.config();

/**
 * Simple Agent Example
 *
 * The simplest way to create and use an AI agent with AgentBuilder.
 */
async function main() {
	const questions = ["how is weather in london?", "tell me a random joke"];

	const { runner } = await getRootAgent();

	for (const question in questions) {
		console.log(`📝 Question: ${question}`);
		const response = await runner.ask(question);
		console.log(`🤖 Response: ${response}`);
	}
}

main().catch(console.error);
