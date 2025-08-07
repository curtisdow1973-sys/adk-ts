import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

interface Agent {
	relativePath: string;
	name: string;
	absolutePath: string;
	isRunning: boolean;
}

interface AgentProcess {
	process: ReturnType<typeof spawn>;
	agent: Agent;
	messages: Array<{ type: string; content: string; timestamp: string }>;
}

export class ADKServer {
	private agents: Map<string, Agent> = new Map();
	private runningAgents: Map<string, AgentProcess> = new Map();
	private app: Hono;
	private server: any;
	private agentsDir: string;
	private port: number;
	private host: string;

	constructor(agentsDir: string, port = 3001, host = "localhost") {
		this.agentsDir = agentsDir;
		this.port = port;
		this.host = host;
		this.app = new Hono();
		this.setupRoutes();
		this.scanAgents();
	}

	private setupRoutes(): void {
		// CORS middleware
		this.app.use("/*", cors());

		// Health check
		this.app.get("/health", (c) => c.json({ status: "ok" }));

		// List agents
		this.app.get("/api/agents", (c) => {
			this.scanAgents(); // Refresh agents list
			const agentsList = Array.from(this.agents.values());
			return c.json(agentsList);
		});

		// Start agent
		this.app.post("/api/agents/:id/start", async (c) => {
			const agentPath = decodeURIComponent(c.req.param("id"));
			await this.startAgent(agentPath);
			return c.json({ success: true });
		});

		// Stop agent
		this.app.post("/api/agents/:id/stop", async (c) => {
			const agentPath = decodeURIComponent(c.req.param("id"));
			await this.stopAgent(agentPath);
			return c.json({ success: true });
		});

		// Send message to agent
		this.app.post("/api/agents/:id/message", async (c) => {
			const agentPath = decodeURIComponent(c.req.param("id"));
			const { message } = await c.req.json();
			const response = await this.sendMessageToAgent(agentPath, message);
			return c.json({ response });
		});
	}

	private scanAgents(): void {
		this.agents.clear();

		// Use current directory if agentsDir doesn't exist or is empty
		const scanDir =
			!this.agentsDir || !existsSync(this.agentsDir)
				? process.cwd()
				: this.agentsDir;

		const scanDirectory = (dir: string): void => {
			if (!existsSync(dir)) return;

			const items = readdirSync(dir);
			for (const item of items) {
				const fullPath = join(dir, item);
				const stat = statSync(fullPath);

				if (stat.isDirectory()) {
					scanDirectory(fullPath);
				} else if (item === "index.ts" || item === "index.js") {
					const relativePath = relative(scanDir, dir);
					const name = relativePath.split("/").pop() || "unknown";

					this.agents.set(relativePath, {
						relativePath,
						name,
						absolutePath: dir,
						isRunning: this.runningAgents.has(relativePath),
					});
				}
			}
		};

		scanDirectory(scanDir);
	}

	private async startAgent(agentPath: string): Promise<void> {
		const agent = this.agents.get(agentPath);
		if (!agent) {
			throw new Error(`Agent not found: ${agentPath}`);
		}

		if (this.runningAgents.has(agentPath)) {
			return; // Already running
		}

		// Check if tsx is available, fallback to node
		const command = this.checkTsxAvailable() ? "npx" : "node";
		const args = this.checkTsxAvailable() ? ["tsx", "index.ts"] : ["index.js"];

		const process = spawn(command, args, {
			cwd: agent.absolutePath,
			stdio: ["pipe", "pipe", "pipe"],
		});

		const agentProcess: AgentProcess = {
			process,
			agent,
			messages: [],
		};

		this.runningAgents.set(agentPath, agentProcess);
		agent.isRunning = true;

		// Handle process output
		process.stdout?.on("data", (data) => {
			const content = data.toString().trim();
			if (content) {
				agentProcess.messages.push({
					type: "stdout",
					content,
					timestamp: new Date().toISOString(),
				});
			}
		});

		process.stderr?.on("data", (data) => {
			const content = data.toString().trim();
			if (content) {
				agentProcess.messages.push({
					type: "stderr",
					content,
					timestamp: new Date().toISOString(),
				});
			}
		});

		process.on("exit", () => {
			this.runningAgents.delete(agentPath);
			agent.isRunning = false;
		});
	}

	private async stopAgent(agentPath: string): Promise<void> {
		const agentProcess = this.runningAgents.get(agentPath);
		if (!agentProcess) {
			return; // Not running
		}

		agentProcess.process.kill("SIGTERM");
		this.runningAgents.delete(agentPath);

		const agent = this.agents.get(agentPath);
		if (agent) {
			agent.isRunning = false;
		}
	}

	private async sendMessageToAgent(
		agentPath: string,
		message: string,
	): Promise<string> {
		const agentProcess = this.runningAgents.get(agentPath);
		if (!agentProcess) {
			throw new Error("Agent is not running");
		}

		// Send message to agent's stdin
		agentProcess.process.stdin?.write(`${message}\n`);

		// Wait for response (simplified - in real implementation you'd want better message handling)
		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				resolve("No response received");
			}, 5000);

			const checkForNewMessages = () => {
				const lastMessage =
					agentProcess.messages[agentProcess.messages.length - 1];
				if (lastMessage && lastMessage.type === "stdout") {
					clearTimeout(timeout);
					resolve(lastMessage.content);
				} else {
					setTimeout(checkForNewMessages, 100);
				}
			};

			setTimeout(checkForNewMessages, 100);
		});
	}

	private checkTsxAvailable(): boolean {
		try {
			spawn("npx", ["tsx", "--version"], { stdio: "ignore" });
			return true;
		} catch {
			return false;
		}
	}

	public async start(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server = serve({
				fetch: this.app.fetch,
				port: this.port,
				hostname: this.host,
			});

			// Give the server a moment to start
			setTimeout(() => {
				resolve();
			}, 100);
		});
	}

	public async stop(): Promise<void> {
		return new Promise((resolve) => {
			// Stop all running agents
			for (const [agentPath] of this.runningAgents) {
				this.stopAgent(agentPath);
			}

			if (this.server) {
				this.server.close();
			}
			resolve();
		});
	}

	public getPort(): number {
		return this.port;
	}
}
