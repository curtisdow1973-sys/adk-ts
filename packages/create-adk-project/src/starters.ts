export interface StarterOption {
	value: string;
	label: string;
	hint: string;
	template: string;
	isLocal?: boolean;
}

export const starters: StarterOption[] = [
	{
		value: "simple-agent",
		label: "🤖 Simple Agent",
		hint: "Basic agent starter template",
		template: "apps/starter-templates/simple-agent",
		isLocal: true,
	},
	{
		value: "hono-server",
		label: "🌐 Hono Server",
		hint: "Web server with AI agent using Hono framework",
		template: "apps/starter-templates/hono-server",
		isLocal: true,
	},
	{
		value: "telegram-bot",
		label: "📨 Telegram Bot",
		hint: "AI-powered Telegram bot template",
		template: "apps/starter-templates/telegram-bot",
		isLocal: true,
	},
	{
		value: "discord-bot",
		label: "💬 Discord Bot",
		hint: "AI-powered Discord bot template",
		template: "apps/starter-templates/discord-bot",
		isLocal: true,
	},
	{
		value: "mcp-starter",
		label: "🔌 MCP Server",
		hint: "Model Context Protocol server template",
		template: "apps/starter-templates/mcp-starter",
		isLocal: true,
	}
];
