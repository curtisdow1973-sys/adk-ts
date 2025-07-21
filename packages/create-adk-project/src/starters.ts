export interface StarterOption {
	value: string;
	label: string;
	hint: string;
	template: string;
	isLocal?: boolean;
}

export const starters: StarterOption[] = [
	{
		value: "basic-agent",
		label: "🤖 Basic Agent",
		hint: "Simple agent starter template",
		template: "apps/starter-templates/basic-agent",
		isLocal: true,
	},
	{
		value: "advanced-agent",
		label: "🚀 Advanced Agent",
		hint: "Advanced agent with tools and memory",
		template: "apps/starter-templates/advanced-agent",
		isLocal: true,
	},
	{
		value: "mcp-server",
		label: "🔌 MCP Server",
		hint: "Model Context Protocol server template",
		template: "apps/starter-templates/mcp-server",
		isLocal: true,
	},
	{
		value: "adk-agent-starter",
		label: "🤖 Legacy ADK Agent Starter",
		hint: "Complete agent development starter template (GitHub)",
		template: "github:IQAIcom/adk-agent-starter",
		isLocal: false,
	},
];
