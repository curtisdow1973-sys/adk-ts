import { env } from "node:process";
import { AgentBuilder, LlmAgent } from "@iqai/adk";
import dedent from "dedent";
import { z } from "zod";

/**
 * 01 - Simple Agent
 *
 * The simplest way to create and use an AI agent.
 *
 * Concepts covered:
 * - Basic AgentBuilder usage
 * - Model configuration
 * - Simple question-answer interaction
 * - Structured output with Zod schemas
 */
async function main() {
	console.log("🤖 Simple agent with structured output:");

	// Define the expected output structure
	const outputSchema = z.object({
		capital: z.string().describe("The capital city name"),
		country: z.string().describe("The country name"),
		population: z
			.number()
			.optional()
			.describe("Population of the capital city"),
		fun_fact: z.string().describe("An interesting fact about the city"),
	});

	const response = await AgentBuilder.withModel(
		env.LLM_MODEL || "gemini-2.5-flash",
	)
		.asSequential([
			new LlmAgent({
				name: "dnt_selct",
				description: "don't select",
				model: env.LLM_MODEL || "gemini-2.5-flash",
			}),
		])
		.withOutputKey("sd")
		.ask("What is the capital of France?");

	console.log(response);
}

main().catch(console.error);
