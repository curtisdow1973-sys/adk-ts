import { AgentBuilder, createFunctionTool } from "@iqai/adk";

const main = async () => {
	const firstPasswordAgent = await AgentBuilder.create("first_password")
		.withDescription("Agent that has first password")
		.withModel("gemini-2.5-flash")
		.withTools(
			createFunctionTool(() => "eamt2CXOlJ3F0Dq", {
				name: "getFirstPassword",
				description: "Returns the first password for the user",
			}),
		)
		.build();

	const secondPasswordAgent = await AgentBuilder.create("second_password")
		.withDescription("Agent that has second password")
		.withModel("gemini-2.5-flash")
		.withTools(
			createFunctionTool(() => "p84ylYk_9G6xlE8", {
				name: "getSecondPassword",
				description: "Returns the second password for the user",
			}),
		)
		.build();

	const thirdPasswordAgent = await AgentBuilder.create("third_password")
		.withDescription("Agent that has third password")
		.withModel("gemini-2.5-flash")
		.withTools(
			createFunctionTool(() => "UnKfArgJ2gF0TtN", {
				name: "getThirdPassword",
				description: "Returns the third password for the user",
			}),
		)
		.build();

	const fullPasswordAgent = await AgentBuilder.create("full_password")
		.withDescription("Agent that combines passwords from other agents")
		.withModel("gemini-2.5-flash")
		.withTools(
			createFunctionTool(
				async (
					firstPassword: string,
					secondPassword: string,
					thirdPassword: string,
				) => {
					return `${firstPassword}-${secondPassword}-${thirdPassword}`;
				},
				{
					name: "getFullPassword",
					description: "Combines passwords from other agents",
					isLongRunning: true,
					shouldRetryOnFailure: true,
					maxRetryAttempts: 3,
				},
			),
		)
		.build();

	const response = await AgentBuilder.create("langgraph_agent")
		.withDescription("Agent that uses LangGraph to combine passwords")
		.withInstruction(
			"You will be asked to provide passwords from different agents. Combine them to form the full password.",
		)
		.asLangGraph(
			[
				{
					name: "getFirstPassword",
					condition: () => true,
					agent: firstPasswordAgent.agent,
					targets: ["getSecondPassword"],
				},
				{
					name: "getSecondPassword",
					condition: () => true,
					agent: secondPasswordAgent.agent,
					targets: ["getThirdPassword"],
				},
				{
					name: "getThirdPassword",
					condition: () => true,
					agent: thirdPasswordAgent.agent,
					targets: ["getFullPassword"],
				},
				{
					name: "getFullPassword",
					condition: () => true,
					agent: fullPasswordAgent.agent,
				},
			],
			"getFirstPassword",
		)
		.ask("What is the full password?");

	console.log("Full password:", response);
};

main()
	.then(() => {
		console.log("Agent started successfully.");
	})
	.catch((error) => {
		console.error("Error starting agent:", error);
	});
