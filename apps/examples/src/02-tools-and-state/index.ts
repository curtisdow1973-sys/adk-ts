import { env } from "node:process";
import { AgentBuilder, InMemorySessionService, createTool } from "@iqai/adk";
import * as z from "zod";
import dedent from "dedent";

/**
 * 02 - Tools and State Management
 *
 * Learn how to create custom tools and manage state in your agents.
 * This example progresses from basic tools to stateful tools that remember
 * information across interactions.
 *
 * Concepts covered:
 * - Creating custom tools with createTool
 * - Tool schemas and validation
 * - State management with context.state
 * - Session services for persistence
 * - Tool composition and reuse
 */

// Basic tools without state
const calculatorTool = createTool({
	name: "calculator",
	description: "Performs basic math operations",
	schema: z.object({
		operation: z.enum(["add", "subtract", "multiply", "divide"]),
		a: z.number().describe("First number"),
		b: z.number().describe("Second number"),
	}),
	fn: ({ operation, a, b }) => {
		let result: number;
		switch (operation) {
			case "add":
				result = a + b;
				break;
			case "subtract":
				result = a - b;
				break;
			case "multiply":
				result = a * b;
				break;
			case "divide":
				result = b !== 0 ? a / b : Number.NaN;
				break;
		}
		return { operation, a, b, result };
	},
});

const weatherTool = createTool({
	name: "get_weather",
	description: "Gets mock weather information for a city",
	schema: z.object({
		city: z.string().describe("City name"),
	}),
	fn: ({ city }) => ({
		city,
		temperature: Math.floor(Math.random() * 35) + 5, // Random temp 5-40°C
		conditions: ["sunny", "cloudy", "rainy", "snowy"][
			Math.floor(Math.random() * 4)
		],
		humidity: Math.floor(Math.random() * 100),
	}),
});

// Stateful tools that remember information
const addNotesTool = createTool({
	name: "add_note",
	description: "Add a note to the user's notebook",
	schema: z.object({
		note: z.string().describe("The note to add"),
		category: z.string().optional().describe("Optional category for the note"),
	}),
	fn: ({ note, category }, context) => {
		const notes = context.state.get("notes", []);
		const newNote = {
			id: notes.length + 1,
			content: note,
			category: category || "general",
			timestamp: new Date().toISOString(),
		};
		notes.push(newNote);
		context.state.set("notes", notes);

		return {
			success: true,
			note: newNote,
			totalNotes: notes.length,
			message: `Added note #${newNote.id}: "${note}"`,
		};
	},
});

const viewNotesTool = createTool({
	name: "view_notes",
	description: "View all notes or notes in a specific category",
	schema: z.object({
		category: z.string().optional().describe("Filter by category"),
	}),
	fn: ({ category }, context) => {
		const allNotes = context.state.get("notes", []);
		const filteredNotes = category
			? allNotes.filter((note) => note.category === category)
			: allNotes;

		return {
			notes: filteredNotes,
			totalNotes: allNotes.length,
			filteredCount: filteredNotes.length,
			category: category || "all",
			message: category
				? `Found ${filteredNotes.length} notes in '${category}' category`
				: `Total notes: ${allNotes.length}`,
		};
	},
});

const counterTool = createTool({
	name: "increment_counter",
	description: "Increment a named counter",
	schema: z.object({
		counterName: z.string().describe("Name of the counter"),
		amount: z.number().default(1).describe("Amount to increment by"),
	}),
	fn: ({ counterName, amount }, context) => {
		const counters = context.state.get("counters", {});
		const currentValue = counters[counterName] || 0;
		const newValue = currentValue + amount;
		counters[counterName] = newValue;
		context.state.set("counters", counters);

		return {
			counterName,
			previousValue: currentValue,
			newValue,
			increment: amount,
			allCounters: counters,
		};
	},
});

async function demonstrateBasicTools() {
	console.log("📝 Part 1: Basic Tools (No State)");
	console.log("════════════════════════════════\n");

	const { runner } = await AgentBuilder.create("basic_tools_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("An agent with basic calculation and weather tools")
		.withInstruction(dedent`
			You have access to calculator and weather tools.
			When users ask math questions, use the calculator tool.
			When users ask about weather, use the weather tool.
			Be helpful and show your work clearly.
		`)
		.withTools(calculatorTool, weatherTool)
		.build();

	// Test basic tools
	console.log("🧮 Testing Calculator Tool:");
	const mathResult = await runner.ask("What is 15 multiplied by 8?");
	console.log(`Response: ${mathResult}\n`);

	console.log("🌤️ Testing Weather Tool:");
	const weatherResult = await runner.ask("What's the weather in Tokyo?");
	console.log(`Response: ${weatherResult}\n`);
}

async function demonstrateStatefulTools() {
	console.log("📝 Part 2: Stateful Tools (With Memory)");
	console.log("═══════════════════════════════════════\n");

	const sessionService = new InMemorySessionService();
	const initialState = {
		notes: [],
		counters: { visits: 0 },
	};

	const { runner, session } = await AgentBuilder.create("stateful_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("An agent that can remember notes and track counters")
		.withInstruction(dedent`
			You are a helpful assistant with memory capabilities.
			You can:
			1. Add and view notes for the user
			2. Track counters for various activities
			
			When users add notes, acknowledge them and suggest categories if helpful.
			When viewing notes, organize them nicely and provide summaries.
			Use counters to track interesting statistics about user interactions.
		`)
		.withTools(addNotesTool, viewNotesTool, counterTool)
		.withSessionService(sessionService, { state: initialState })
		.build();

	// Test stateful tools
	console.log("📋 Testing Note Management:");
	const note1 = await runner.ask("Add a note: 'Learn about ADK tools'");
	console.log(`Response: ${note1}\n`);

	const note2 = await runner.ask(
		"Add a note about buying groceries, category: personal",
	);
	console.log(`Response: ${note2}\n`);

	console.log("📊 Testing Counter Tool:");
	const counter1 = await runner.ask(
		"Increment the 'examples_completed' counter by 1",
	);
	console.log(`Response: ${counter1}\n`);

	console.log("👀 Testing State Persistence:");
	const viewNotes = await runner.ask("Show me all my notes");
	console.log(`Response: ${viewNotes}\n`);

	// Show current state
	console.log("💾 Current Session State:");
	console.log(JSON.stringify(session.state, null, 2));
}

async function demonstrateToolComposition() {
	console.log("\n📝 Part 3: Tool Composition");
	console.log("═══════════════════════════\n");

	const sessionService = new InMemorySessionService();

	const { runner } = await AgentBuilder.create("multi_tool_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("An agent with multiple tool types working together")
		.withInstruction(dedent`
			You are a productivity assistant with various tools:
			- Calculator for math
			- Weather for location info
			- Notes for remembering things
			- Counters for tracking activities
			
			Use tools together creatively. For example:
			- Calculate costs and save as notes
			- Track weather checks with counters
			- Create productivity workflows
		`)
		.withTools(
			calculatorTool,
			weatherTool,
			addNotesTool,
			viewNotesTool,
			counterTool,
		)
		.withSessionService(sessionService, { state: { notes: [], counters: {} } })
		.build();

	console.log("🔧 Testing Tool Composition:");
	const composed = await runner.ask(dedent`
		Help me plan a trip to Paris:
		1. Get the weather in Paris
		2. Calculate the budget if I spend $200 per day for 5 days
		3. Save this information as a note
		4. Track this as a 'trip_planned' counter
	`);
	console.log(`Response: ${composed}\n`);
}

async function main() {
	console.log("🛠️ 02 - Tools and State Management");
	console.log("═══════════════════════════════════\n");

	try {
		await demonstrateBasicTools();
		await demonstrateStatefulTools();
		await demonstrateToolComposition();

		console.log("✅ Tools and State examples completed!");
		console.log("\n🎓 Key Takeaways:");
		console.log("- Tools extend agent capabilities");
		console.log("- State management enables memory across interactions");
		console.log("- Tools can be composed for complex workflows");
		console.log("- Session services provide persistence");

		console.log("\n🎓 Next Steps:");
		console.log(
			"- Run example 03-interactive-app to see a complete application",
		);
		console.log("- Try creating your own custom tools");
		console.log("- Experiment with different state management patterns");
	} catch (error) {
		console.error("❌ Error in tools and state example:", error);
		process.exit(1);
	}
}

main().catch(console.error);
