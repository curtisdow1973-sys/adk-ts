import * as p from "@clack/prompts";
import { log, spinner } from "@clack/prompts";
import chalk from "chalk";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { type ServeOptions, serveCommand } from "./serve.js";

// Configure marked for terminal output
marked.use(markedTerminal() as any);

// Render markdown to terminal-formatted text
async function renderMarkdown(text: string): Promise<string> {
	try {
		const result = await marked(text);
		return typeof result === "string" ? result : text;
	} catch (error) {
		// Fallback to plain text if markdown parsing fails
		return text;
	}
}

interface Agent {
	relativePath: string;
	name: string;
	absolutePath: string;
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
				label: agent.name,
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

	// No-op: agents are auto-loaded on message; keeping method removed

	async sendMessage(message: string): Promise<void> {
		if (!this.selectedAgent) {
			throw new Error("No agent selected");
		}

		const s = spinner();
		s.start("🤖 Thinking...");

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
				s.stop("❌ Failed to send message");
				throw new Error(`Failed to send message: ${errorText}`);
			}

			const result = await response.json();
			s.stop("🤖 Assistant:");

			// Display agent response using Clack's log.message
			if (result.response) {
				const formattedResponse = await renderMarkdown(result.response);
				log.message(formattedResponse.trim());
			}
		} catch (error) {
			log.error("Failed to send message");
		}
	}

	async startChat(): Promise<void> {
		if (!this.selectedAgent) {
			throw new Error("Agent not selected");
		}

		while (true) {
			try {
				const message = await p.text({
					message: "💬 Message:",
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
		// verbose is intentionally not exposed on the command; it can be passed programmatically
		// and also inferred from the ADK_VERBOSE environment variable.
		verbose?: boolean;
	} = {},
) {
	const envVerbose = process.env.ADK_VERBOSE;
	const isVerbose =
		options.verbose ?? (envVerbose === "1" || envVerbose === "true");
	// If server option is enabled, start ADK server only
	if (options.server) {
		const apiPort = 8042; // Use new default port
		const host = options.host || "localhost";

		console.log(chalk.blue("🚀 Starting ADK Server..."));

		const serveOptions: ServeOptions = {
			port: apiPort,
			dir: process.cwd(),
			host,
			quiet: !isVerbose,
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
	const apiUrl = `http://${options.host || "localhost"}:8042`; // Use new default port

	p.intro("🤖 ADK Agent Chat");

	try {
		// Check if server is running
		const healthResponse = await fetch(`${apiUrl}/health`).catch(() => null);

		if (!healthResponse || !healthResponse.ok) {
			const serverSpinner = spinner();
			serverSpinner.start("🚀 Starting server...");

			// Start server in the background
			const serveOptions: ServeOptions = {
				port: 8042, // Use new default port
				dir: process.cwd(),
				host: options.host || "localhost",
				quiet: !isVerbose,
			};

			await serveCommand(serveOptions);

			// Wait a moment for server to be ready
			await new Promise((resolve) => setTimeout(resolve, 1000));
			serverSpinner.stop("✅ Server ready");
		}

		const client = new AgentChatClient(apiUrl);

		// Connect to server
		await client.connect();

		// Select agent with spinner
		const agentSpinner = spinner();
		agentSpinner.start("🔍 Scanning for agents...");

		const agents = await client.fetchAgents();

		let selectedAgent: Agent;
		if (agents.length === 0) {
			agentSpinner.stop("❌ No agents found");
			p.cancel("No agents found in the current directory");
			process.exit(1);
		} else if (agents.length === 1) {
			selectedAgent = agents[0];
			agentSpinner.stop(`🤖 Found agent: ${selectedAgent.name}`);
		} else {
			agentSpinner.stop(`🤖 Found ${agents.length} agents`);
			const choice = await p.select({
				message: "Choose an agent to chat with:",
				options: agents.map((agent) => ({
					label: agent.name,
					value: agent,
					hint: agent.relativePath,
				})),
			});

			if (p.isCancel(choice)) {
				p.cancel("Operation cancelled");
				process.exit(0);
			}
			selectedAgent = choice;
		}

		client.setSelectedAgent(selectedAgent);

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
