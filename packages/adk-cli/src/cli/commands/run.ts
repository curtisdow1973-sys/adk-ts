import * as p from "@clack/prompts";
import chalk from "chalk";
import { io, type Socket } from "socket.io-client";
import { serveCommand, type ServeOptions } from "./serve.js";

interface Agent {
	relativePath: string;
	name: string;
	absolutePath: string;
	isRunning: boolean;
}

interface AgentMessage {
	id: number;
	type: "system" | "stdout" | "stderr" | "error" | "user";
	content: string;
	agentId: string;
	timestamp: string;
}

class AgentChatClient {
	private socket: Socket | null = null;
	private apiUrl: string;
	private selectedAgent: Agent | null = null;
	private messages: AgentMessage[] = [];

	constructor(apiUrl: string) {
		this.apiUrl = apiUrl;
	}

	async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = io(this.apiUrl, {
				transports: ["websocket", "polling"],
				autoConnect: true,
			});

			this.socket.on("connect", () => {
				console.log(chalk.green("✅ Connected to ADK server"));
				resolve();
			});

			this.socket.on("connect_error", (error) => {
				console.error(chalk.red("❌ Failed to connect to ADK server:"), error.message);
				reject(error);
			});

			this.socket.on("agentMessage", (message: AgentMessage) => {
				if (this.selectedAgent && message.agentId === this.selectedAgent.relativePath) {
					this.messages.push(message);
					this.displayMessage(message);
				}
			});

			this.socket.on("disconnect", () => {
				console.log(chalk.yellow("⚠️ Disconnected from ADK server"));
			});
		});
	}

	async fetchAgents(): Promise<Agent[]> {
		try {
			const response = await fetch(`${this.apiUrl}/api/agents`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			return await response.json();
		} catch (error) {
			throw new Error(`Failed to fetch agents: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async selectAgent(): Promise<Agent> {
		const agents = await this.fetchAgents();

		if (agents.length === 0) {
			throw new Error("No agents found in the current directory");
		}

		if (agents.length === 1) {
			console.log(chalk.blue(`🤖 Found one agent: ${chalk.cyan(agents[0].name)}`));
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
			console.log(chalk.blue(`🤖 Agent ${agent.name} is already running`));
			return;
		}

		console.log(chalk.blue(`🚀 Starting agent: ${agent.name}`));

		try {
			const response = await fetch(`${this.apiUrl}/api/agents/${encodeURIComponent(agent.relativePath)}/start`, {
				method: "POST",
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Failed to start agent: ${errorText}`);
			}

			console.log(chalk.green(`✅ Agent ${agent.name} started successfully`));
		} catch (error) {
			throw new Error(`Failed to start agent: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async sendMessage(message: string): Promise<void> {
		if (!this.selectedAgent) {
			throw new Error("No agent selected");
		}

		try {
			const response = await fetch(`${this.apiUrl}/api/agents/${encodeURIComponent(this.selectedAgent.relativePath)}/message`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ message }),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Failed to send message: ${errorText}`);
			}

			// Display user message immediately
			const userMessage: AgentMessage = {
				id: Date.now(),
				type: "user",
				content: message,
				agentId: this.selectedAgent.relativePath,
				timestamp: new Date().toISOString(),
			};
			this.messages.push(userMessage);
			this.displayMessage(userMessage);

		} catch (error) {
			console.error(chalk.red("❌ Error sending message:"), error instanceof Error ? error.message : String(error));
		}
	}

	private displayMessage(message: AgentMessage): void {
		const timestamp = new Date(message.timestamp).toLocaleTimeString();

		switch (message.type) {
			case "user":
				console.log(chalk.blue(`[${timestamp}] You: ${message.content}`));
				break;
			case "stdout":
			case "system":
				console.log(chalk.green(`[${timestamp}] 🤖: ${message.content}`));
				break;
			case "stderr":
			case "error":
				console.log(chalk.red(`[${timestamp}] ❌: ${message.content}`));
				break;
		}
	}

	async startChat(): Promise<void> {
		if (!this.selectedAgent || !this.socket) {
			throw new Error("Agent not selected or not connected");
		}

		// Join the agent room for real-time messages
		this.socket.emit("joinAgent", this.selectedAgent.relativePath);

		console.log();
		console.log(chalk.green(`� Chat started with ${this.selectedAgent.name}`));
		console.log(chalk.gray("   Type your messages below. Press Ctrl+C to exit."));
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
		if (this.socket) {
			if (this.selectedAgent) {
				this.socket.emit("leaveAgent", this.selectedAgent.relativePath);
			}
			this.socket.disconnect();
		}
	}

	setSelectedAgent(agent: Agent): void {
		this.selectedAgent = agent;
	}
}

export async function runAgent(
	agentPath?: string,
	options: { watch?: boolean; port?: string; server?: boolean; host?: string } = {},
) {
	// If server option is enabled, start ADK server only
	if (options.server) {
		const apiPort = 3001;
		const host = options.host || "localhost";

		console.log(chalk.blue("🚀 Starting ADK Server for agent management..."));
		console.log(chalk.gray("   This enables web interface and API management of agents"));

		const serveOptions: ServeOptions = {
			port: apiPort,
			dir: process.cwd(),
			host,
			quiet: false,
		};

		try {
			const server = await serveCommand(serveOptions);

			console.log();
			console.log(chalk.green("✅ ADK Server started successfully!"));
			console.log(chalk.cyan(`🌐 Server running at http://${host}:${apiPort}`));
			console.log(chalk.cyan("🔌 WebSocket server available for real-time communication"));
			console.log();
			console.log(chalk.yellow("💡 Available commands:"));
			console.log(chalk.gray("   • Run 'adk run' in another terminal to chat with agents"));
			console.log(chalk.gray("   • Run 'adk web' to open web interface"));
			console.log();
			console.log(chalk.yellow("Press Ctrl+C to stop the server"));

			// Handle cleanup
			process.on("SIGINT", async () => {
				console.log(chalk.yellow("\n🛑 Shutting down ADK server..."));
				await server.stop();
				process.exit(0);
			});

			// Keep the process running
			return new Promise(() => {});
		} catch (error) {
			console.error(chalk.red("❌ Failed to start ADK server:"), error);
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
			console.log(chalk.yellow("⚠️ ADK server is not running"));
			console.log(chalk.gray("Starting ADK server automatically..."));

			// Start server in the background
			const serveOptions: ServeOptions = {
				port: 3001,
				dir: process.cwd(),
				host: options.host || "localhost",
				quiet: true,
			};

			await serveCommand(serveOptions);
			console.log(chalk.green("✅ ADK server started"));

			// Wait a moment for server to be ready
			await new Promise(resolve => setTimeout(resolve, 1000));
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
		p.outro("� Chat ended. Goodbye!");

	} catch (error) {
		p.cancel(`Error: ${error instanceof Error ? error.message : String(error)}`);
		process.exit(1);
	}
}
