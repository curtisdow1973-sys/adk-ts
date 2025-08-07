import * as p from "@clack/prompts";
import chalk from "chalk";
import { type ServeOptions, serveCommand } from "./serve.js";

interface Agent {
	relativePath: string;
	name: string;
	absolutePath: string;
	isRunning: boolean;
}

class AgentChatClient {
	private apiUrl: string;
	private selectedAgent: Agent | null = null;

	constructor(apiUrl: string) {
		this.apiUrl = apiUrl;
	}

	async connect(): Promise<void> {
		// Test connection
		try {
			const response = await fetch(`${this.apiUrl}/health`);
			if (!response.ok) {
				throw new Error("Connection failed");
			}
		} catch (error) {
			throw new Error("❌ Connection failed");
		}
	}

	async fetchAgents(): Promise<Agent[]> {
		try {
			const response = await fetch(`${this.apiUrl}/api/agents`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			const data = await response.json();

			// Handle different response structures
			if (Array.isArray(data)) {
				return data;
			}
			if (data && Array.isArray(data.agents)) {
				return data.agents;
			}
			throw new Error(`Unexpected response format: ${JSON.stringify(data)}`);
		} catch (error) {
			throw new Error(
				`Failed to fetch agents: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async selectAgent(): Promise<Agent> {
		const agents = await this.fetchAgents();

		if (agents.length === 0) {
			throw new Error("No agents found in the current directory");
		}

		if (agents.length === 1) {
			return agents[0];
		}

		const selectedAgent = await p.select({
			message: "Choose an agent to chat with:",
			options: agents.map((agent) => ({
				label: `${agent.name} ${agent.isRunning ? chalk.green("(running)") : chalk.gray("(stopped)")}`,
				value: agent,
				hint: agent.relativePath,
			})),
		});

		if (p.isCancel(selectedAgent)) {
			p.cancel("Operation cancelled");
			process.exit(0);
		}

		return selectedAgent;
	}

	async startAgent(agent: Agent): Promise<void> {
		if (agent.isRunning) {
			return;
		}

		try {
			const response = await fetch(
				`${this.apiUrl}/api/agents/${encodeURIComponent(agent.relativePath)}/start`,
				{
					method: "POST",
				},
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Failed to start agent: ${errorText}`);
			}
		} catch (error) {
			throw new Error(
				`Failed to start agent: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async sendMessage(message: string): Promise<void> {
		if (!this.selectedAgent) {
			throw new Error("No agent selected");
		}

		try {
			const response = await fetch(
				`${this.apiUrl}/api/agents/${encodeURIComponent(this.selectedAgent.relativePath)}/message`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ message }),
				},
			);

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Failed to send message: ${errorText}`);
			}

			const result = await response.json();

			// Display user message
			console.log(chalk.blue(`You: ${message}`));

			// Display agent response
			if (result.response) {
				console.log(chalk.green(`🤖: ${result.response}`));
			}
		} catch (error) {
			console.error(chalk.red("❌ Error sending message"));
		}
	}

	async startChat(): Promise<void> {
		if (!this.selectedAgent) {
			throw new Error("Agent not selected");
		}

		console.log(chalk.green(`💬 Chat with ${this.selectedAgent.name}`));
		console.log(chalk.gray("Press Ctrl+C to exit"));
		console.log();

		while (true) {
			try {
				const message = await p.text({
					message: "Message:",
					placeholder: "Type your message here...",
				});

				if (p.isCancel(message)) {
					break;
				}

				if (message.trim()) {
					await this.sendMessage(message.trim());
				}
			} catch (error) {
				console.error(chalk.red("Error in chat:"), error);
				break;
			}
		}
	}

	disconnect(): void {
		// No cleanup needed for HTTP-only client
	}

	setSelectedAgent(agent: Agent): void {
		this.selectedAgent = agent;
	}
}

export async function runAgent(
	agentPath?: string,
	options: {
		watch?: boolean;
		port?: string;
		server?: boolean;
		host?: string;
	} = {},
) {
	// If server option is enabled, start ADK server only
	if (options.server) {
		const apiPort = 3001;
		const host = options.host || "localhost";

		console.log(chalk.blue("🚀 Starting ADK Server..."));

		const serveOptions: ServeOptions = {
			port: apiPort,
			dir: process.cwd(),
			host,
			quiet: false,
		};

		try {
			const server = await serveCommand(serveOptions);

			console.log(chalk.cyan("Press Ctrl+C to stop the server"));

			// Handle cleanup
			process.on("SIGINT", async () => {
				console.log(chalk.yellow("\n🛑 Stopping server..."));
				await server.stop();
				process.exit(0);
			});

			// Keep the process running
			return new Promise(() => {});
		} catch (error) {
			console.error(chalk.red("❌ Failed to start server"));
			process.exit(1);
		}
	}

	// Interactive chat mode (default)
	const apiUrl = `http://${options.host || "localhost"}:3001`;

	p.intro("🤖 ADK Agent Chat");

	try {
		// Check if server is running
		const healthResponse = await fetch(`${apiUrl}/health`).catch(() => null);

		if (!healthResponse || !healthResponse.ok) {
			console.log(chalk.gray("Starting server..."));

			// Start server in the background
			const serveOptions: ServeOptions = {
				port: 3001,
				dir: process.cwd(),
				host: options.host || "localhost",
				quiet: true,
			};

			await serveCommand(serveOptions);

			// Wait a moment for server to be ready
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		const client = new AgentChatClient(apiUrl);

		// Connect to server
		await client.connect();

		// Select agent
		const selectedAgent = await client.selectAgent();
		client.setSelectedAgent(selectedAgent);

		// Start agent if not running
		await client.startAgent(selectedAgent);

		// Start chat
		await client.startChat();

		client.disconnect();
		p.outro("Chat ended");
	} catch (error) {
		p.cancel(
			`Error: ${error instanceof Error ? error.message : String(error)}`,
		);
		process.exit(1);
	}
}
