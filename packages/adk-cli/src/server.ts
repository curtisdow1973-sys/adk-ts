import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import type { LlmAgent } from "@iqai/adk";
import { Hono } from "hono";
import { cors } from "hono/cors";

interface Agent {
	relativePath: string;
	name: string;
	absolutePath: string;
	isRunning: boolean;
	instance?: LlmAgent; // Store the loaded agent instance
}

interface AgentMessage {
	id: number;
	type: "user" | "assistant" | "system" | "error";
	content: string;
	timestamp: string;
}

interface LoadedAgent {
	agent: LlmAgent;
	runner: any; // AgentBuilder's enhanced runner
	messages: AgentMessage[];
	messageIdCounter: number;
}

export class ADKServer {
	private agents: Map<string, Agent> = new Map();
	private loadedAgents: Map<string, LoadedAgent> = new Map();
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
			const agentsList = Array.from(this.agents.values()).map((agent) => ({
				path: agent.absolutePath,
				name: agent.name,
				directory: agent.absolutePath,
				relativePath: agent.relativePath,
			}));
			return c.json({ agents: agentsList });
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

		// Get running agents status
		this.app.get("/api/agents/running", (c) => {
			const running = Array.from(this.loadedAgents.entries()).map(
				([id, loadedAgent]) => ({
					id,
					status: "running" as const,
					startTime: new Date().toISOString(),
				}),
			);
			return c.json({ running });
		});

		// Get agent messages
		this.app.get("/api/agents/:id/messages", (c) => {
			const agentPath = decodeURIComponent(c.req.param("id"));
			const loadedAgent = this.loadedAgents.get(agentPath);
			if (!loadedAgent) {
				return c.json({ messages: [] });
			}
			return c.json({ messages: loadedAgent.messages });
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

		const shouldSkipDirectory = (dirName: string): boolean => {
			const skipDirs = [
				"node_modules",
				".git",
				".next",
				"dist",
				"build",
				".turbo",
				"coverage",
				".vscode",
				".idea",
			];
			return skipDirs.includes(dirName);
		};

		const scanDirectory = (dir: string): void => {
			if (!existsSync(dir)) return;

			const items = readdirSync(dir);
			for (const item of items) {
				const fullPath = join(dir, item);
				const stat = statSync(fullPath);

				if (stat.isDirectory()) {
					// Skip common build/dependency directories
					if (!shouldSkipDirectory(item)) {
						scanDirectory(fullPath);
					}
				} else if (item === "agent.ts" || item === "agent.js") {
					const relativePath = relative(scanDir, dir);
					const name = relativePath.split("/").pop() || "unknown";

					this.agents.set(relativePath, {
						relativePath,
						name,
						absolutePath: dir,
						isRunning: this.loadedAgents.has(relativePath),
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

		if (this.loadedAgents.has(agentPath)) {
			return; // Already running
		}

		try {
			// Load the agent module dynamically
			// Try both .js and .ts files, prioritizing .js if it exists
			let agentFilePath = join(agent.absolutePath, "agent.js");
			if (!existsSync(agentFilePath)) {
				agentFilePath = join(agent.absolutePath, "agent.ts");
			}

			if (!existsSync(agentFilePath)) {
				throw new Error(
					`No agent.js or agent.ts file found in ${agent.absolutePath}`,
				);
			}

			const agentFileUrl = pathToFileURL(agentFilePath).href;

			// Use dynamic import to load the agent
			// For TypeScript files, we'll use tsx to execute them
			let agentModule: any;
			if (agentFilePath.endsWith(".ts")) {
				// Use tsx to execute TypeScript files
				agentModule = await this.importTypeScriptFile(agentFilePath);
			} else {
				agentModule = await import(agentFileUrl);
			}

			if (!agentModule.agent) {
				throw new Error(`No 'agent' export found in ${agentFilePath}`);
			}

			// Validate that the exported agent is an LlmAgent instance
			if (
				!agentModule.agent ||
				typeof agentModule.agent !== "object" ||
				!agentModule.agent.name
			) {
				throw new Error(
					`Invalid agent export in ${agentFilePath}. Expected an LlmAgent instance with a name property.`,
				);
			}

			// Additional validation to ensure it looks like an LlmAgent
			if (
				!agentModule.agent.model ||
				!agentModule.agent.instruction !== undefined
			) {
				console.warn(
					`Warning: Agent in ${agentFilePath} may not be a valid LlmAgent instance. Expected model and instruction properties.`,
				);
			}

			// Create a simple wrapper to interact with the agent
			const simpleRunner = {
				async ask(message: string): Promise<string> {
					// For now, return a simple response - this will be improved
					// when we implement proper agent interaction
					return `Echo from ${agentModule.agent.name}: ${message}`;
				},
			};

			// Store the loaded agent with its runner
			const loadedAgent: LoadedAgent = {
				agent: agentModule.agent,
				runner: simpleRunner,
				messages: [],
				messageIdCounter: 1,
			};

			this.loadedAgents.set(agentPath, loadedAgent);
			agent.isRunning = true;
			agent.instance = agentModule.agent;

			console.log(`✅ Agent "${agent.name}" loaded successfully`);
		} catch (error) {
			console.error(`❌ Failed to load agent "${agent.name}":`, error);
			throw new Error(
				`Failed to load agent: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async stopAgent(agentPath: string): Promise<void> {
		const loadedAgent = this.loadedAgents.get(agentPath);
		if (!loadedAgent) {
			return; // Not running
		}

		this.loadedAgents.delete(agentPath);

		const agent = this.agents.get(agentPath);
		if (agent) {
			agent.isRunning = false;
			agent.instance = undefined;
		}

		console.log(`🛑 Agent "${agentPath}" stopped`);
	}

	private async sendMessageToAgent(
		agentPath: string,
		message: string,
	): Promise<string> {
		const loadedAgent = this.loadedAgents.get(agentPath);
		if (!loadedAgent) {
			throw new Error("Agent is not running");
		}

		try {
			// Add the user message to the messages
			const userMessage = {
				id: loadedAgent.messageIdCounter++,
				type: "user" as const,
				content: message,
				timestamp: new Date().toISOString(),
			};
			loadedAgent.messages.push(userMessage);

			// Send message to the agent using the runner
			const response = await loadedAgent.runner.ask(message);

			// Add the agent response to the messages
			const agentMessage = {
				id: loadedAgent.messageIdCounter++,
				type: "assistant" as const, // Changed from "agent" to "assistant"
				content: response,
				timestamp: new Date().toISOString(),
			};
			loadedAgent.messages.push(agentMessage);

			return response;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(
				`Error sending message to agent ${agentPath}:`,
				errorMessage,
			);

			// Add error message to messages
			loadedAgent.messages.push({
				id: loadedAgent.messageIdCounter++,
				type: "error" as const,
				content: `Error: ${errorMessage}`,
				timestamp: new Date().toISOString(),
			});

			throw new Error(`Failed to send message to agent: ${errorMessage}`);
		}
	}

	/**
	 * Import a TypeScript file by compiling it on-demand
	 */
	private async importTypeScriptFile(filePath: string): Promise<any> {
		return new Promise((resolve, reject) => {
			// Create a temporary compiled version of the TypeScript file
			const tempJsFile = join(tmpdir(), `agent-${Date.now()}.mjs`);

			// Use tsx to compile and execute the TypeScript file directly
			const tsxProcess = spawn(
				"npx",
				[
					"tsx",
					"--eval",
					`
				import { pathToFileURL } from 'url';
				import('${pathToFileURL(filePath).href}').then(module => {
					// Check for named export first, then default export
					let agent = module.agent;
					if (!agent && module.default && module.default.agent) {
						agent = module.default.agent;
					}

					if (agent) {
						console.log('AGENT_FOUND');
						console.log(JSON.stringify({
							name: agent.name,
							description: agent.description,
							model: agent.model || 'unknown',
							instruction: agent.instruction || '',
							_isValid: true
						}));
					} else {
						console.log('NO_AGENT_EXPORT');
						console.log('Available exports:', Object.keys(module));
						if (module.default) {
							console.log('Default export keys:', Object.keys(module.default));
						}
					}
				}).catch(err => {
					console.log('IMPORT_ERROR:', err.message);
				});
			`,
				],
				{
					cwd: dirname(filePath),
					stdio: ["pipe", "pipe", "pipe"],
					timeout: 10000, // 10 second timeout
				},
			);

			let output = "";
			let errorOutput = "";

			tsxProcess.stdout.on("data", (data) => {
				output += data.toString();
			});

			tsxProcess.stderr.on("data", (data) => {
				errorOutput += data.toString();
			});

			const cleanup = () => {
				try {
					if (existsSync(tempJsFile)) {
						unlinkSync(tempJsFile);
					}
				} catch {}
			};

			tsxProcess.on("close", (code) => {
				cleanup();

				if (code !== 0) {
					reject(
						new Error(`tsx process failed with code ${code}: ${errorOutput}`),
					);
					return;
				}

				try {
					const lines = output.split("\n");
					const agentFoundIndex = lines.findIndex((line) =>
						line.includes("AGENT_FOUND"),
					);

					if (agentFoundIndex === -1) {
						if (output.includes("NO_AGENT_EXPORT")) {
							reject(new Error("No agent export found in TypeScript file"));
						} else if (output.includes("IMPORT_ERROR:")) {
							const errorLine = lines.find((line) =>
								line.includes("IMPORT_ERROR:"),
							);
							reject(
								new Error(
									`Import error: ${errorLine?.replace("IMPORT_ERROR:", "").trim()}`,
								),
							);
						} else {
							reject(new Error("Unexpected output from tsx process"));
						}
						return;
					}

					// Get the JSON data from the next line
					const jsonLine = lines[agentFoundIndex + 1];
					if (!jsonLine) {
						reject(new Error("No agent data found after AGENT_FOUND marker"));
						return;
					}

					const agentData = JSON.parse(jsonLine);

					// Create a mock agent object that matches our interface
					const mockAgent = {
						name: agentData.name,
						description: agentData.description,
						model: agentData.model,
						instruction: agentData.instruction,
						tools: [],
						_isServerMock: true,
					};

					resolve({ agent: mockAgent });
				} catch (parseError) {
					reject(
						new Error(
							`Failed to parse tsx output: ${parseError}. Output: ${output}`,
						),
					);
				}
			});

			tsxProcess.on("error", (error) => {
				cleanup();
				reject(new Error(`Failed to start tsx process: ${error.message}`));
			});

			// Set a timeout to prevent hanging
			setTimeout(() => {
				tsxProcess.kill();
				cleanup();
				reject(new Error("tsx process timed out"));
			}, 10000);
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
			for (const [agentPath] of this.loadedAgents) {
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
