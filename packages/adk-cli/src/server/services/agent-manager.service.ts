import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { FullMessage, InMemorySessionService } from "@iqai/adk";
import { AgentBuilder } from "@iqai/adk";
import type { Agent, LoadedAgent } from "../types.js";
import { AgentLoader } from "./agent-loader.service.js";
import { AgentScanner } from "./agent-scanner.service.js";

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
		for (const [agentPath] of this.loadedAgents.entries()) {
			this.stopAgent(agentPath);
		}
	}
}
