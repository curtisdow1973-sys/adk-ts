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
	console.log("🤖 Simple agent:");
	const response = await AgentBuilder.withModel(
		env.LLM_MODEL || "gemini-2.5-flash",
	).ask("What is the capital of France?");
	console.log(response);
}

main().catch(console.error);
