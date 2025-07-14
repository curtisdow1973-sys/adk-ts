/**
 * ADK CLI Demonstration
 *
 * This script shows how to use the ADK CLI commands.
 * The CLI requires agents to be created with 'npx adk create' first,
 * as it expects an agent.ts file that exports a rootAgent.
 *
 * Run with: npm run examples:cli-minimal-example
 */

import fs from "node:fs/promises";
import path from "node:path";

async function demonstrateCliUsage() {
	console.log("🚀 ADK CLI Usage Demo");
	console.log("====================\n");

	const examplesDir = path.resolve(process.cwd(), "..", "..");
	const toolUsageDir = path.join(examplesDir, "src", "tool-usage");

	console.log("📋 Available CLI Commands");
	console.log("=========================\n");

	console.log("🔨 Step 1: Create Agent");
	console.log("   npx adk create my-tool-agent");
	console.log("   # Creates agent.ts with proper CLI structure\n");

	console.log("💬 1. Interactive Terminal Chat");
	console.log("   npx adk run my-tool-agent");
	console.log("   # Start interactive chat with the agent\n");

	console.log("🌐 2. Web Development UI");
	console.log("   npx adk web src/tool-usage --port 3000");
	console.log("   # Launch web interface at http://localhost:3000\n");

	console.log("🔌 3. REST API Server");
	console.log(
		"   npx adk api_server --agent_dir src/tool-usage --port 8000 --with_ui",
	);
	console.log("   # Start HTTP server with REST endpoints\n");

	console.log("📈 4. Agent Visualization");
	console.log("   npx adk graph src/tool-usage --output tool-usage-graph.png");
	console.log("   # Generate visual graph (requires Graphviz)\n");

	console.log("☁️  5. Cloud Deployment");
	console.log("   npx adk deploy cloud_run src/tool-usage \\");
	console.log('     --project "your-gcp-project" \\');
	console.log('     --region "us-central1" \\');
	console.log('     --service_name "tool-usage-api"');
	console.log("   # Deploy to Google Cloud Run\n");

	// Create a simple evaluation file for the tool-usage example
	await createToolUsageEval();

	console.log("📊 6. Agent Evaluation");
	console.log("   npx adk eval src/tool-usage tool-usage-eval.test.json");
	console.log("   # Run automated tests\n");

	console.log("🔧 API Usage Examples");
	console.log("====================\n");

	console.log("Create Session:");
	console.log("curl -X POST http://localhost:8000/sessions \\");
	console.log('  -H "Content-Type: application/json" \\');
	console.log(
		'  -d \'{"userId": "user123", "appName": "tool-usage-demo", "state": {}}\'',
	);
	console.log("");

	console.log("Send Calculator Request:");
	console.log("curl -X POST http://localhost:8000/agents/run \\");
	console.log('  -H "Content-Type: application/json" \\');
	console.log("  -d '{");
	console.log('    "appName": "tool-usage-demo",');
	console.log('    "userId": "user123",');
	console.log('    "sessionId": "session-123",');
	console.log(
		'    "newMessage": {"type": "text", "text": "What is 25 * 4 + 10?"},',
	);
	console.log('    "streaming": false');
	console.log("  }'");
	console.log("");

	console.log("Send Weather Request:");
	console.log("curl -X POST http://localhost:8000/agents/run \\");
	console.log('  -H "Content-Type: application/json" \\');
	console.log("  -d '{");
	console.log('    "appName": "tool-usage-demo",');
	console.log('    "userId": "user123",');
	console.log('    "sessionId": "session-123",');
	console.log(
		'    "newMessage": {"type": "text", "text": "What\'s the weather in Tokyo?"},',
	);
	console.log('    "streaming": false');
	console.log("  }'");
	console.log("");

	console.log("🎯 Example Interactions");
	console.log("=======================\n");

	console.log("Calculator Examples:");
	console.log('  "What\'s 15 + 27?"');
	console.log('  "Calculate the square root of 144"');
	console.log('  "What\'s 20% of 150?"');
	console.log("");

	console.log("Weather Examples:");
	console.log('  "What\'s the weather in Paris?"');
	console.log('  "Is it raining in Seattle?"');
	console.log('  "What\'s the temperature in London?"');
	console.log("");

	console.log("Multi-Tool Examples:");
	console.log('  "Calculate 15% tip on $45 and tell me the weather in NYC"');
	console.log('  "What\'s 12 * 8, and is it sunny in Miami?"');
	console.log("");

	console.log("⚡ Quick Start");
	console.log("==============\n");
	console.log("# Navigate to examples directory");
	console.log("cd apps/examples");
	console.log("");
	console.log("# Try interactive chat");
	console.log("npx adk run src/tool-usage");
	console.log("");
	console.log("# Or web UI (in new terminal)");
	console.log("npx adk web src/tool-usage --port 3000");
	console.log("");
	console.log("# Or API server (in new terminal)");
	console.log(
		"npx adk api_server --agent_dir src/tool-usage --port 8000 --with_ui",
	);
	console.log("");

	console.log("🎨 Other Examples to Try");
	console.log("========================\n");
	console.log(
		"npx adk run src/simple-agent         # Basic conversational agent",
	);
	console.log("npx adk run src/specialized-agents   # Domain-specific agents");
	console.log("npx adk run src/memory-usage         # Memory and context demo");
	console.log("npx adk run src/flows-example        # Flow-based agents");
	console.log("");

	console.log("✅ Ready to explore ADK CLI!");
	console.log(
		"The tool-usage example is perfect for testing all CLI features.",
	);
}

async function createToolUsageEval() {
	const evalData = [
		{
			name: "calculator_basic",
			description: "Test basic calculator functionality",
			initial_state: {},
			input: "What is 15 + 27?",
			expected_output_contains: ["42"],
			expected_tool_calls: ["calculator"],
			max_iterations: 3,
		},
		{
			name: "weather_query",
			description: "Test weather information retrieval",
			initial_state: {},
			input: "What's the weather like in New York?",
			expected_output_contains: ["weather", "New York"],
			expected_tool_calls: ["weather"],
			max_iterations: 3,
		},
		{
			name: "multi_tool_usage",
			description: "Test using both calculator and weather tools",
			initial_state: {},
			input: "Calculate 20% tip on $80 and tell me the weather in London",
			expected_output_contains: ["tip", "16", "weather", "London"],
			expected_tool_calls: ["calculator", "weather"],
			max_iterations: 5,
		},
	];

	try {
		await fs.writeFile(
			path.join(process.cwd(), "tool-usage-eval.test.json"),
			JSON.stringify(evalData, null, 2),
		);
		console.log("📝 Created tool-usage-eval.test.json for testing");
	} catch (error) {
		console.log("📝 Evaluation file creation skipped (demo mode)");
	}
}

// Run the demonstration
if (require.main === module) {
	demonstrateCliUsage().catch(console.error);
}
