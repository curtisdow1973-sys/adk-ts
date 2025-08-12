import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	statSync,
	unlinkSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { serve } from "@hono/node-server";
import type { LlmAgent } from "@iqai/adk";
import { AgentBuilder, InMemorySessionService } from "@iqai/adk";
import type { EnhancedRunner } from "@iqai/adk";
import type { BuiltAgent } from "@iqai/adk";
import { Hono } from "hono";
import { cors } from "hono/cors";

interface Agent {
	relativePath: string;
	name: string;
	absolutePath: string;
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
	private quiet: boolean;

	constructor(
		agentsDir: string,
		port = 8042,
		host = "localhost",
		quiet = false,
	) {
		this.agentsDir = agentsDir;
		this.port = port;
		this.host = host;
		this.quiet = quiet;
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
			const agentsList = Array.from(this.agents.values()).map((agent) => ({
				path: agent.absolutePath,
				name: agent.name,
				directory: agent.absolutePath,
				relativePath: agent.relativePath,
			}));
			return c.json({ agents: agentsList });
		});

		// Refresh agents list
		this.app.post("/api/agents/refresh", (c) => {
			this.scanAgents();
			const agentsList = Array.from(this.agents.values()).map((agent) => ({
				path: agent.absolutePath,
				name: agent.name,
				directory: agent.absolutePath,
				relativePath: agent.relativePath,
			}));
			return c.json({ agents: agentsList });
		});

		// Removed explicit start/stop and running status endpoints; agents are auto-loaded on message

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
				// TODO(adk-web/tool-calls): Enhance this endpoint to better represent tool activity.
				// - Option A: Do not persist or return assistant events with empty text (current web filters these client-side).
				// - Option B: Keep raw history but add a query flag like `includeEmpty=false` to suppress blanks for clients that want clean text-only history.
				// - Option C (preferred): Emit explicit tool events, e.g., { type: "tool", name, args, output, status, timestamps } derived from non-text parts.
				//   This enables the web UI to render compact "Used tool: <name>" chips and show outputs, instead of blank assistant messages.
				//   When implemented, maintain backward compatibility by keeping the current shape under a flag (e.g., `format=legacy`).
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
						instance: loadedAgent?.agent,
					});
				}
			}
		};

		scanDirectory(scanDir);
		if (!this.quiet) {
			console.log(`✅ Agent scan complete. Found ${this.agents.size} agents.`);
		}
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
			// Load the agent module dynamically (js preferred, else ts)
			let agentFilePath = join(agent.absolutePath, "agent.js");
			if (!existsSync(agentFilePath)) {
				agentFilePath = join(agent.absolutePath, "agent.ts");
			}
			if (!existsSync(agentFilePath)) {
				throw new Error(
					`No agent.js or agent.ts file found in ${agent.absolutePath}`,
				);
			}

			this.loadEnvForFile(agentFilePath);

			const agentFileUrl = pathToFileURL(agentFilePath).href;
			const mod: any = agentFilePath.endsWith(".ts")
				? await this.importTypeScriptFile(agentFilePath)
				: await import(agentFileUrl);

			// Detect & resolve the single export (enforces one exported symbol)
			const resolved = await this.detectExportedAgent(mod, agentFilePath);

			let finalAgent: LlmAgent;
			let runner: EnhancedRunner;
			let sessionId: string;
			let userId: string;
			let appName: string;

			if (resolved.type === "built") {
				const built = resolved.builtAgent as BuiltAgent;
				finalAgent = built.agent as LlmAgent;
				runner = built.runner as EnhancedRunner;
				sessionId = built.session.id;
				userId = built.session.userId;
				appName = built.session.appName;
				if (!this.quiet) {
					console.log(
						`🔁 Reusing provided BuiltAgent (session ${sessionId}) from ${agentFilePath}`,
					);
				}
			} else {
				finalAgent = resolved.agent as LlmAgent;
				// Wrap raw LlmAgent with builder & create new session
				const builder = AgentBuilder.create(finalAgent.name)
					.withModel((finalAgent as any).model)
					.withDescription((finalAgent as any).description || "")
					.withInstruction((finalAgent as any).instruction || "")
					.withSessionService(this.sessionService, {
						userId: `user_${agentPath}`,
						appName: "adk-server",
					});
				if (
					Array.isArray((finalAgent as any).tools) &&
					(finalAgent as any).tools.length
				) {
					builder.withTools(...(finalAgent as any).tools);
					if (!this.quiet) {
						console.log(`🧩 Registered tools for agent "${finalAgent.name}"`);
					}
				}
				const built = await builder.build();
				runner = built.runner;
				sessionId = built.session.id;
				userId = `user_${agentPath}`;
				appName = "adk-server";
				if (!this.quiet) {
					console.log(
						`🛠️ Wrapped exported LlmAgent with new session ${sessionId}`,
					);
				}
			}

			// Store
			const loadedAgent: LoadedAgent = {
				agent: finalAgent,
				runner,
				sessionId,
				userId,
				appName,
			};
			this.loadedAgents.set(agentPath, loadedAgent);
			agent.instance = finalAgent;
			agent.name = finalAgent.name;
		} catch (error) {
			console.error(`❌ Failed to load agent "${agent.name}":`, error);
			throw new Error(
				`Failed to load agent: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	private async stopAgent(agentPath: string): Promise<void> {
		// Deprecated: explicit stop not needed; keep method no-op for backward compatibility
		this.loadedAgents.delete(agentPath);
		const agent = this.agents.get(agentPath);
		if (agent) {
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
		// Determine project root (for tsconfig and resolving deps)
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

		// Transpile with esbuild and import (bundles local files, preserves tools)
		try {
			const { build } = await import("esbuild");
			const cacheDir = join(projectRoot, ".adk-cache");
			if (!existsSync(cacheDir)) {
				mkdirSync(cacheDir, { recursive: true });
			}
			const outFile = join(cacheDir, `agent-${Date.now()}.mjs`);
			// Externalize bare module imports (node_modules), bundle relative/local files
			const plugin = {
				name: "externalize-bare-imports",
				setup(build: any) {
					build.onResolve({ filter: /.*/ }, (args: any) => {
						if (
							args.path.startsWith(".") ||
							args.path.startsWith("/") ||
							args.path.startsWith("..")
						) {
							return; // use default resolve (to get bundled)
						}
						return { path: args.path, external: true };
					});
				},
			};

			const tsconfigPath = join(projectRoot, "tsconfig.json");
			await build({
				entryPoints: [filePath],
				outfile: outFile,
				bundle: true,
				format: "esm",
				platform: "node",
				target: ["node22"],
				sourcemap: false,
				logLevel: "silent",
				plugins: [plugin],
				absWorkingDir: projectRoot,
				// Use tsconfig if present for path aliases
				...(existsSync(tsconfigPath) ? { tsconfig: tsconfigPath } : {}),
			});

			const mod = await import(
				`${pathToFileURL(outFile).href}?t=${Date.now()}`
			);
			let agentExport = (mod as any)?.agent;
			if (!agentExport && (mod as any)?.default) {
				agentExport = (mod as any).default.agent ?? (mod as any).default;
			}
			try {
				unlinkSync(outFile);
			} catch {}
			if (agentExport) {
				if (!this.quiet) {
					console.log(`✅ TS agent imported via esbuild: ${filePath}`);
				}
				return { agent: agentExport };
			}
		} catch (e) {
			throw new Error(
				`Failed to import TS agent via esbuild: ${e instanceof Error ? e.message : String(e)}`,
			);
		}

		// If we reached here, the file was transpiled but didn't export an agent
		throw new Error("No 'agent' export found in TypeScript module");
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

	// ---- New helper logic for agent export detection ----

	private loadEnvForFile(agentFilePath: string) {
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
				for (const line of envContent.split("\n")) {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith("#")) continue;
					const [k, ...rest] = trimmed.split("=");
					if (k && rest.length) {
						const v = rest.join("=").replace(/^"(.*)"$/, "$1");
						process.env[k.trim()] = v.trim();
					}
				}
			} catch (e) {
				if (!this.quiet) {
					console.warn(
						`⚠️ Failed loading .env for ${agentFilePath}: ${e instanceof Error ? e.message : String(e)}`,
					);
				}
			}
		}
	}

	private async detectExportedAgent(
		moduleNamespace: any,
		filePath: string,
	): Promise<
		| { type: "built"; builtAgent: BuiltAgent }
		| { type: "agent"; agent: LlmAgent }
	> {
		// Copy reference (avoid param reassignment)
		const mod = moduleNamespace;
		// Normalize module when only 'agent' present
		if (mod?.agent && Object.keys(mod).length === 1) {
			// Treat as if exported directly
		}
		const exportKeys = Object.keys(mod || {}).filter((k) => k !== "__esModule");
		let candidate: any;
		if (exportKeys.length === 0 && mod?.default) {
			candidate = mod.default;
		} else if (exportKeys.length === 1) {
			candidate = mod[exportKeys[0]];
		} else if (exportKeys.length > 1) {
			throw new Error(
				`agent.ts must export exactly one symbol (found: ${exportKeys.join(", ")}). Please export only a BuiltAgent, an LlmAgent, or a function returning one.`,
			);
		} else {
			candidate = mod.default;
		}

		// If candidate is function, call it (supports async)
		if (typeof candidate === "function") {
			candidate = candidate();
		}
		// Await promise-like
		if (candidate && typeof candidate === "object" && "then" in candidate) {
			candidate = await candidate;
		}

		// BuiltAgent shape detection
		if (this.isBuiltAgent(candidate)) {
			return { type: "built", builtAgent: candidate };
		}

		// If it contains nested .agent (common pattern returning { agent, runner, session })
		if (candidate?.agent && this.isBuiltAgent(candidate)) {
			return { type: "built", builtAgent: candidate };
		}

		// Maybe exported object with .agent only (unwrap)
		if (candidate?.agent && this.isLlmAgent(candidate.agent)) {
			candidate = candidate.agent;
		}

		if (this.isLlmAgent(candidate)) {
			return { type: "agent", agent: candidate };
		}

		throw new Error(
			`Export in ${filePath} is not a BuiltAgent or LlmAgent (after resolving functions/promises).`,
		);
	}

	private isBuiltAgent(obj: any): obj is BuiltAgent {
		return (
			!!obj &&
			typeof obj === "object" &&
			"agent" in obj &&
			"runner" in obj &&
			"session" in obj &&
			obj.session &&
			typeof obj.session.id === "string" &&
			obj.runner &&
			typeof obj.runner.ask === "function"
		);
	}

	private isLlmAgent(obj: any): obj is LlmAgent {
		return (
			!!obj &&
			typeof obj === "object" &&
			typeof obj.name === "string" &&
			// Allow flexible models/instructions
			("model" in obj || "instruction" in obj)
		);
	}
}
