import { AgentBuilder, McpNearAgent, McpNearIntentSwaps } from "@iqai/adk";

const tools = await McpNearIntentSwaps({
	env: {
		ACCOUNT_ID: "your-account.testnet",
		ACCOUNT_KEY: "ed25519:your-private-key-here",
		NEAR_NETWORK_ID: "testnet",
	},
}).getTools();

console.log(AgentBuilder.create("near agent"));
