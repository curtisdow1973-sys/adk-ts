import { Client, Events, GatewayIntentBits } from "discord.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const discordClient = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.DirectMessages,
	],
});

const server = new Server(
	{ name: "discord-sampling-server", version: "1.0.0" },
	{ capabilities: { sampling: {}, logging: {} } },
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);

	discordClient.once(Events.ClientReady, (client) => {
		console.log(`Discord bot ready as ${client.user.tag}`);
	});

	discordClient.on(Events.MessageCreate, async (message) => {
		if (message.author.bot) return;
		const template = `
      MESSAGE FROM USER:
      user_id: ${message.author.id}
      user_name: ${message.author.username}
      user_display_name: ${message.author.displayName}
      message: ${message.content}
    `;
		await message.channel.sendTyping();
		// Send sampling request to MCP client
		const result = await server.request(
			{
				method: "sampling/createMessage",
				params: {
					messages: [
						{
							role: "user",
							content: { type: "text", text: template },
						},
					],
					maxTokens: 200,
				},
			},
			z.any(),
		);

		if (result?.content?.text) {
			await message.channel.send(result.content.text);
		}
	});

	await discordClient.login(process.env.DISCORD_TOKEN);
}

main().catch(console.error);
