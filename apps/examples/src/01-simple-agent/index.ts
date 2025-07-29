import { env } from "node:process";
import { AgentBuilder } from "@iqai/adk";
import dedent from "dedent";

/**
 * 01 - Simple Agent Example
 *
 * The simplest way to create and use an AI agent with AgentBuilder.
 * This example demonstrates the most basic usage patterns and serves
 * as the starting point for learning the ADK framework.
 *
 * Concepts covered:
 * - Basic AgentBuilder usage
 * - Model configuration
 * - Simple question-answer interaction
 * - Environment variable configuration
 */
async function main() {
	console.log("🤖 01 - Simple Agent Example");
	console.log("═══════════════════════════\n");

	// Example 1: The absolute simplest usage
	console.log("📝 Example 1: Minimal Agent");
	const question1 = "What is the capital of France?";
	
	const response1 = await AgentBuilder.withModel(
		env.LLM_MODEL || "gemini-2.5-flash"
	).ask(question1);

	console.log(`Question: ${question1}`);
	console.log(`Response: ${response1}\n`);

	// Example 2: Agent with custom description
	console.log("📝 Example 2: Agent with Description");
	const question2 = "Explain quantum computing in simple terms";
	
	const response2 = await AgentBuilder.create("science_tutor")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("A helpful science tutor that explains complex topics simply")
		.ask(question2);

	console.log(`Question: ${question2}`);
	console.log(`Response: ${response2}\n`);

	// Example 3: Agent with instructions
	console.log("📝 Example 3: Agent with Custom Instructions");
	const question3 = "What's the weather like?";
	
	const response3 = await AgentBuilder.create("creative_assistant")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("A creative assistant with a unique personality")
		.withInstruction(dedent`
			You are a poetic assistant who always responds in haiku format.
			Every response should be exactly 3 lines following 5-7-5 syllable pattern.
			Be creative and find ways to answer questions within this constraint.
		`)
		.ask(question3);

	console.log(`Question: ${question3}`);
	console.log(`Response:\n${response3}\n`);

	console.log("✅ Simple Agent examples completed!");
	console.log("\n🎓 Next Steps:");
	console.log("- Run example 02-tools-and-state to learn about tools");
	console.log("- Explore how to add functionality to your agents");
	console.log("- Try modifying the instructions to see how behavior changes");
}

main().catch(console.error);
