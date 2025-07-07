import { env } from "node:process";
import { AiSdkLlm, LlmAgent, InMemoryRunner } from "@iqai/adk";

async function testFixed() {
	console.log("🧪 Testing Fixed AI SDK Integration...");

	// Create model with explicit config
	const model = new AiSdkLlm(env.LLM_MODEL);

	console.log(`Model: ${model.model}`);

	// Create agent with minimal tools to avoid tool-related issues
	const agent = new LlmAgent({
		name: "test_agent",
		model: model,
		description: "Test agent",
		instruction:
			"You are a helpful assistant. Always provide a short, direct response.",
		// No tools initially to isolate the issue
		tools: [],
	});

	const runner = new InMemoryRunner(agent, { appName: "FixedTest" });
	const session = await runner.sessionService.createSession(
		"FixedTest",
		"test-user",
	);

	console.log(`Session: ${session.id}`);

	// Test with a very simple message
	const message = { parts: [{ text: "Just say 'Hello from Gemini!'" }] };
	console.log(`\n👤 User: ${message.parts[0].text}`);
	console.log("🤖 Assistant:");

	let responseCount = 0;
	let hasResponse = false;
	let finalText = "";

	try {
		for await (const event of runner.runAsync({
			userId: "test-user",
			sessionId: session.id,
			newMessage: message,
		})) {
			responseCount++;
			console.log(`Event ${responseCount}:`, {
				author: event.author,
				hasContent: !!event.content,
				errorCode: event.errorCode,
				partial: event.partial,
			});

			// Only process agent responses
			if (event.author === agent.name) {
				if (event.errorCode || event.errorMessage) {
					console.log("❌ Error:", event.errorCode, event.errorMessage);
				} else if (event.content?.parts) {
					hasResponse = true;
					const text = event.content.parts
						.map((p) => p.text)
						.filter(Boolean)
						.join("");

					if (text) {
						if (event.partial) {
							process.stdout.write(text);
							finalText += text;
						} else {
							if (!finalText) {
								console.log(text);
							} else {
								console.log(); // New line after streaming
							}
							finalText += text;
						}
					}
				}
			}
		}

		console.log("\nResults:");
		console.log(`- Total events: ${responseCount}`);
		console.log(`- Got response: ${hasResponse}`);
		console.log(`- Final text: "${finalText}"`);

		if (hasResponse) {
			console.log("✅ AI SDK integration working!");
		} else {
			console.log("❌ No response received");
		}
	} catch (error) {
		console.error("❌ Test failed:", error.message);

		// Try to isolate the issue further
		console.log("\n🔍 Investigating the error...");
		if (error.message.includes("entries")) {
			console.log(
				"The 'entries' error suggests AutoFlow expects a Map but got undefined",
			);
			console.log("This might be in the LlmResponse.toolsDict property");
		}
	}
}

testFixed().catch(console.error);
