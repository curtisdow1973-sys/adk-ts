import { env } from "node:process";
import { AgentBuilder, FileOperationsTool, BuiltInPlanner, PlanReActPlanner } from "@iqai/adk";
import { v4 as uuidv4 } from "uuid";
import dedent from "dedent";

/**
 * 06 - Flows and Planning
 *
 * Learn how to enhance agent reasoning with flow processing and planning.
 * This example demonstrates different approaches to help agents think through
 * complex problems systematically.
 *
 * Concepts covered:
 * - Flow processing with SingleFlow
 * - Built-in planning capabilities  
 * - PlanReAct planning pattern
 * - Comparing planning approaches
 * - Tool integration with planning
 * - Complex problem decomposition
 */

async function demonstrateBasicFlow() {
	console.log("📝 Part 1: Basic Flow Processing");
	console.log("═══════════════════════════════════\n");

	// Create agent with flow processing capabilities
	const { runner } = await AgentBuilder.create("flow_processor")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("Demonstrates flow processing with file operations")
		.withInstruction(dedent`
			You are a file management specialist. Use the file_operations tool to handle file requests.
			When asked to create files, use the file_operations tool with operation: "write".
			When asked to read files, use the file_operations tool with operation: "read".
			Always use the tools available to you and be clear about the operations you perform.
		`)
		.withTools(new FileOperationsTool())
		.build();

	console.log("🔄 Testing basic flow with file operations:");
	const flowRequest = dedent`
		Create a file called "flow-demo.txt" with content explaining how flows work in ADK.
		Then read it back to confirm it was created correctly.
	`;

	console.log(`Request: ${flowRequest}`);
	console.log("\n📄 Flow Response:");
	const response = await runner.ask(flowRequest);
	console.log(response);
	console.log();
}

async function demonstrateBuiltInPlanner() {
	console.log("📝 Part 2: Built-In Planner (Model-Native Thinking)");
	console.log("═══════════════════════════════════════════════════\n");

	// Create agent with built-in planner
	const { runner } = await AgentBuilder.create("thinking_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("An agent that uses built-in planning to think through problems")
		.withInstruction(dedent`
			You are a thoughtful problem solver. When given complex tasks, 
			think through them step by step. Break down problems into manageable parts
			and explain your reasoning process clearly.
		`)
		.withPlanner(new BuiltInPlanner({
			thinkingConfig: {
				includeThinking: true,
			},
		}))
		.build();

	console.log("🧠 Testing built-in planner with complex problem:");
	const complexProblem = dedent`
		I need to plan a surprise birthday party for my friend next weekend.
		The party should be for about 20 people, have a budget of $300,
		and my friend loves pizza and board games. Help me plan this step by step.
	`;

	console.log(`Problem: ${complexProblem}`);
	console.log("\n🎯 Planned Response:");
	const plannedResponse = await runner.ask(complexProblem);
	console.log(plannedResponse);
	console.log();
}

async function demonstratePlanReActPlanner() {
	console.log("📝 Part 3: PlanReAct Planner (Structured Planning)");
	console.log("═══════════════════════════════════════════════════\n");

	// Create agent with PlanReAct planner and tools
	const { runner } = await AgentBuilder.create("strategic_planner")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("An agent that uses structured PlanReAct planning methodology")
		.withInstruction(dedent`
			You are a strategic planner that approaches problems systematically.
			Use the PlanReAct methodology: Plan the approach, Reason through each step,
			and Act with tools when needed. Be thorough and methodical.
		`)
		.withTools(new FileOperationsTool())
		.withPlanner(new PlanReActPlanner())
		.build();

	console.log("📋 Testing PlanReAct planner with project task:");
	const projectTask = dedent`
		I'm starting a new software project and need to set up the initial structure.
		Create a project plan and then create the basic files:
		1. A README.md with project description
		2. A package.json with basic configuration
		3. A main.js file with a simple "Hello World"
		4. A .gitignore file with common patterns
		
		The project is called "ADK Demo App" and should be a simple Node.js application.
	`;

	console.log(`Task: ${projectTask}`);
	console.log("\n📊 PlanReAct Response:");
	const planReActResponse = await runner.ask(projectTask);
	console.log(planReActResponse);
	console.log();
}

async function comparePlanningApproaches() {
	console.log("📝 Part 4: Planning Approach Comparison");
	console.log("═══════════════════════════════════════\n");

	const testProblem = "Plan a healthy meal prep routine for a busy professional who works 10-hour days";

	// No planner (baseline)
	console.log("🔸 Baseline (No Planner):");
	const { runner: baselineRunner } = await AgentBuilder.create("baseline_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("Baseline agent without planning capabilities")
		.withInstruction("You are a helpful assistant. Provide clear, practical advice.")
		.build();
	
	const baselineResponse = await baselineRunner.ask(testProblem);
	console.log(`Response: ${baselineResponse}\n`);

	// Built-in planner
	console.log("🔸 Built-In Planner:");
	const { runner: builtInRunner } = await AgentBuilder.create("builtin_planner")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("Agent with built-in planning")
		.withInstruction("Think through problems systematically and show your reasoning.")
		.withPlanner(new BuiltInPlanner({
			thinkingConfig: {
				includeThinking: true,
			},
		}))
		.build();
	
	const builtInResponse = await builtInRunner.ask(testProblem);
	console.log(`Response: ${builtInResponse}\n`);

	// PlanReAct planner
	console.log("🔸 PlanReAct Planner:");
	const { runner: planReActRunner } = await AgentBuilder.create("planreact_planner")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("Agent with structured PlanReAct planning")
		.withInstruction("Use systematic planning methodology for comprehensive solutions.")
		.withPlanner(new PlanReActPlanner())
		.build();
	
	const planReActResponse = await planReActRunner.ask(testProblem);
	console.log(`Response: ${planReActResponse}\n`);

	console.log(dedent`
		🎓 Planning Comparison Summary:

		**Baseline (No Planner):**
		- Direct, immediate responses
		- Good for simple questions
		- Faster execution
		- May miss complex considerations

		**Built-In Planner:**
		- Model-native thinking process
		- Shows reasoning steps
		- Balances speed and thoroughness
		- Good for moderate complexity

		**PlanReAct Planner:**
		- Highly structured approach
		- Systematic problem decomposition
		- Most thorough analysis
		- Best for complex, multi-step problems

		💡 Choose based on:
		- Problem complexity
		- Need for transparency  
		- Time constraints
		- Domain requirements
	`);
}

async function demonstrateAdvancedFlowPatterns() {
	console.log("📝 Part 5: Advanced Flow Patterns");
	console.log("═══════════════════════════════════\n");

	// Create agent with both planning and file operations for complex workflows
	const { runner } = await AgentBuilder.create("workflow_specialist")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("Specialist in complex workflows combining planning and file operations")
		.withInstruction(dedent`
			You are a workflow automation specialist. You excel at:
			1. Breaking down complex tasks into manageable steps
			2. Creating and managing files systematically
			3. Documenting processes clearly
			4. Verifying results at each step
			
			Always plan your approach, execute methodically, and validate results.
		`)
		.withTools(new FileOperationsTool())
		.withPlanner(new PlanReActPlanner())
		.build();

	console.log("⚙️ Testing advanced workflow automation:");
	const workflowTask = dedent`
		Create a complete documentation system for a new API project:
		
		1. Generate an API specification document
		2. Create endpoint documentation with examples
		3. Write a developer getting started guide
		4. Create a changelog template
		5. Set up a docs folder structure
		
		The API is for a "Task Management Service" with endpoints for
		creating, reading, updating, and deleting tasks.
	`;

	console.log(`Workflow Task: ${workflowTask}`);
	console.log("\n🏗️ Workflow Execution:");
	const workflowResponse = await runner.ask(workflowTask);
	console.log(workflowResponse);
	console.log();
}

async function demonstrateFlowBestPractices() {
	console.log("📝 Part 6: Flow and Planning Best Practices");
	console.log("══════════════════════════════════════════════\n");

	console.log(dedent`
		🎯 Flow and Planning Best Practices:

		**When to Use Each Approach:**

		🔹 **Basic Flow (No Planner)**
		   - Simple, linear tasks
		   - Single-step operations
		   - Quick responses needed
		   - Well-defined procedures

		🔹 **Built-In Planner**
		   - Moderate complexity tasks
		   - Need to show reasoning
		   - Creative problem solving
		   - Balanced speed/thoroughness

		🔹 **PlanReAct Planner**
		   - Complex, multi-step projects
		   - High-stakes decisions
		   - Need systematic approach
		   - Documentation required

		**Flow Design Principles:**

		✅ **Clear Instructions**
		   - Define agent capabilities clearly
		   - Specify expected behaviors
		   - Include error handling guidance

		✅ **Tool Integration**
		   - Choose appropriate tools for the task
		   - Test tool combinations thoroughly
		   - Provide tool usage guidelines

		✅ **Progressive Complexity**
		   - Start with simple flows
		   - Add planning for complex tasks
		   - Layer capabilities incrementally

		✅ **Validation and Feedback**
		   - Verify intermediate results
		   - Provide clear status updates
		   - Handle errors gracefully

		**Performance Considerations:**

		⚡ **Speed vs. Quality Trade-offs**
		   - No planner: Fastest, least thorough
		   - Built-in: Balanced approach
		   - PlanReAct: Slowest, most comprehensive

		🎛️ **Optimization Tips**
		   - Use caching for repeated operations
		   - Batch file operations when possible
		   - Choose model size based on complexity needs
		   - Monitor token usage with complex planning
	`);
}

async function main() {
	console.log("🌊 06 - Flows and Planning");
	console.log("═══════════════════════════\n");

	try {
		await demonstrateBasicFlow();
		await demonstrateBuiltInPlanner();
		await demonstratePlanReActPlanner();
		await comparePlanningApproaches();
		await demonstrateAdvancedFlowPatterns();
		await demonstrateFlowBestPractices();

		console.log("✅ Flows and Planning examples completed!");
		console.log("\n🎓 Key Takeaways:");
		console.log("- Flows enable structured agent processing");
		console.log("- Planning enhances reasoning for complex tasks");
		console.log("- Different planners suit different problem types");
		console.log("- Tool integration amplifies planning capabilities");

		console.log("\n🎓 Next Steps:");
		console.log("- Run example 07-code-execution for dynamic code capabilities");
		console.log("- Try different planning strategies for your use cases");
		console.log("- Experiment with combining planners and tools");

	} catch (error) {
		console.error("❌ Error in flows and planning example:", error);
		process.exit(1);
	}
}

main().catch(console.error);
