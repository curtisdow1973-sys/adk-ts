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
import type { FullMessage, InMemorySessionService, LlmAgent } from "@iqai/adk";
import { AgentBuilder } from "@iqai/adk";
import type {
	Agent,
	CreateSessionRequest,
	EventsResponse,
	LoadedAgent,
	SessionResponse,
	SessionsResponse,
	StateResponse,
} from "./types.js";

export class AgentScanner {
	constructor(private quiet = false) {}

	scanAgents(
		agentsDir: string,
		loadedAgents: Map<string, LoadedAgent>,
	): Map<string, Agent> {
		const agents = new Map<string, Agent>();

		// Use current directory if agentsDir doesn't exist or is empty
		const scanDir =
			!agentsDir || !existsSync(agentsDir) ? process.cwd() : agentsDir;

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
		if (!this.quiet) {
			console.log(`✅ Agent scan complete. Found ${agents.size} agents.`);
		}

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
	constructor(private quiet = false) {}

	/**
	 * Import a TypeScript file by compiling it on-demand
	 */
	async importTypeScriptFile(filePath: string): Promise<any> {
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
				const isPrimitive = (v: any) =>
					v == null || ["string", "number", "boolean"].includes(typeof v);
				if (isPrimitive(agentExport)) {
					// Primitive named 'agent' export (e.g., a string) isn't a real agent; fall through to full-module scan
					if (!this.quiet) {
						console.log(
							`ℹ️ Ignoring primitive 'agent' export in ${filePath}; scanning module for factory...`,
						);
					}
				} else {
					if (!this.quiet) {
						console.log(`✅ TS agent imported via esbuild: ${filePath}`);
					}
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
					console.warn(
						`⚠️ Warning: Could not load ${envFile} file: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
		}
	}

	// Minimal resolution logic for agent exports: supports
	// 1) export const agent = new LlmAgent(...)
	// 2) export function agent() { return new LlmAgent(...) }
	// 3) export async function agent() { return new LlmAgent(...) }
	// 4) default export (object or function) returning or containing .agent
	async resolveAgentExport(mod: any): Promise<{ agent: LlmAgent }> {
		let candidate = mod?.agent ?? mod?.default?.agent ?? mod?.default ?? mod;

		const isLikelyAgentInstance = (obj: any) =>
			obj && typeof obj === "object" && typeof obj.name === "string";
		const isPrimitive = (v: any) =>
			v == null || ["string", "number", "boolean"].includes(typeof v);

		const invokeMaybe = async (fn: any) => {
			let out = fn();
			if (out && typeof out === "object" && "then" in out) {
				out = await out;
			}
			return out;
		};

		// If initial candidate is invalid primitive (e.g., exported const agent = "foo"), or
		// the entire module namespace (no direct agent), then probe named exports.
		if (
			(!isLikelyAgentInstance(candidate) && isPrimitive(candidate)) ||
			(!isLikelyAgentInstance(candidate) && candidate && candidate === mod)
		) {
			candidate = mod; // ensure we iterate full namespace
			for (const [key, value] of Object.entries(mod)) {
				if (key === "default") continue;
				// Prefer keys containing 'agent'
				const keyLower = key.toLowerCase();
				if (isPrimitive(value)) continue; // skip obvious non-candidates
				if (isLikelyAgentInstance(value)) {
					candidate = value;
					break;
				}
				// Handle static container object: export const container = { agent: <LlmAgent> }
				if (
					value &&
					typeof value === "object" &&
					(value as any).agent &&
					isLikelyAgentInstance((value as any).agent)
				) {
					candidate = (value as any).agent;
					break;
				}
				if (
					typeof value === "function" &&
					(/(agent|build|create)/i.test(keyLower) ||
						(value.name &&
							/(agent|build|create)/i.test(value.name.toLowerCase())))
				) {
					try {
						const maybe = await invokeMaybe(value);
						if (isLikelyAgentInstance(maybe)) {
							candidate = maybe;
							break;
						}
						if (
							maybe &&
							typeof maybe === "object" &&
							maybe.agent &&
							isLikelyAgentInstance(maybe.agent)
						) {
							candidate = maybe.agent;
							break;
						}
					} catch (e) {
						// Swallow and continue trying other exports
					}
				}
			}
		}

		// If candidate is a function (sync or async), invoke it
		if (typeof candidate === "function") {
			try {
				candidate = await invokeMaybe(candidate);
			} catch (e) {
				throw new Error(
					`Failed executing exported agent function: ${e instanceof Error ? e.message : String(e)}`,
				);
			}
		}
		// Handle built structure { agent, runner, session }
		if (
			candidate &&
			typeof candidate === "object" &&
			candidate.agent &&
			isLikelyAgentInstance(candidate.agent)
		) {
			candidate = candidate.agent;
		}
		// Unwrap { agent: ... } pattern if present
		if (candidate?.agent && isLikelyAgentInstance(candidate.agent)) {
			candidate = candidate.agent;
		}
		if (!candidate || !isLikelyAgentInstance(candidate)) {
			throw new Error(
				"No agent export resolved (expected variable, function, or function returning an agent)",
			);
		}
		return { agent: candidate as LlmAgent };
	}
}

export class AgentManager {
	private agents = new Map<string, Agent>();
	private loadedAgents = new Map<string, LoadedAgent>();
	private scanner: AgentScanner;
	private loader: AgentLoader;

	constructor(
		private sessionService: InMemorySessionService,
		quiet = false,
	) {
		this.scanner = new AgentScanner(quiet);
		this.loader = new AgentLoader(quiet);
		console.log("AgentManager initialized");
	}

	getAgents(): Map<string, Agent> {
		return this.agents;
	}

	getLoadedAgents(): Map<string, LoadedAgent> {
		return this.loadedAgents;
	}

	scanAgents(agentsDir: string): void {
		console.log("Scanning agents in directory:", agentsDir);
		this.agents = this.scanner.scanAgents(agentsDir, this.loadedAgents);
		console.log("Found agents:", Array.from(this.agents.keys()));
	}

	async startAgent(agentPath: string): Promise<void> {
		console.log("Starting agent:", agentPath);
		const agent = this.agents.get(agentPath);
		if (!agent) {
			console.error("Agent not found in agents map:", agentPath);
			console.log("Available agents:", Array.from(this.agents.keys()));
			throw new Error(`Agent not found: ${agentPath}`);
		}
		console.log("Agent found, proceeding to load...");

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
			const agentModule: any = agentFilePath.endsWith(".ts")
				? await this.loader.importTypeScriptFile(agentFilePath)
				: await import(agentFileUrl);

			const resolved = await this.loader.resolveAgentExport(agentModule);
			const exportedAgent = resolved.agent;

			// Validate basic shape
			if (!exportedAgent?.name) {
				throw new Error(
					`Invalid agent export in ${agentFilePath}. Expected an LlmAgent instance with a name property.`,
				);
			}
			// Soft validation of optional fields (model/instruction not strictly required for all custom agents)

			// Build runner/session while preserving the exact exported agent (including subAgents, tools, callbacks, etc.)
			// We use withAgent() so we don't accidentally drop configuration like subAgents which was happening before
			const agentBuilder = AgentBuilder.create(exportedAgent.name).withAgent(
				exportedAgent as any,
			);

			// Try to extract session configuration from the original agent
			const extractedConfig = AgentBuilder.extractSessionConfig(exportedAgent);
			console.log("Extracted session config from original agent:", {
				hasSessionService: !!extractedConfig.sessionService,
				sessionServiceType: extractedConfig.sessionService?.constructor?.name,
				hasSessionOptions: !!extractedConfig.sessionOptions,
			});

			let initialState: Record<string, any> | undefined;

			// If original agent has session service, try to extract state from existing sessions
			if (extractedConfig.sessionService) {
				try {
					const sessions = await extractedConfig.sessionService.listSessions(
						extractedConfig.sessionOptions?.appName || "adk-server",
						extractedConfig.sessionOptions?.userId || `user_${agentPath}`,
					);
					console.log("Found sessions in original agent:", sessions.length);

					if (sessions.length > 0) {
						const firstSession =
							await extractedConfig.sessionService.getSession(
								extractedConfig.sessionOptions?.appName || "adk-server",
								extractedConfig.sessionOptions?.userId || `user_${agentPath}`,
								sessions[0],
							);
						if (
							firstSession?.state &&
							Object.keys(firstSession.state).length > 0
						) {
							initialState = firstSession.state;
							console.log("Extracted initial state from original agent:", {
								hasState: !!initialState,
								stateKeys: initialState ? Object.keys(initialState) : [],
								stateContent: initialState,
							});
						}
					}
				} catch (error) {
					console.log(
						"Could not extract state from original agent sessions:",
						error,
					);
				}
			}

			// Configure with CLI session service and pass extracted initial state
			agentBuilder.withSessionService(this.sessionService, {
				userId: `user_${agentPath}`,
				appName: "adk-server",
				state: initialState,
			});

			const { runner, session } = await agentBuilder.build();
			console.log("Agent started with session:", {
				sessionId: session.id,
				hasState: !!session.state,
				stateKeys: session.state ? Object.keys(session.state) : [],
				stateContent: session.state,
			});

			// Store the loaded agent with its runner
			const loadedAgent: LoadedAgent = {
				agent: exportedAgent,
				runner: runner,
				sessionId: session.id,
				userId: `user_${agentPath}`,
				appName: "adk-server",
			};

			this.loadedAgents.set(agentPath, loadedAgent);
			agent.instance = exportedAgent;
			agent.name = exportedAgent.name;

			// Ensure the session is stored in the session service
			try {
				// Check if session already exists
				const existingSession = await this.sessionService.getSession(
					loadedAgent.appName,
					loadedAgent.userId,
					session.id,
				);

				if (!existingSession) {
					// Create and store the session if it doesn't exist
					console.log("Creating session in sessionService:", session.id);
					await this.sessionService.createSession(
						loadedAgent.appName,
						loadedAgent.userId,
						session.state,
						session.id,
					);
				} else {
					console.log("Session already exists in sessionService:", session.id);
				}
			} catch (error) {
				console.error("Error ensuring session exists:", error);
			}
		} catch (error) {
			console.error(`❌ Failed to load agent "${agent.name}":`, error);
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
			console.error(
				`Error sending message to agent ${agentPath}:`,
				errorMessage,
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
	constructor(private sessionService: InMemorySessionService) {}

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
			console.error("Error fetching messages:", error);
			return [];
		}
	}

	/**
	 * Get all sessions for a loaded agent
	 */
	async getAgentSessions(loadedAgent: LoadedAgent): Promise<SessionsResponse> {
		try {
			console.log(
				"Listing sessions for:",
				loadedAgent.appName,
				loadedAgent.userId,
			);
			const listResponse = await this.sessionService.listSessions(
				loadedAgent.appName,
				loadedAgent.userId,
			);
			console.log("Raw sessions from service:", listResponse.sessions.length);

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

			console.log("Processed sessions:", sessions.length);
			return { sessions };
		} catch (error) {
			console.error("Error fetching sessions:", error);
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
			console.log("Creating agent session:", {
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

			console.log("Session created with state:", {
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
			console.error("Error creating session:", error);
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
			console.error("Error deleting session:", error);
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
				const isEventInstance = typeof event.getFunctionCalls === "function";

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
			console.error("Error fetching session events:", error);
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
			console.error("Error switching session:", error);
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
			console.log("Getting session state:", sessionId);

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

			console.log("Session state retrieved:", {
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

			console.log("Returning state response:", {
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
			console.error("Error getting session state:", error);
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
			console.log("Updating session state:", sessionId, path, "=", value);

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

			console.log("Session state updated successfully");
		} catch (error) {
			console.error("Error updating session state:", error);
			throw error;
		}
	}

	/**
	 * Helper method to set nested values using dot notation
	 */
	private setNestedValue(obj: any, path: string, value: any): void {
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
