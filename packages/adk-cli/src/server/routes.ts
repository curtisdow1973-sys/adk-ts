import type { Hono } from "hono";
import { cors } from "hono/cors";
import { Logger } from "./logger.js";
import type { AgentManager, SessionManager } from "./services.js";
import type {
	AgentListResponse,
	CreateSessionRequest,
	MessageRequest,
	MessageResponse,
	MessagesResponse,
	StateUpdateRequest,
} from "./types.js";

export function setupRoutes(
	app: Hono,
	agentManager: AgentManager,
	sessionManager: SessionManager,
	agentsDir: string,
): void {
	// CORS middleware
	app.use("/*", cors());

	const logger = new Logger({ name: "routes", quiet: false });

	// Health check
	app.get("/health", (c) => c.json({ status: "ok" }));

	// List agents
	app.get("/api/agents", (c) => {
		const agentsList: AgentListResponse[] = Array.from(
			agentManager.getAgents().values(),
		).map((agent) => ({
			path: agent.absolutePath,
			name: agent.name,
			directory: agent.absolutePath,
			relativePath: agent.relativePath,
		}));
		return c.json({ agents: agentsList });
	});

	// Refresh agents list
	app.post("/api/agents/refresh", (c) => {
		agentManager.scanAgents(agentsDir);
		const agentsList: AgentListResponse[] = Array.from(
			agentManager.getAgents().values(),
		).map((agent) => ({
			path: agent.absolutePath,
			name: agent.name,
			directory: agent.absolutePath,
			relativePath: agent.relativePath,
		}));
		return c.json({ agents: agentsList });
	});

	// Get agent messages
	app.get("/api/agents/:id/messages", async (c) => {
		const agentPath = decodeURIComponent(c.req.param("id"));
		const loadedAgent = agentManager.getLoadedAgents().get(agentPath);
		if (!loadedAgent) {
			return c.json({ messages: [] });
		}

		const messages = await sessionManager.getSessionMessages(loadedAgent);
		const response: MessagesResponse = { messages };
		return c.json(response);
	});

	// Send message to agent
	app.post("/api/agents/:id/message", async (c) => {
		const agentPath = decodeURIComponent(c.req.param("id"));
		const { message, attachments }: MessageRequest = await c.req.json();
		const response = await agentManager.sendMessageToAgent(
			agentPath,
			message,
			attachments,
		);
		const messageResponse: MessageResponse = { response };
		return c.json(messageResponse);
	});

	// Get sessions for agent
	app.get("/api/agents/:id/sessions", async (c) => {
		const agentPath = decodeURIComponent(c.req.param("id"));
		logger.info("Getting sessions for agent path: %s", agentPath);
		logger.debug(
			"Available loaded agents: %o",
			Array.from(agentManager.getLoadedAgents().keys()),
		);

		// Try to load the agent if it's not already loaded
		if (!agentManager.getLoadedAgents().has(agentPath)) {
			logger.info("Agent not loaded, trying to start it: %s", agentPath);
			try {
				await agentManager.startAgent(agentPath);
				logger.info("Agent started successfully: %s", agentPath);
			} catch (error) {
				logger.error("Failed to start agent: %s - %o", agentPath, error);
				return c.json({ sessions: [] });
			}
		}

		const loadedAgent = agentManager.getLoadedAgents().get(agentPath);
		if (!loadedAgent) {
			logger.warn("Agent still not loaded after starting: %s", agentPath);
			return c.json({ sessions: [] });
		}

		logger.info("Fetching sessions for loaded agent: %s", agentPath);
		const sessions = await sessionManager.getAgentSessions(loadedAgent);
		logger.info("Returning sessions: %d", sessions.sessions.length);
		return c.json(sessions);
	});

	// Create new session for agent
	app.post("/api/agents/:id/sessions", async (c) => {
		const agentPath = decodeURIComponent(c.req.param("id"));
		const request: CreateSessionRequest = await c.req.json();
		logger.info("Creating session for agent path: %s", agentPath);

		// Try to load the agent if it's not already loaded
		if (!agentManager.getLoadedAgents().has(agentPath)) {
			logger.info("Agent not loaded, trying to start it: %s", agentPath);
			try {
				await agentManager.startAgent(agentPath);
				logger.info(
					"Agent started successfully for session creation: %s",
					agentPath,
				);
			} catch (error) {
				logger.error(
					"Failed to start agent for session creation: %s - %o",
					agentPath,
					error,
				);
				return c.json({ error: "Failed to load agent" }, 404);
			}
		}

		const loadedAgent = agentManager.getLoadedAgents().get(agentPath);
		if (!loadedAgent) {
			logger.error("Agent still not loaded after starting: %s", agentPath);
			return c.json({ error: "Agent not loaded" }, 404);
		}

		try {
			logger.info("Creating session for agent: %s", agentPath);
			const newSession = await sessionManager.createAgentSession(
				loadedAgent,
				request,
			);
			logger.info("Session created successfully: %s", newSession.id);
			return c.json(newSession);
		} catch (error) {
			logger.error("Error creating session: %o", error);
			return c.json({ error: "Failed to create session" }, 500);
		}
	});

	// Delete session for agent
	app.delete("/api/agents/:id/sessions/:sessionId", async (c) => {
		const agentPath = decodeURIComponent(c.req.param("id"));
		const sessionId = c.req.param("sessionId");

		// Try to load the agent if it's not already loaded
		if (!agentManager.getLoadedAgents().has(agentPath)) {
			try {
				await agentManager.startAgent(agentPath);
			} catch (error) {
				logger.error(
					"Failed to start agent for session deletion: %s - %o",
					agentPath,
					error,
				);
				return c.json({ error: "Failed to load agent" }, 404);
			}
		}

		const loadedAgent = agentManager.getLoadedAgents().get(agentPath);
		if (!loadedAgent) {
			return c.json({ error: "Agent not loaded" }, 404);
		}

		try {
			await sessionManager.deleteAgentSession(loadedAgent, sessionId);
			return c.json({ success: true });
		} catch (error) {
			logger.error("Error deleting session: %o", error);
			return c.json({ error: "Failed to delete session" }, 500);
		}
	});

	// Switch agent to different session
	app.post("/api/agents/:id/sessions/:sessionId/switch", async (c) => {
		const agentPath = decodeURIComponent(c.req.param("id"));
		const sessionId = c.req.param("sessionId");

		// Try to load the agent if it's not already loaded
		if (!agentManager.getLoadedAgents().has(agentPath)) {
			try {
				await agentManager.startAgent(agentPath);
			} catch (error) {
				logger.error(
					"Failed to start agent for session switch: %s - %o",
					agentPath,
					error,
				);
				return c.json({ error: "Failed to load agent" }, 404);
			}
		}

		const loadedAgent = agentManager.getLoadedAgents().get(agentPath);
		if (!loadedAgent) {
			return c.json({ error: "Agent not loaded" }, 404);
		}

		try {
			await sessionManager.switchAgentSession(loadedAgent, sessionId);
			return c.json({ success: true });
		} catch (error) {
			logger.error("Error switching session: %o", error);
			return c.json({ error: "Failed to switch session" }, 500);
		}
	});

	// Get events for specific session
	app.get("/api/agents/:id/sessions/:sessionId/events", async (c) => {
		const agentPath = decodeURIComponent(c.req.param("id"));
		const sessionId = c.req.param("sessionId");

		// Try to load the agent if it's not already loaded
		if (!agentManager.getLoadedAgents().has(agentPath)) {
			try {
				await agentManager.startAgent(agentPath);
			} catch (error) {
				logger.error(
					"Failed to start agent for events: %s - %o",
					agentPath,
					error,
				);
				return c.json({ events: [], totalCount: 0 });
			}
		}

		const loadedAgent = agentManager.getLoadedAgents().get(agentPath);
		if (!loadedAgent) {
			return c.json({ events: [], totalCount: 0 });
		}

		const events = await sessionManager.getSessionEvents(
			loadedAgent,
			sessionId,
		);
		return c.json(events);
	});

	// Get state for specific session
	app.get("/api/agents/:id/sessions/:sessionId/state", async (c) => {
		const agentPath = decodeURIComponent(c.req.param("id"));
		const sessionId = c.req.param("sessionId");

		// Try to load the agent if it's not already loaded
		if (!agentManager.getLoadedAgents().has(agentPath)) {
			try {
				await agentManager.startAgent(agentPath);
			} catch (error) {
				logger.error(
					"Failed to start agent for session state: %s - %o",
					agentPath,
					error,
				);
				return c.json({ error: "Failed to load agent" }, 404);
			}
		}

		const loadedAgent = agentManager.getLoadedAgents().get(agentPath);
		if (!loadedAgent) {
			return c.json({ error: "Agent not loaded" }, 404);
		}

		const state = await sessionManager.getSessionState(loadedAgent, sessionId);
		return c.json(state);
	});

	// Update session state
	app.put("/api/agents/:id/sessions/:sessionId/state", async (c) => {
		const agentPath = decodeURIComponent(c.req.param("id"));
		const sessionId = c.req.param("sessionId");
		const request: StateUpdateRequest = await c.req.json();

		// Try to load the agent if it's not already loaded
		if (!agentManager.getLoadedAgents().has(agentPath)) {
			try {
				await agentManager.startAgent(agentPath);
			} catch (error) {
				logger.error(
					"Failed to start agent for session state update: %s - %o",
					agentPath,
					error,
				);
				return c.json({ error: "Failed to load agent" }, 404);
			}
		}

		const loadedAgent = agentManager.getLoadedAgents().get(agentPath);
		if (!loadedAgent) {
			return c.json({ error: "Agent not loaded" }, 404);
		}

		try {
			await sessionManager.updateSessionState(
				loadedAgent,
				sessionId,
				request.path,
				request.value,
			);
			return c.json({ success: true });
		} catch (error) {
			logger.error("Error updating session state: %o", error);
			return c.json({ error: "Failed to update state" }, 500);
		}
	});
}
