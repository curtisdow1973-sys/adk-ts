import { env } from "node:process";
import { AgentBuilder, AgentTool, LlmAgent, createTool } from "@iqai/adk";
import * as z from "zod/v4";

async function main() {
	console.log("═══════════════════════════════════════════");

	const calculatorTool = createTool({
		name: "calculate",
		description: "Performs basic math calculations",
		schema: z.object({
			expression: z.string().describe("Math expression like '2+2' or '10*5'"),
		}),
		fn: ({ expression }) => {
			try {
				const sanitized = expression
					.replace(/\s/g, "")
					.replace(/[^0-9+\-*/().]/g, "");

				if (!/^[\d+\-*/().]+$/.test(sanitized)) {
					return "Invalid expression";
				}

				const result = new Function(`return ${sanitized}`)();
				return result.toString();
			} catch {
				return "Invalid expression";
			}
		},
	});

	const mathExpertAgent = new LlmAgent({
		name: "math_expert",
		model: env.LLM_MODEL || "gemini-1.5-flash",
		description: "Math expert that solves complex word problems step by step",
		instruction: `You are a math expert. When given a word problem:
		1. Read and understand the problem
		2. Break it down into mathematical steps
		3. Use the calculate tool for each step
		4. Explain your reasoning
		5. Provide the final answer with explanation
		
		Always show your work and use the calculate tool for computations.`,
		tools: [calculatorTool],
	});

	const mathSolverTool = new AgentTool({
		name: "solve_word_problem",
		description: "Solves complex word problems with step-by-step reasoning",
		agent: mathExpertAgent,
	});

	const { runner } = await AgentBuilder.create("teacher")
		.withModel(env.LLM_MODEL || "gemini-1.5-flash")
		.withDescription("Teacher with access to intelligent math expert")
		.withInstruction(`You are a teacher. You have access to:
		- solve_word_problem: A math expert that can solve any math problem (simple or complex)
		
		For ANY math question, use the solve_word_problem tool. The math expert inside can handle both simple calculations and complex word problems.`)
		.withTools(mathSolverTool)
		.build();

	console.log("\n=== Example 1: Agent Tool with Simple Math ===");
	const simpleQuery = "What is 25 * 4?";
	console.log(`🔢 Query: ${simpleQuery}`);
	const simpleResponse = await runner.ask(simpleQuery);
	console.log(`🤖 Response: ${simpleResponse}`);

	console.log("\n=== Example 2: Agent Tool with Complex Word Problem ===");
	const complexQuery =
		"If I have 5 boxes and each box contains 8 apples, and I give away 12 apples, how many apples do I have left?";
	console.log(`🧮 Query: ${complexQuery}`);
	const complexResponse = await runner.ask(complexQuery);
	console.log(`🤖 Response: ${complexResponse}`);
}

main().catch(console.error);
