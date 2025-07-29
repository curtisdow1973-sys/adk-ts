import { google } from "@ai-sdk/google";
import { env } from "node:process";
import * as path from "node:path";
import {
	AgentBuilder,
	HttpRequestTool,
	FileOperationsTool,
	createTool,
} from "@iqai/adk";
import * as z from "zod";
import dedent from "dedent";

/**
 * 08 - External Integrations
 *
 * Learn how to integrate agents with external systems including AI SDK
 * providers, HTTP APIs, and file systems. This example demonstrates
 * various integration patterns for building connected AI applications.
 *
 * Concepts covered:
 * - AI SDK integration (Google, OpenAI, Anthropic, etc.)
 * - HTTP API integration and web scraping
 * - File system operations and management
 * - External service authentication
 * - Error handling for external dependencies
 * - Rate limiting and retry strategies
 */

// Custom tool for demonstration
const weatherApiTool = createTool({
	name: "weather_api",
	description: "Gets weather data from a mock weather API",
	schema: z.object({
		city: z.string().describe("City name"),
		units: z
			.enum(["metric", "imperial"])
			.default("metric")
			.describe("Temperature units"),
	}),
	fn: async ({ city, units }) => {
		// Simulate API call with realistic data
		const temperature =
			units === "metric"
				? Math.floor(Math.random() * 35) + 5 // 5-40°C
				: Math.floor(Math.random() * 63) + 41; // 41-104°F

		const conditions = [
			"sunny",
			"cloudy",
			"rainy",
			"partly cloudy",
			"overcast",
		][Math.floor(Math.random() * 5)];

		return {
			city,
			temperature,
			units: units === "metric" ? "°C" : "°F",
			conditions,
			humidity: Math.floor(Math.random() * 100),
			windSpeed: Math.floor(Math.random() * 20) + 5,
			timestamp: new Date().toISOString(),
		};
	},
});

async function demonstrateAiSdkIntegration() {
	console.log("📝 Part 1: AI SDK Integration");
	console.log("═══════════════════════════════════\n");

	// Check if Google API key is available
	if (!env.GOOGLE_GENERATIVE_AI_API_KEY) {
		console.log("⚠️  Note: GOOGLE_GENERATIVE_AI_API_KEY not set");
		console.log("Using default model configuration instead\n");
	}

	// Create agent with AI SDK model (if available) or fallback
	const modelConfig = env.GOOGLE_GENERATIVE_AI_API_KEY
		? google("gemini-2.5-flash")
		: env.LLM_MODEL || "gemini-2.5-flash";

	const { runner } = await AgentBuilder.create("ai_sdk_agent")
		.withModel(modelConfig)
		.withDescription("An agent demonstrating AI SDK integration")
		.withInstruction(dedent`
			You are an AI assistant showcasing external model integration.
			You can demonstrate different AI model capabilities and explain
			how different providers might handle various types of requests.
		`)
		.withTools(weatherApiTool)
		.build();

	console.log("🤖 Testing AI SDK integration:");
	const aiSdkTest = await runner.ask(dedent`
		Explain the benefits of using different AI model providers and
		then get the weather for Tokyo to demonstrate tool usage.
	`);
	console.log(`Response: ${aiSdkTest}\n`);

	// Demonstrate model switching capability
	console.log("🔄 Model Configuration:");
	console.log(
		`Current model: ${typeof modelConfig === "string" ? modelConfig : "Google Gemini via AI SDK"}`,
	);
	console.log(
		"AI SDK enables easy switching between providers (OpenAI, Anthropic, Google, etc.)\n",
	);
}

async function demonstrateHttpIntegration() {
	console.log("📝 Part 2: HTTP API Integration");
	console.log("════════════════════════════════════\n");

	const { runner } = await AgentBuilder.create("http_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("An agent that can make HTTP requests to external APIs")
		.withInstruction(dedent`
			You are a web integration specialist that can make HTTP requests to APIs.
			When making requests:
			1. Always check the response status code
			2. Handle errors gracefully
			3. Extract relevant information from responses
			4. Provide clear summaries of the data received
			5. Use appropriate HTTP methods for different operations
		`)
		.withTools(new HttpRequestTool())
		.build();

	console.log("🌐 Testing HTTP GET request:");
	const httpGetTest = await runner.ask(dedent`
		Make a GET request to https://httpbin.org/json to test HTTP functionality.
		Explain what httpbin.org is and show the response data you received.
	`);
	console.log(`Response: ${httpGetTest}\n`);

	console.log("📊 Testing HTTP with query parameters:");
	const httpQueryTest = await runner.ask(dedent`
		Make a GET request to https://httpbin.org/get with query parameters:
		- name: "ADK Framework"
		- version: "1.0"
		- type: "example"

		Show how the API echoes back the parameters.
	`);
	console.log(`Response: ${httpQueryTest}\n`);

	console.log("📝 Testing HTTP POST request:");
	const httpPostTest = await runner.ask(dedent`
		Make a POST request to https://httpbin.org/post with JSON data:
		{
			"message": "Testing ADK HTTP integration",
			"timestamp": current timestamp,
			"framework": "ADK"
		}

		Show the response and explain what happened.
	`);
	console.log(`Response: ${httpPostTest}\n`);
}

async function demonstrateFileSystemIntegration() {
	console.log("📝 Part 3: File System Integration");
	console.log("═══════════════════════════════════\n");

	// Create a temporary directory for safe file operations
	const tempDir = path.join(process.cwd(), "temp-examples");

	const { runner } = await AgentBuilder.create("file_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("An agent that can perform file system operations safely")
		.withInstruction(dedent`
			You are a file system specialist that can manage files and directories.
			You operate within the specified base directory for security.
			When working with files:
			1. Create clear, well-structured content
			2. Use appropriate file names and extensions
			3. Organize files logically in directories
			4. Verify operations by reading back content
			5. Provide clear status updates
		`)
		.withTools(new FileOperationsTool({ basePath: tempDir }))
		.build();

	console.log("📁 Testing directory and file creation:");
	const fileCreateTest = await runner.ask(dedent`
		Create a project structure for a simple web application:
		1. Create directories: src, docs, tests
		2. Create src/index.html with a basic HTML5 template
		3. Create src/styles.css with some basic CSS
		4. Create docs/README.md with project documentation
		5. List the final directory structure
	`);
	console.log(`Response: ${fileCreateTest}\n`);

	console.log("📄 Testing file reading and modification:");
	const fileModifyTest = await runner.ask(dedent`
		Read the README.md file you created, then update it to include:
		- A project description
		- Installation instructions
		- Usage examples
		- A changelog section

		Show the before and after content.
	`);
	console.log(`Response: ${fileModifyTest}\n`);

	console.log("🔍 Testing file search and organization:");
	const fileSearchTest = await runner.ask(dedent`
		List all the files you've created, then:
		1. Create a project manifest file that lists all files with descriptions
		2. Create a backup directory
		3. Copy important files to the backup directory
		4. Show the final project structure
	`);
	console.log(`Response: ${fileSearchTest}\n`);
}

async function demonstrateCompositeIntegration() {
	console.log("📝 Part 4: Composite Integration (HTTP + Files + AI SDK)");
	console.log("═════════════════════════════════════════════════════\n");

	const tempDir = path.join(process.cwd(), "temp-integration");

	// Create a comprehensive integration agent
	const { runner } = await AgentBuilder.create("integration_specialist")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription(
			"A specialist that combines multiple external integrations",
		)
		.withInstruction(dedent`
			You are an integration specialist who can:
			1. Fetch data from web APIs
			2. Process and analyze the data
			3. Save results to files
			4. Create comprehensive reports

			Always follow this workflow:
			- Fetch data from external sources
			- Process and validate the data
			- Generate insights and summaries
			- Save results in appropriate file formats
			- Provide clear documentation of the process
		`)
		.withTools(
			new HttpRequestTool(),
			new FileOperationsTool({ basePath: tempDir }),
			weatherApiTool,
		)
		.build();

	console.log("🔄 Testing composite integration workflow:");
	const compositeTest = await runner.ask(dedent`
		Create a comprehensive weather report system:

		1. Get weather data for 3 different cities: New York, London, Tokyo
		2. Fetch additional data from httpbin.org/uuid for a unique report ID
		3. Create a detailed weather report file that includes:
		   - Report metadata (ID, timestamp, etc.)
		   - Weather data for each city in a formatted table
		   - Analysis of temperature differences
		   - Recommendations based on conditions
		4. Save the report as a JSON file and a markdown file
		5. Create a summary file with just the key findings

		Show your progress at each step.
	`);
	console.log(`Response: ${compositeTest}\n`);
}

async function demonstrateIntegrationPatterns() {
	console.log("📝 Part 5: Integration Patterns and Best Practices");
	console.log("═══════════════════════════════════════════════\n");

	console.log(dedent`
		🔗 External Integration Patterns and Best Practices:

		**AI SDK Integration:**

		🤖 **Model Providers**
		   - OpenAI: GPT-4, GPT-3.5-turbo
		   - Anthropic: Claude 3 family
		   - Google: Gemini models
		   - Cohere: Command and Embed models
		   - Local: Ollama, llamafile

		✅ **Best Practices**
		   - Use environment variables for API keys
		   - Implement fallback models
		   - Monitor token usage and costs
		   - Handle rate limits gracefully

		**HTTP API Integration:**

		🌐 **Common Patterns**
		   - REST APIs with JSON
		   - GraphQL endpoints
		   - Webhook handling
		   - Real-time data feeds

		🛡️ **Security & Reliability**
		   - Validate SSL certificates
		   - Implement timeout handling
		   - Use retry strategies with exponential backoff
		   - Rate limiting to respect API limits
		   - Secure credential storage

		**File System Integration:**

		📁 **Safe Operations**
		   - Use base path restrictions
		   - Validate file paths and names
		   - Handle permissions properly
		   - Implement cleanup strategies

		💾 **File Management**
		   - Atomic file operations
		   - Backup critical files
		   - Use temporary directories
		   - Monitor disk space

		**Error Handling:**

		⚠️ **Common Issues**
		   - Network timeouts
		   - API rate limits
		   - Authentication failures
		   - Invalid file paths
		   - Permission denied errors

		🔧 **Mitigation Strategies**
		   - Graceful degradation
		   - Circuit breaker patterns
		   - Cached fallback data
		   - User-friendly error messages
		   - Comprehensive logging

		**Performance Optimization:**

		⚡ **Strategies**
		   - Connection pooling
		   - Response caching
		   - Parallel requests (when appropriate)
		   - Streaming for large files
		   - Lazy loading of resources

		📊 **Monitoring**
		   - Response time tracking
		   - Error rate monitoring
		   - Resource usage metrics
		   - API quota monitoring

		**Architecture Patterns:**

		🏗️ **Design Principles**
		   - Separation of concerns
		   - Dependency injection
		   - Interface abstraction
		   - Configuration management
		   - Environment-specific settings

		🔄 **Integration Types**
		   - Real-time: WebSockets, Server-Sent Events
		   - Batch: Scheduled API calls, bulk operations
		   - Event-driven: Webhooks, message queues
		   - Hybrid: Combination of approaches

		**Use Case Examples:**

		✨ **Perfect For**
		   - Data aggregation from multiple sources
		   - Content generation with external validation
		   - File processing workflows
		   - API orchestration and composition
		   - Real-time data analysis

		📈 **Business Applications**
		   - Customer data integration
		   - Market data analysis
		   - Document processing pipelines
		   - Social media monitoring
		   - IoT data collection
	`);
}

async function main() {
	console.log("🔗 External integrations:");

	await demonstrateAiSdkIntegration();
	await demonstrateHttpIntegration();
	await demonstrateFileSystemIntegration();
	await demonstrateCompositeIntegration();
	await demonstrateIntegrationPatterns();
}

main().catch(console.error);
