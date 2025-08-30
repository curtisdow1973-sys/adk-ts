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
import type {
	BaseAgent,
	BuiltAgent,
	EnhancedRunner,
	FullMessage,
	InMemorySessionService,
} from "@iqai/adk";
import { AgentBuilder } from "@iqai/adk";
import { Logger } from "./logger.js";
import type {
	Agent,
	CreateSessionRequest,
	EventsResponse,
	LoadedAgent,
	SessionResponse,
	SessionsResponse,
	StateResponse,
} from "./types.js";

// Constants
const DIRECTORIES_TO_SKIP = [
	"node_modules",
	".git",
	".next",
	"dist",
	"build",
	".turbo",
	"coverage",
	".vscode",
	".idea",
] as const;

const AGENT_FILENAMES = ["agent.ts", "agent.js"] as const;
const ADK_CACHE_DIR = ".adk-cache";
const DEFAULT_APP_NAME = "adk-server";
const USER_ID_PREFIX = "user_";

export class AgentScanner {
	private logger: Logger;

	constructor(private quiet = false) {
		this.logger = new Logger({ name: "agent-scanner", quiet: this.quiet });
	}

	scanAgents(
		agentsDir: string,
		loadedAgents: Map<string, LoadedAgent>,
	): Map<string, Agent> {
		const agents = new Map<string, Agent>();

		// Use current directory if agentsDir doesn't exist or is empty
		const scanDir =
			!agentsDir || !existsSync(agentsDir) ? process.cwd() : agentsDir;

		const shouldSkipDirectory = (dirName: string): boolean => {
			return DIRECTORIES_TO_SKIP.includes(
				dirName as (typeof DIRECTORIES_TO_SKIP)[number],
			);
		};

		const scanDirectory = (dir: string): void => {
			const items = readdirSync(dir);
			for (const item of items) {
				const fullPath = join(dir, item);
				const stat = statSync(fullPath);

				if (stat.isDirectory()) {
					// Skip common build/dependency directories
					if (!shouldSkipDirectory(item)) {
						scanDirectory(fullPath);
					}
				} else if (
					AGENT_FILENAMES.includes(item as (typeof AGENT_FILENAMES)[number])
				) {
					const relativePath = relative(scanDir, dir);

					// Try to get the actual agent name if it's already loaded
					const loadedAgent = loadedAgents.get(relativePath);
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

					agents.set(relativePath, {
						relativePath,
						name: agentName,
						absolutePath: dir,
						instance: loadedAgent?.agent,
					});
				}
			}
		};

		scanDirectory(scanDir);
		this.logger.info(`Agent scan complete. Found ${agents.size} agents. ✨`);

		return agents;
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

export class AgentLoader {
	private logger: Logger;

	constructor(private quiet = false) {
		this.logger = new Logger({ name: "agent-loader", quiet: this.quiet });
	}

	/**
	 * Import a TypeScript file by compiling it on-demand
	 */
	async importTypeScriptFile(
		filePath: string,
	): Promise<Record<string, unknown>> {
		// Determine project root (for tsconfig and resolving deps)
		const startDir = dirname(filePath);
		let projectRoot = startDir;
		while (projectRoot !== "/" && projectRoot !== dirname(projectRoot)) {
			if (
				existsSync(join(projectRoot, "package.json")) ||
				existsSync(join(projectRoot, ".env"))
			) {
				break;
			}
			projectRoot = dirname(projectRoot);
		}
		// If we reached root without finding markers, use the original start directory
		if (projectRoot === "/") {
			projectRoot = startDir;
		}

		// Transpile with esbuild and import (bundles local files, preserves tools)
		try {
			const { build } = await import("esbuild");
			const cacheDir = join(projectRoot, ADK_CACHE_DIR);
			if (!existsSync(cacheDir)) {
				mkdirSync(cacheDir, { recursive: true });
			}
			const outFile = join(cacheDir, `agent-${Date.now()}.mjs`);
			// Externalize bare module imports (node_modules), bundle relative/local files
			const plugin = {
				name: "externalize-bare-imports",
				setup(build: {
					onResolve: (
						options: { filter: RegExp },
						callback: (args: { path: string }) =>
							| { path: string; external: boolean }
							| undefined,
					) => void;
				}) {
					build.onResolve({ filter: /.*/ }, (args: { path: string }) => {
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

			const mod = (await import(
				`${pathToFileURL(outFile).href}?t=${Date.now()}`
			)) as Record<string, unknown>;
			let agentExport = mod?.agent;
			if (!agentExport && mod?.default) {
				const defaultExport = mod.default as Record<string, unknown>;
				agentExport = defaultExport?.agent ?? defaultExport;
			}
			try {
				unlinkSync(outFile);
			} catch {}
			if (agentExport) {
				const isPrimitive = (
					v: unknown,
				): v is null | undefined | string | number | boolean =>
					v == null || ["string", "number", "boolean"].includes(typeof v);
				if (isPrimitive(agentExport)) {
					// Primitive named 'agent' export (e.g., a string) isn't a real agent; fall through to full-module scan
					this.logger.info(
						`Ignoring primitive 'agent' export in ${filePath}; scanning module for factory...`,
					);
				} else {
					this.logger.info(`TS agent imported via esbuild: ${filePath} ✅`);
					return { agent: agentExport };
				}
			}
			// Fallback: return full module so downstream resolver can inspect named exports (e.g., getFooAgent)
			return mod;
		} catch (e) {
			throw new Error(
				`Failed to import TS agent via esbuild: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}

	loadEnvironmentVariables(agentFilePath: string): void {
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

		// Check for multiple env files in priority order
		const envFiles = [
			".env.local",
			".env.development.local",
			".env.production.local",
			".env.development",
			".env.production",
			".env",
		];

		for (const envFile of envFiles) {
			const envPath = join(projectRoot, envFile);
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
								// Set environment variables in current process (only if not already set)
								if (!process.env[key.trim()]) {
									process.env[key.trim()] = value.trim();
								}
							}
						}
					}
				} catch (error) {
					this.logger.warn(
						`Warning: Could not load ${envFile} file: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
		}
	}

	/**
	 * Type guard to check if object is likely a BaseAgent instance
	 */
	private isLikelyAgentInstance(obj: unknown): obj is BaseAgent {
		return (
			obj != null &&
			typeof obj === "object" &&
			typeof (obj as BaseAgent).name === "string" &&
			typeof (obj as BaseAgent).runAsync === "function"
		);
	}

	/**
	 * Type guard to check if object is an AgentBuilder
	 */
	private isAgentBuilder(obj: unknown): obj is AgentBuilder {
		return (
			obj != null &&
			typeof obj === "object" &&
			typeof (obj as AgentBuilder).build === "function" &&
			typeof (obj as AgentBuilder).withModel === "function"
		);
	}

	/**
	 * Type guard to check if object is a BuiltAgent
	 */
	private isBuiltAgent(obj: unknown): obj is BuiltAgent {
		return (
			obj != null &&
			typeof obj === "object" &&
			"agent" in obj &&
			"runner" in obj &&
			"session" in obj
		);
	}

	/**
	 * Type guard to check if value is a primitive type
	 */
	private isPrimitive(
		v: unknown,
	): v is null | undefined | string | number | boolean {
		return v == null || ["string", "number", "boolean"].includes(typeof v);
	}

	/**
	 * Safely invoke a function, handling both sync and async results
	 */
	private async invokeFunctionSafely(fn: () => unknown): Promise<unknown> {
		let result = fn();
		if (result && typeof result === "object" && "then" in result) {
			result = await result;
		}
		return result;
	}

	/**
	 * Extract BaseAgent from different possible types
	 */
	private async extractBaseAgent(item: unknown): Promise<BaseAgent | null> {
		if (this.isLikelyAgentInstance(item)) {
			return item; // Already a BaseAgent
		}
		if (this.isAgentBuilder(item)) {
			// Build the AgentBuilder to get BuiltAgent, then extract agent
			const built = await item.build();
			return built.agent;
		}
		if (this.isBuiltAgent(item)) {
			// Extract agent from BuiltAgent
			return item.agent;
		}
		return null;
	}

	/**
	 * Search through module exports to find potential agent exports
	 */
	private async scanModuleExports(
		mod: Record<string, unknown>,
	): Promise<BaseAgent | null> {
		for (const [key, value] of Object.entries(mod)) {
			if (key === "default") continue;
			const keyLower = key.toLowerCase();
			if (this.isPrimitive(value)) continue;

			const baseAgent = await this.extractBaseAgent(value);
			if (baseAgent) {
				return baseAgent;
			}

			// Handle static container object: export const container = { agent: <BaseAgent> }
			if (value && typeof value === "object" && "agent" in value) {
				const container = value as Record<string, unknown>;
				const containerAgent = await this.extractBaseAgent(container.agent);
				if (containerAgent) {
					return containerAgent;
				}
			}

			// Handle function exports that might return agents
			if (
				typeof value === "function" &&
				(/(agent|build|create)/i.test(keyLower) ||
					(value.name &&
						/(agent|build|create)/i.test(value.name.toLowerCase())))
			) {
				try {
					const functionResult = await this.invokeFunctionSafely(
						value as () => unknown,
					);
					const baseAgent = await this.extractBaseAgent(functionResult);
					if (baseAgent) {
						return baseAgent;
					}

					if (
						functionResult &&
						typeof functionResult === "object" &&
						"agent" in functionResult
					) {
						const container = functionResult as Record<string, unknown>;
						const containerAgent = await this.extractBaseAgent(container.agent);
						if (containerAgent) {
							return containerAgent;
						}
					}
				} catch (e) {
					// Swallow and continue searching
				}
			}
		}

		return null;
	}

	// Enhanced resolution logic for agent exports: always returns BaseAgent
	async resolveAgentExport(mod: Record<string, unknown>): Promise<BaseAgent> {
		const moduleDefault = mod?.default as Record<string, unknown> | undefined;
		const candidateToResolve: unknown =
			mod?.agent ?? moduleDefault?.agent ?? moduleDefault ?? mod;

		// Try to extract from the initial candidate
		const directResult = await this.tryResolvingDirectCandidate(
			candidateToResolve,
			mod,
		);
		if (directResult) {
			return directResult;
		}

		// Search through module exports if no direct candidate found
		const exportResult = await this.scanModuleExports(mod);
		if (exportResult) {
			return exportResult;
		}

		// Final attempt: handle function candidate
		if (typeof candidateToResolve === "function") {
			const functionResult =
				await this.tryResolvingFunctionCandidate(candidateToResolve);
			if (functionResult) {
				return functionResult;
			}
		}

		throw new Error(
			"No agent export resolved (expected BaseAgent, AgentBuilder, or BuiltAgent)",
		);
	}

	/**
	 * Try to resolve a direct candidate (not from scanning exports)
	 */
	private async tryResolvingDirectCandidate(
		candidateToResolve: unknown,
		mod: Record<string, unknown>,
	): Promise<BaseAgent | null> {
		// Skip if candidate is primitive or represents the whole module
		if (
			this.isPrimitive(candidateToResolve) ||
			(candidateToResolve && candidateToResolve === mod)
		) {
			return null;
		}

		// Try direct extraction
		const directAgent = await this.extractBaseAgent(candidateToResolve);
		if (directAgent) {
			return directAgent;
		}

		// Check if it's a container object
		if (
			candidateToResolve &&
			typeof candidateToResolve === "object" &&
			"agent" in candidateToResolve
		) {
			const container = candidateToResolve as Record<string, unknown>;
			return await this.extractBaseAgent(container.agent);
		}

		return null;
	}

	/**
	 * Try to resolve a function candidate by invoking it
	 */
	private async tryResolvingFunctionCandidate(
		functionCandidate: unknown,
	): Promise<BaseAgent | null> {
		try {
			const functionResult = await this.invokeFunctionSafely(
				functionCandidate as () => unknown,
			);

			// Try direct extraction from function result
			const directAgent = await this.extractBaseAgent(functionResult);
			if (directAgent) {
				return directAgent;
			}

			// Check if function result is a container
			if (
				functionResult &&
				typeof functionResult === "object" &&
				"agent" in functionResult
			) {
				const container = functionResult as Record<string, unknown>;
				return await this.extractBaseAgent(container.agent);
			}
		} catch (e) {
			throw new Error(
				`Failed executing exported agent function: ${e instanceof Error ? e.message : String(e)}`,
			);
		}

		return null;
	}
}

export class AgentManager {
	private agents = new Map<string, Agent>();
	private loadedAgents = new Map<string, LoadedAgent>();
	private scanner: AgentScanner;
	private loader: AgentLoader;
	private logger: Logger;

	constructor(
		private sessionService: InMemorySessionService,
		quiet = false,
	) {
		this.scanner = new AgentScanner(quiet);
		this.loader = new AgentLoader(quiet);
		this.logger = new Logger({ name: "agent-manager", quiet });
	}

	getAgents(): Map<string, Agent> {
		return this.agents;
	}

	getLoadedAgents(): Map<string, LoadedAgent> {
		return this.loadedAgents;
	}

	scanAgents(agentsDir: string): void {
		this.logger.info("Scanning agents in directory: %s", agentsDir);
		this.agents = this.scanner.scanAgents(agentsDir, this.loadedAgents);
		this.logger.info("Found agents: %o", Array.from(this.agents.keys()));
	}

	async startAgent(agentPath: string): Promise<void> {
		this.logger.info("Starting agent: %s", agentPath);
		const agent = this.agents.get(agentPath);
		if (!agent) {
			this.logger.error("Agent not found in agents map: %s", agentPath);
			this.logger.debug("Available agents: %o", Array.from(this.agents.keys()));
			throw new Error(`Agent not found: ${agentPath}`);
		}
		this.logger.info("Agent found, proceeding to load...");

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
			this.loader.loadEnvironmentVariables(agentFilePath);

			const agentFileUrl = pathToFileURL(agentFilePath).href;

			// Use dynamic import to load the agent (TS path uses esbuild wrapper returning { agent })
			const agentModule: Record<string, unknown> = agentFilePath.endsWith(".ts")
				? await this.loader.importTypeScriptFile(agentFilePath)
				: ((await import(agentFileUrl)) as Record<string, unknown>);

			const exportedAgent = await this.loader.resolveAgentExport(agentModule);

			// Validate basic shape
			if (!exportedAgent?.name) {
				throw new Error(
					`Invalid agent export in ${agentFilePath}. Expected a BaseAgent instance with a name property.`,
				);
			}
			// Soft validation of optional fields (model/instruction not strictly required for all custom agents)

			// Always use the session created by the agent builder; ignore any session from the exported agent.
			const agentBuilder = AgentBuilder.create(exportedAgent.name).withAgent(
				exportedAgent,
			);
			agentBuilder.withSessionService(this.sessionService, {
				userId: `${USER_ID_PREFIX}${agentPath}`,
				appName: DEFAULT_APP_NAME,
				state: undefined,
			});
			const { runner, session } = await agentBuilder.build();
			this.logger.info("Agent started with session: %o", {
				sessionId: session.id,
				hasState: !!session.state,
				stateKeys: session.state ? Object.keys(session.state) : [],
				stateContent: session.state,
			});
			// Store the loaded agent with its runner and the session from the builder only
			const loadedAgent: LoadedAgent = {
				agent: exportedAgent,
				runner: runner,
				sessionId: session.id,
				userId: `${USER_ID_PREFIX}${agentPath}`,
				appName: DEFAULT_APP_NAME,
			};
			this.loadedAgents.set(agentPath, loadedAgent);
			agent.instance = exportedAgent;
			agent.name = exportedAgent.name;
			// Ensure the session is stored in the session service
			try {
				const existingSession = await this.sessionService.getSession(
					loadedAgent.appName,
					loadedAgent.userId,
					session.id,
				);
				if (!existingSession) {
					this.logger.info(
						"Creating session in sessionService: %s",
						session.id,
					);
					await this.sessionService.createSession(
						loadedAgent.appName,
						loadedAgent.userId,
						session.state,
						session.id,
					);
				} else {
					this.logger.info(
						"Session already exists in sessionService: %s",
						session.id,
					);
				}
			} catch (error) {
				this.logger.error("Error ensuring session exists: %o", error);
			}
		} catch (error) {
			// agent might be undefined if lookup failed earlier
			const agentName = agent?.name ?? agentPath;
			this.logger.error(
				`Failed to load agent "${agentName}": ${error instanceof Error ? error.message : String(error)}`,
			);
			throw new Error(
				`Failed to load agent: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async stopAgent(agentPath: string): Promise<void> {
		// Deprecated: explicit stop not needed; keep method no-op for backward compatibility
		this.loadedAgents.delete(agentPath);
		const agent = this.agents.get(agentPath);
		if (agent) {
			agent.instance = undefined;
		}
	}

	async sendMessageToAgent(
		agentPath: string,
		message: string,
		attachments?: Array<{ name: string; mimeType: string; data: string }>,
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
			// Build FullMessage (text + optional attachments)
			const fullMessage: FullMessage = {
				parts: [
					{ text: message },
					...(attachments || []).map((file) => ({
						inlineData: { mimeType: file.mimeType, data: file.data },
					})),
				],
			};

			// Always run against the CURRENT loadedAgent.sessionId (switchable)
			let accumulated = "";
			for await (const event of loadedAgent.runner.runAsync({
				userId: loadedAgent.userId,
				sessionId: loadedAgent.sessionId,
				newMessage: fullMessage,
			})) {
				const parts = (event as any)?.content?.parts;
				if (Array.isArray(parts)) {
					accumulated += parts
						.map((p: any) =>
							p && typeof p === "object" && "text" in p ? p.text : "",
						)
						.join("");
				}
			}
			return accumulated.trim();
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			this.logger.error(
				`Error sending message to agent ${agentPath}: ${errorMessage}`,
			);
			throw new Error(`Failed to send message to agent: ${errorMessage}`);
		}
	}

	stopAllAgents(): void {
		for (const [agentPath] of Array.from(this.loadedAgents.entries())) {
			this.stopAgent(agentPath);
		}
	}
}

export class SessionManager {
	private logger: Logger;

	constructor(
		private sessionService: InMemorySessionService,
		private quiet = false,
	) {
		this.logger = new Logger({ name: "session-manager", quiet: this.quiet });
	}

	async getSessionMessages(loadedAgent: LoadedAgent) {
		try {
			// Get session from session service
			const session = await this.sessionService.getSession(
				loadedAgent.appName,
				loadedAgent.userId,
				loadedAgent.sessionId,
			);

			if (!session || !session.events) {
				return [];
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
				type:
					event.author === "user" ? ("user" as const) : ("assistant" as const),
				content:
					event.content?.parts
						?.map((part) =>
							typeof part === "object" && "text" in part ? part.text : "",
						)
						.join("") || "",
				timestamp: new Date(event.timestamp || Date.now()).toISOString(),
			}));

			return messages;
		} catch (error) {
			this.logger.error(
				"Error fetching messages:",
				error instanceof Error ? error.message : String(error),
			);
			return [];
		}
	}

	/**
	 * Get all sessions for a loaded agent
	 */
	async getAgentSessions(loadedAgent: LoadedAgent): Promise<SessionsResponse> {
		try {
			this.logger.info(
				"Listing sessions for: %s %s",
				loadedAgent.appName,
				loadedAgent.userId,
			);
			const listResponse = await this.sessionService.listSessions(
				loadedAgent.appName,
				loadedAgent.userId,
			);
			this.logger.info(
				"Raw sessions from service: %d",
				listResponse.sessions.length,
			);

			const sessions: SessionResponse[] = [];
			for (const s of listResponse.sessions) {
				// Ensure we load the full session to get the latest event list
				let fullSession: any;
				try {
					fullSession = await this.sessionService.getSession(
						loadedAgent.appName,
						loadedAgent.userId,
						s.id,
					);
				} catch (e) {
					fullSession = s;
				}

				sessions.push({
					id: s.id,
					appName: s.appName,
					userId: s.userId,
					state: s.state,
					eventCount: Array.isArray(fullSession?.events)
						? fullSession.events.length
						: 0,
					lastUpdateTime: s.lastUpdateTime,
					createdAt: s.lastUpdateTime,
				});
			}

			this.logger.info("Processed sessions: %d", sessions.length);
			return { sessions };
		} catch (error) {
			this.logger.error("Error fetching sessions: %o", error);
			return { sessions: [] };
		}
	}

	/**
	 * Create a new session for a loaded agent
	 */
	async createAgentSession(
		loadedAgent: LoadedAgent,
		request?: CreateSessionRequest,
	): Promise<SessionResponse> {
		try {
			this.logger.info("Creating agent session: %o", {
				appName: loadedAgent.appName,
				userId: loadedAgent.userId,
				hasState: !!request?.state,
				stateKeys: request?.state ? Object.keys(request.state) : [],
				sessionId: request?.sessionId,
			});

			const newSession = await this.sessionService.createSession(
				loadedAgent.appName,
				loadedAgent.userId,
				request?.state,
				request?.sessionId,
			);

			this.logger.info("Session created with state: %o", {
				sessionId: newSession.id,
				hasState: !!newSession.state,
				stateKeys: newSession.state ? Object.keys(newSession.state) : [],
				stateContent: newSession.state,
			});

			return {
				id: newSession.id,
				appName: newSession.appName,
				userId: newSession.userId,
				state: newSession.state,
				eventCount: newSession.events.length,
				lastUpdateTime: newSession.lastUpdateTime,
				createdAt: newSession.lastUpdateTime,
			};
		} catch (error) {
			this.logger.error("Error creating session: %o", error);
			throw error;
		}
	}

	/**
	 * Delete a session for a loaded agent
	 */
	async deleteAgentSession(
		loadedAgent: LoadedAgent,
		sessionId: string,
	): Promise<void> {
		try {
			await this.sessionService.deleteSession(
				loadedAgent.appName,
				loadedAgent.userId,
				sessionId,
			);
		} catch (error) {
			this.logger.error("Error deleting session: %o", error);
			throw error;
		}
	}

	/**
	 * Get events for a specific session
	 */
	async getSessionEvents(
		loadedAgent: LoadedAgent,
		sessionId: string,
	): Promise<EventsResponse> {
		try {
			const session = await this.sessionService.getSession(
				loadedAgent.appName,
				loadedAgent.userId,
				sessionId,
			);

			if (!session || !session.events) {
				return { events: [], totalCount: 0 };
			}

			const events = session.events.map((event: any) => {
				// Handle both Event class instances and plain objects
				const isEventInstance =
					typeof (event as any).getFunctionCalls === "function";

				return {
					id: event.id,
					author: event.author,
					timestamp: event.timestamp,
					content: event.content,
					actions: event.actions,
					functionCalls: isEventInstance
						? event.getFunctionCalls()
						: event.content?.parts?.filter((part: any) => part.functionCall) ||
							[],
					functionResponses: isEventInstance
						? event.getFunctionResponses()
						: event.content?.parts?.filter(
								(part: any) => part.functionResponse,
							) || [],
					branch: event.branch,
					isFinalResponse: isEventInstance
						? event.isFinalResponse()
						: !event.content?.parts?.some((part: any) => part.functionCall) &&
							!event.partial,
				};
			});

			return {
				events,
				totalCount: events.length,
			};
		} catch (error) {
			this.logger.error("Error fetching session events: %o", error);
			return { events: [], totalCount: 0 };
		}
	}

	/**
	 * Switch the loaded agent to use a different session
	 */
	async switchAgentSession(
		loadedAgent: LoadedAgent,
		sessionId: string,
	): Promise<void> {
		try {
			// Verify the session exists
			const session = await this.sessionService.getSession(
				loadedAgent.appName,
				loadedAgent.userId,
				sessionId,
			);

			if (!session) {
				throw new Error(`Session ${sessionId} not found`);
			}

			// Update the loaded agent's session ID
			(loadedAgent as any).sessionId = sessionId;
		} catch (error) {
			this.logger.error("Error switching session: %o", error);
			throw error;
		}
	}

	/**
	 * Get state for specific session
	 */
	async getSessionState(
		loadedAgent: LoadedAgent,
		sessionId: string,
	): Promise<StateResponse> {
		try {
			this.logger.info("Getting session state: %s", sessionId);

			const session = await this.sessionService.getSession(
				loadedAgent.appName,
				loadedAgent.userId,
				sessionId,
			);

			if (!session) {
				throw new Error("Session not found");
			}

			const agentState: Record<string, any> = {};
			const userState: Record<string, any> = {};
			const sessionState = session.state || {};

			this.logger.info("Session state retrieved: %o", {
				sessionId,
				hasSessionState: !!session.state,
				sessionStateKeys: Object.keys(sessionState),
				sessionStateContent: sessionState,
				sessionLastUpdateTime: session.lastUpdateTime,
			});

			const allKeys = { ...agentState, ...userState, ...sessionState };
			const totalKeys = Object.keys(allKeys).length;
			const sizeBytes = JSON.stringify(allKeys).length;

			const response = {
				agentState,
				userState,
				sessionState,
				metadata: {
					lastUpdated: session.lastUpdateTime,
					changeCount: 0,
					totalKeys,
					sizeBytes,
				},
			};

			this.logger.info("Returning state response: %o", {
				hasAgentState:
					!!response.agentState && Object.keys(response.agentState).length > 0,
				hasUserState:
					!!response.userState && Object.keys(response.userState).length > 0,
				hasSessionState:
					!!response.sessionState &&
					Object.keys(response.sessionState).length > 0,
				sessionStateKeys: Object.keys(response.sessionState),
				totalKeys: response.metadata.totalKeys,
			});

			return response;
		} catch (error) {
			this.logger.error("Error getting session state: %o", error);
			return {
				agentState: {},
				userState: {},
				sessionState: {},
				metadata: {
					lastUpdated: Date.now() / 1000,
					changeCount: 0,
					totalKeys: 0,
					sizeBytes: 0,
				},
			};
		}
	}

	/**
	 * Update session state
	 */
	async updateSessionState(
		loadedAgent: LoadedAgent,
		sessionId: string,
		path: string,
		value: any,
	): Promise<void> {
		try {
			this.logger.info(
				"Updating session state: %s %s = %o",
				sessionId,
				path,
				value,
			);

			const session = await this.sessionService.getSession(
				loadedAgent.appName,
				loadedAgent.userId,
				sessionId,
			);

			if (!session) {
				throw new Error("Session not found");
			}

			const updatedState = { ...session.state };
			this.setNestedValue(updatedState, path, value);

			await this.sessionService.createSession(
				loadedAgent.appName,
				loadedAgent.userId,
				updatedState,
				sessionId,
			);

			this.logger.info("Session state updated successfully");
		} catch (error) {
			this.logger.error("Error updating session state: %o", error);
			throw error;
		}
	}

	/**
	 * Helper method to set nested values using dot notation
	 */
	private setNestedValue(
		obj: Record<string, any>,
		path: string,
		value: unknown,
	): void {
		const keys = path.split(".");
		const lastKey = keys.pop()!;
		const target = keys.reduce((current, key) => {
			if (
				!(key in current) ||
				typeof current[key] !== "object" ||
				current[key] === null
			) {
				current[key] = {};
			}
			return current[key];
		}, obj);
		target[lastKey] = value;
	}
}
