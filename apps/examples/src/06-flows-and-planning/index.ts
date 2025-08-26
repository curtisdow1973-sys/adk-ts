import { env } from "node:process";
import {
	AgentBuilder,
	BuiltInPlanner,
	FileOperationsTool,
	PlanReActPlanner,
} from "@iqai/adk";
import { ask } from "../utils";

/**
 * 06 - Flows and Planning
 *
 * Learn how to enhance agent reasoning with flow processing and planning.
 *
 * Concepts covered:
 * - Flow processing with SingleFlow
 * - Built-in planning capabilities
 * - PlanReAct planning pattern
 * - Tool integration with planning
 * - Complex problem decomposition
 */

async function demonstrateBasicFlow() {
	console.log("🔄 Basic Flow");

	const { runner } = await AgentBuilder.create("flow_processor")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withTools(new FileOperationsTool())
		.build();

	const response = await ask(
		runner.ask.bind(runner),
		"Create demo.txt with ADK-TS flow info, then read it back.",
	);
	console.log(`🤖 Agent: ${response}`);
}

async function demonstrateBuiltInPlanner() {
	console.log("🧠 Built-In Planner");

	const { runner } = await AgentBuilder.create("thinking_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withPlanner(
			new BuiltInPlanner({ thinkingConfig: { includeThinking: true } }),
		)
		.build();

	const response = await ask(
		runner.ask.bind(runner),
		"Plan a $300 birthday party for 20 people who love pizza and games.",
	);
	console.log(`🤖 Agent: ${response}`);
}

async function demonstratePlanReActPlanner() {
	console.log("📋 PlanReAct Planner");

	const { runner } = await AgentBuilder.create("strategic_planner")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withTools(new FileOperationsTool({ basePath: "temp-project" }))
		.withPlanner(new PlanReActPlanner())
		.build();


	const response = await ask(
    runner.ask.bind(runner),
    "Create a Node.js project with README.md, package.json, main.js, and .gitignore"
  );
	console.log(`🤖 Agent: ${response}`);
}

async function comparePlanningApproaches() {
	console.log("📊 Planning Comparison");

	const problem = "Plan a healthy meal prep routine for a busy professional";

	// No planner
	const { runner: baseline } = await AgentBuilder.create("baseline")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.build();
	console.log("\n🔸 No Planner:");
	console.log(`🤖 Agent: ${await ask(baseline.ask.bind(baseline), problem)}`);

	// With built-in planner
	const { runner: builtin } = await AgentBuilder.create("builtin")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withPlanner(
			new BuiltInPlanner({ thinkingConfig: { includeThinking: true } }),
		)
		.build();
	console.log("\n🔸 Built-In:");
	console.log(`🤖 Agent: ${await ask(builtin.ask.bind(builtin), problem)}`);

	// With PlanReAct planner
	const { runner: planreact } = await AgentBuilder.create("planreact")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withPlanner(new PlanReActPlanner())
		.build();
	console.log("\n🔸 PlanReAct:");
	console.log(`🤖 Agent: ${await ask(planreact.ask.bind(planreact), problem)}`);
}

async function demonstrateAdvancedFlowPatterns() {
	console.log("⚙️ Advanced Flows");

	const { runner } = await AgentBuilder.create("workflow_specialist")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withTools(new FileOperationsTool())
		.withPlanner(new PlanReActPlanner())
		.build();

	const query4 =
		"Create API docs: specification, endpoints, getting started guide";
	const response = await ask(runner.ask.bind(runner), query4);
	console.log(`🤖 Agent: ${response}`);
}

async function main() {
	console.log("🌊 Flows and Planning Examples\n");

	await demonstrateBasicFlow();
	console.log();
	await demonstrateBuiltInPlanner();
	console.log();
	await demonstratePlanReActPlanner();
	console.log();
	await comparePlanningApproaches();
	console.log();
	await demonstrateAdvancedFlowPatterns();

	console.log(`
💡 Best Practices:
	• Basic Flow: Simple, linear tasks
	• Built-In Planner: Moderate complexity with reasoning
	• PlanReAct Planner: Complex, multi-step projects, useful for models without inbuilt thinking capability
	`);
}

main().catch(console.error);
