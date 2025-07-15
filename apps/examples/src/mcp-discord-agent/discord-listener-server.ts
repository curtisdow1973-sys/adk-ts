#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client, Events, GatewayIntentBits, type Message } from "discord.js";

const server = new Server(
	{
		name: "discord-message-listener",
		version: "1.0.0",
	},
	{
		capabilities: {
			sampling: {},
			logging: {},
		},
	},
);

let discordClient: Client | null = null;

// Initialize Discord client
async function initializeDiscord(token: string) {
	discordClient = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent,
			GatewayIntentBits.DirectMessages,
		],
	});

	discordClient.once(Events.ClientReady, (client) => {
		console.error(`Discord listener ready! Logged in as ${client.user.tag}`);
	});

	// Listen for messages and send as notifications
	discordClient.on(Events.MessageCreate, async (message: Message) => {
		if (message.author.bot) return;

		const messageEvent = {
			type: "discord_message",
			data: {
				id: message.id,
				content: message.content,
				author: {
					id: message.author.id,
					username: message.author.username,
					displayName: message.author.displayName,
				},
				channel: {
					id: message.channelId,
					name: message.channel?.type === 0 ? message.channel.name : "DM",
					type: message.channel?.type,
				},
				guild: message.guild
					? {
							id: message.guild.id,
							name: message.guild.name,
						}
					: null,
				timestamp: message.createdTimestamp,
				url: message.url,
			},
		};

		// Send notification to MCP client
		await server.notification({
			method: "notifications/message",
			params: messageEvent,
		});
	});

	await discordClient.login(token);
}

// Get Discord token from environment or command line
const discordToken = process.env.DISCORD_TOKEN || process.argv[2];

if (!discordToken) {
	console.error(
		"Discord token required. Set DISCORD_TOKEN env var or pass as argument.",
	);
	process.exit(1);
}

// Start the server
async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);

	// Initialize Discord after MCP connection
	await initializeDiscord(discordToken);

	console.error("Discord message listener MCP server started");
}

main().catch((error) => {
	console.error("Server error:", error);
	process.exit(1);
});
