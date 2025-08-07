import { spawn } from "node:child_process";
import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
	unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import type { LlmAgent } from "@iqai/adk";
import { AgentBuilder, InMemorySessionService } from "@iqai/adk";
import type { EnhancedRunner } from "@iqai/adk";
import { Hono } from "hono";
import { cors } from "hono/cors";

interface Agent {
	relativePath: string;
	name: string;
	absolutePath: string;
	isRunning: boolean;
	instance?: LlmAgent; // Store the loaded agent instance
}

interface LoadedAgent {
	agent: LlmAgent;
	runner: EnhancedRunner; // AgentBuilder's enhanced runner
	sessionId: string; // Session ID for this agent instance
	userId: string; // User ID for session management
	appName: string; // App name for session management
}

export class ADKServer {
	private agents: Map<string, Agent> = new Map();
	private loadedAgents: Map<string, LoadedAgent> = new Map();
	private sessionService: InMemorySessionService;
	private app: Hono;
	private server: any;
	private agentsDir: string;
	private port: number;
	private host: string;

	constructor(agentsDir: string, port = 8042, host = "localhost") {
		this.agentsDir = agentsDir;
		this.port = port;
		this.host = host;
		this.sessionService = new InMemorySessionService();
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
		this.app.get("/api/agents/:id/messages", async (c) => {
			const agentPath = decodeURIComponent(c.req.param("id"));
			const loadedAgent = this.loadedAgents.get(agentPath);
			if (!loadedAgent) {
				return c.json({ messages: [] });
			}

			try {
				// Get session from session service
				const session = await this.sessionService.getSession(
					loadedAgent.appName,
					loadedAgent.userId,
					loadedAgent.sessionId,
				);

				if (!session || !session.events) {
					return c.json({ messages: [] });
				}

				// Convert session events to message format
				const messages = session.events.map((event, index) => ({
					id: index + 1,
					type: event.author === "user" ? "user" : "assistant",
					content:
						event.content?.parts
							?.map((part) =>
								typeof part === "object" && "text" in part ? part.text : "",
							)
							.join("") || "",
					timestamp: new Date(event.timestamp || Date.now()).toISOString(),
				}));

				return c.json({ messages });
			} catch (error) {
				console.error("Error fetching messages:", error);
				return c.json({ messages: [] });
			}
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

					// Try to get the actual agent name if it's already loaded
					const loadedAgent = this.loadedAgents.get(relativePath);
					let agentName = relativePath.split("/").pop() || "unknown";

					// If agent is loaded, use its actual name
					if (loadedAgent?.agent?.name) {
						agentName = loadedAgent.agent.name;
					} else {
						// Try to quickly extract name from agent file if not loaded
						try {
							const agentFilePath = join(dir, item);
							agentName =
								this.extractAgentNameFromFile(agentFilePath) || agentName;
						} catch {
							// Fallback to directory name if extraction fails
						}
					}

					this.agents.set(relativePath, {
						relativePath,
						name: agentName,
						absolutePath: dir,
						isRunning: this.loadedAgents.has(relativePath),
						instance: loadedAgent?.agent,
					});
				}
			}
		};

		scanDirectory(scanDir);
		console.log(`✅ Agent scan complete. Found ${this.agents.size} agents.`);
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

			// Load environment variables from the project directory before importing
			let projectRoot = dirname(agentFilePath);
			while (projectRoot !== "/" && projectRoot !== dirname(projectRoot)) {
				if (
					existsSync(join(projectRoot, "package.json")) ||
					existsSync(join(projectRoot, ".env"))
				) {
					break;
				}
				projectRoot = dirname(projectRoot);
			}

			const envPath = join(projectRoot, ".env");
			if (existsSync(envPath)) {
				try {
					const envContent = readFileSync(envPath, "utf8");
					const envLines = envContent.split("\n");
					for (const line of envLines) {
						const trimmedLine = line.trim();
						if (trimmedLine && !trimmedLine.startsWith("#")) {
							const [key, ...valueParts] = trimmedLine.split("=");
							if (key && valueParts.length > 0) {
								const value = valueParts.join("=").replace(/^"(.*)"$/, "$1");
								// Set environment variables in current process
								process.env[key.trim()] = value.trim();
							}
						}
					}
				} catch (error) {
					console.warn(
						`⚠️ Warning: Could not load .env file: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
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

			// Create a proper runner using AgentBuilder to wrap the existing agent
			const agentBuilder = AgentBuilder.create(agentModule.agent.name)
				.withModel(agentModule.agent.model)
				.withDescription(agentModule.agent.description || "")
				.withInstruction(agentModule.agent.instruction || "")
				.withSessionService(this.sessionService, {
					userId: `user_${agentPath}`,
					appName: "adk-server",
				});

			// Only add tools if they exist and are valid
			if (
				agentModule.agent.tools &&
				Array.isArray(agentModule.agent.tools) &&
				agentModule.agent.tools.length > 0
			) {
				agentBuilder.withTools(agentModule.agent.tools);
			}

			const { runner, session } = await agentBuilder.build();

			// Store the loaded agent with its runner
			const loadedAgent: LoadedAgent = {
				agent: agentModule.agent,
				runner: runner,
				sessionId: session.id,
				userId: `user_${agentPath}`,
				appName: "adk-server",
			};

			this.loadedAgents.set(agentPath, loadedAgent);
			agent.isRunning = true;
			agent.instance = agentModule.agent;

			// Update the agent name with the actual agent name
			agent.name = agentModule.agent.name;
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
	}

	private async sendMessageToAgent(
		agentPath: string,
		message: string,
	): Promise<string> {
		// Auto-start the agent if it's not already running
		if (!this.loadedAgents.has(agentPath)) {
			await this.startAgent(agentPath);
		}

		const loadedAgent = this.loadedAgents.get(agentPath);
		if (!loadedAgent) {
			throw new Error("Agent failed to start");
		}

		try {
			// Send message to the agent using the runner with session service
			// The session service will automatically handle message persistence
			const response = await loadedAgent.runner.ask(message);
			return response;
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			console.error(
				`Error sending message to agent ${agentPath}:`,
				errorMessage,
			);
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
			// Find the project root (where package.json or .env might be)
			let projectRoot = dirname(filePath);
			while (projectRoot !== "/" && projectRoot !== dirname(projectRoot)) {
				if (
					existsSync(join(projectRoot, "package.json")) ||
					existsSync(join(projectRoot, ".env"))
				) {
					break;
				}
				projectRoot = dirname(projectRoot);
			}

			// Load environment variables from the project's .env file if it exists
			const envPath = join(projectRoot, ".env");
			const envVars: Record<string, string> = {};
			if (existsSync(envPath)) {
				try {
					const envContent = readFileSync(envPath, "utf8");
					const envLines = envContent.split("\n");
					for (const line of envLines) {
						const trimmedLine = line.trim();
						if (trimmedLine && !trimmedLine.startsWith("#")) {
							const [key, ...valueParts] = trimmedLine.split("=");
							if (key && valueParts.length > 0) {
								const value = valueParts.join("=").replace(/^"(.*)"$/, "$1");
								envVars[key.trim()] = value.trim();
							}
						}
					}
				} catch (error) {
					console.warn(
						`⚠️ Warning: Could not load .env file: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}

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
					}
				}).catch(err => {
					console.log('IMPORT_ERROR:', err.message);
				});
			`,
				],
				{
					cwd: projectRoot, // Use project root instead of just the file directory
					env: { ...process.env, ...envVars }, // Merge current env with project .env
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

	private extractAgentNameFromFile(filePath: string): string | null {
		try {
			const content = readFileSync(filePath, "utf-8");

			// Look for agent name in export statements
			// Match patterns like: name: "agent_name" or name:"agent_name"
			const nameMatch = content.match(/name\s*:\s*["']([^"']+)["']/);
			if (nameMatch?.[1]) {
				return nameMatch[1];
			}

			return null;
		} catch {
			return null;
		}
	}
}
