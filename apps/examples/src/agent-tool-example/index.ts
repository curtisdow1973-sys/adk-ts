import { env } from "node:process";
import { AgentBuilder, AgentTool, LlmAgent, createTool } from "@iqai/adk";
import * as z from "zod/v4";

/**
 * Agent Tool Example
 *
 * Demonstrates how to use an Agent as a Tool - allowing specialized agents
 * to be composed together as reusable tools.
 */
async function main() {
	console.log("🤖 Agent Tool Example");
	console.log("═════════════════════");

	// Create a calculator tool
	const calculatorTool = createTool({
		name: "calculate",
		description: "Performs basic mathematical calculations",
		schema: z.object({
			expression: z.string().describe("Mathematical expression to evaluate"),
		}),
		fn: ({ expression }) => {
			try {
				const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
				const result = new Function(`return ${sanitized}`)();
				return `${expression} = ${result}`;
			} catch (error) {
				return `Error: ${error.message}`;
			}
		},
	});

	// Create a specialized math agent
	const mathAgent = new LlmAgent({
		name: "math_specialist",
		model: env.LLM_MODEL || "gemini-2.5-flash",
		description: "Expert mathematician who solves mathematical problems",
		instruction: "Solve math problems step by step using the calculator tool",
		tools: [calculatorTool],
	});

	// Create an AgentTool from the math agent
	const mathTool = new AgentTool({
		name: "solve_math",
		description: "Solves mathematical problems with explanations",
		agent: mathAgent,
	});

	// Create main agent that uses the math agent as a tool
	const { runner } = await AgentBuilder.create("main_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("General assistant with access to math specialist")
		.withTools(mathTool)
		.build();

	// Test the agent tool
	console.log("\n--- Math Problem Example ---");
	const question = "What is 15% of 240 plus 12 squared?";
	console.log(`📝 Question: ${question}`);

	const response = await runner.ask(question);
	console.log(`🤖 Response: ${response}`);
}

main().catch(console.error);
