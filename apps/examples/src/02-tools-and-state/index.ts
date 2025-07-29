import { env } from "node:process";
import { AgentBuilder, InMemorySessionService, createTool } from "@iqai/adk";
import dedent from "dedent";
import * as z from "zod";

/**
 * 02 - Tools and State Management
 *
 * Learn how to create custom tools and manage state in your agents.
 * This example demonstrates stateful tools that remember information
 * across interactions.
 *
 * Concepts covered:
 * - Creating custom tools with createTool
 * - Tool schemas and validation
 * - State management with context.state
 * - Session services for persistence
 * - Tool composition and reuse
 */

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

async function demonstrateToolsAndState() {
	console.log("🛠️ Tools and state:");
	const sessionService = new InMemorySessionService();
	const initialState = {
		notes: [],
		counters: { visits: 0 },
	};

	const { runner } = await AgentBuilder.create("tools_and_state_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("An agent with stateful tools for notes and counters")
		.withInstruction(dedent`
			You are a productivity assistant with stateful tools:
			- Notes for remembering things (add, view, categorize)
			- Counters for tracking activities

			Help users organize their thoughts and track their progress.
			Maintain state across interactions and suggest useful workflows.
		`)
		.withTools(addNotesTool, viewNotesTool, counterTool)
		.withSessionService(sessionService, { state: initialState })
		.build();

	// Test stateful tools
	const note1 = await runner.ask("Add a note: 'Learn about ADK tools'");
	console.log(note1);

	const note2 = await runner.ask(
		"Add a note about buying groceries, category: personal",
	);
	console.log(note2);

	const counter1 = await runner.ask(
		"Increment the 'examples_completed' counter by 1",
	);
	console.log(counter1);

	const viewNotes = await runner.ask("Show me all my notes");
	console.log(viewNotes);

	// Test tool composition
	const composed = await runner.ask(dedent`
		I want to track my learning progress:
		1. Add a note about completing the tools example
		2. Increment a 'lessons_completed' counter
		3. Show me all my notes to see my progress
	`);
	console.log(composed);
}

async function main() {
	await demonstrateToolsAndState();
}

main().catch(console.error);
