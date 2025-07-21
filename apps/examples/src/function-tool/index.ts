import { env } from "node:process";
import { AgentBuilder, FunctionTool, type EnhancedRunner } from "@iqai/adk";

/**
 * Example function to calculate the sum of two numbers.
 * @param a First number to add
 * @param b Second number to add
 * @returns The sum of a and b
 */
function calculateSum(a: number, b: number): number {
	return a + b;
}

/**
 * Example async function that fetches weather data for a city.
 * @param city The city to fetch weather for
 * @returns A simulated weather report
 */
async function getWeather(city: string): Promise<Record<string, any>> {
	console.log(`Fetching weather for ${city}...`);

	// Simulate API call delay
	await new Promise((resolve) => setTimeout(resolve, 1000));

	// Return simulated weather data
	return {
		city,
		temperature: Math.floor(Math.random() * 30) + 10,
		conditions: ["sunny", "cloudy", "rainy", "stormy"][
			Math.floor(Math.random() * 4)
		],
		humidity: Math.floor(Math.random() * 60) + 40,
		date: new Date().toISOString(),
	};
}

/**
 * Example of a function that requires a context parameter
 * @param userName The name of the user to get info for
 * @param toolContext Context provided by the tool execution environment
 * @returns User information object
 */
function getUserInfo(userName: string, toolContext: any): Record<string, any> {
	console.log(`Getting user info for ${userName} with context:`, toolContext);

	// In a real application, this might query a database using context credentials
	return {
		name: userName,
		id: Math.floor(Math.random() * 10000),
		membership: "premium",
		accessLevel: 3,
	};
}

async function main() {
	console.log("🛠️ Starting Function Tool example...");

	try {
		/**
		 * Create function tools from JavaScript functions using AgentBuilder
		 * Wraps native functions to make them available to the agent
		 */
		const calculatorTool = new FunctionTool(calculateSum, {
			name: "calculator",
			description: "Calculates the sum of two numbers",
			parameterTypes: {
				a: "number",
				b: "number",
			},
		});

		const weatherTool = new FunctionTool(getWeather, {
			name: "get_weather",
			description: "Gets current weather information for a city",
			isLongRunning: true,
		});

		const userInfoTool = new FunctionTool(getUserInfo, {
			name: "get_user_info",
			description: "Gets information about a user by name",
		});

		/**
		 * Create agent with function tools using AgentBuilder
		 * The agent can now call the wrapped functions
		 */
		const { runner } = await AgentBuilder.create("function_tool_demo")
			.withModel(env.LLM_MODEL || "gemini-2.5-flash")
			.withDescription(
				"An agent that demonstrates function tools using Google Gemini",
			)
			.withInstruction(`You are a helpful assistant that can perform calculations, fetch weather data, and retrieve user information.
Use the calculator tool to solve math problems.
Use the weather tool to get weather information for cities.
Use the user info tool to retrieve information about a user.
Be clear and informative in your responses about the operations you perform.`)
			.withTools(calculatorTool, weatherTool, userInfoTool)
			.withQuickSession()
			.build();

		/**
		 * Run comprehensive function tool demonstrations
		 * Shows various scenarios and tool interactions
		 */
		await runFunctionToolExamples(runner);

		console.log("\n🎉 Function tool example completed!");
	} catch (error) {
		console.error("❌ Error in function tool example:", error);
		process.exit(1);
	}
}

/**
 * Runs demonstration examples of function tool usage
 * @param runner The AgentBuilder runner for executing agent tasks
 */
async function runFunctionToolExamples(runner: EnhancedRunner): Promise<void> {
	/**
	 * Example 1: Calculator Tool Usage
	 * Demonstrates basic mathematical operations
	 */
	console.log("\n--- Example 1: Using the calculator tool ---");
	const calcResult = await runner.ask("What is 42 + 17?");
	console.log("Agent response:", calcResult);

	/**
	 * Example 2: Weather Information
	 * Shows async function tool execution
	 */
	console.log("\n--- Example 2: Using the weather tool ---");
	const weatherResult = await runner.ask(
		"What's the weather like in New York today?",
	);
	console.log("Agent response:", weatherResult);

	/**
	 * Example 3: User Information
	 * Demonstrates context-aware function tools
	 */
	console.log("\n--- Example 3: Using the user info tool ---");
	const userResult = await runner.ask("Get information about user Sarah");
	console.log("Agent response:", userResult);

	/**
	 * Example 4: Complex Calculations
	 * Shows multiple tool calls in sequence
	 */
	console.log("\n--- Example 4: Multiple calculations ---");
	const complexCalcResult = await runner.ask(
		"Calculate 15 + 25, then tell me what that result plus 10 would be",
	);
	console.log("Agent response:", complexCalcResult);

	/**
	 * Example 5: Weather Comparison
	 * Demonstrates multiple calls to the same tool
	 */
	console.log("\n--- Example 5: Weather comparison ---");
	const weatherCompareResult = await runner.ask(
		"Compare the weather between London and Tokyo",
	);
	console.log("Agent response:", weatherCompareResult);

	/**
	 * Example 6: Mixed Tool Usage
	 * Shows coordination between different types of tools
	 */
	console.log("\n--- Example 6: Mixed tool usage ---");
	const mixedResult = await runner.ask(
		"Get info for user John and calculate what his access level plus 5 would be",
	);
	console.log("Agent response:", mixedResult);
}

/**
 * Execute the main function and handle any errors
 */
main().catch((error) => {
	console.error("💥 Fatal error:", error);
	process.exit(1);
});
