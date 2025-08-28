import type { Hono } from "hono";
import { cors } from "hono/cors";
import type { AgentManager } from "./services/agent-manager.service.js";
import type { SessionManager } from "./services/session-manager.service.js";
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
		console.log("Getting sessions for agent path:", agentPath);
		console.log(
			"Available loaded agents:",
			Array.from(agentManager.getLoadedAgents().keys()),
		);

		// Try to load the agent if it's not already loaded
		if (!agentManager.getLoadedAgents().has(agentPath)) {
			console.log("Agent not loaded, trying to start it:", agentPath);
			try {
				await agentManager.startAgent(agentPath);
				console.log("Agent started successfully:", agentPath);
			} catch (error) {
				console.error("Failed to start agent:", agentPath, error);
				return c.json({ sessions: [] });
			}
		}

		const loadedAgent = agentManager.getLoadedAgents().get(agentPath);
		if (!loadedAgent) {
			console.log("Agent still not loaded after starting:", agentPath);
			return c.json({ sessions: [] });
		}

		console.log("Fetching sessions for loaded agent:", agentPath);
		const sessions = await sessionManager.getAgentSessions(loadedAgent);
		console.log("Returning sessions:", sessions.sessions.length);
		return c.json(sessions);
	});

	// Create new session for agent
	app.post("/api/agents/:id/sessions", async (c) => {
		const agentPath = decodeURIComponent(c.req.param("id"));
		const request: CreateSessionRequest = await c.req.json();
		console.log("Creating session for agent path:", agentPath);

		// Try to load the agent if it's not already loaded
		if (!agentManager.getLoadedAgents().has(agentPath)) {
			console.log("Agent not loaded, trying to start it:", agentPath);
			try {
				await agentManager.startAgent(agentPath);
				console.log(
					"Agent started successfully for session creation:",
					agentPath,
				);
			} catch (error) {
				console.error(
					"Failed to start agent for session creation:",
					agentPath,
					error,
				);
				return c.json({ error: "Failed to load agent" }, 404);
			}
		}

		const loadedAgent = agentManager.getLoadedAgents().get(agentPath);
		if (!loadedAgent) {
			console.error("Agent still not loaded after starting:", agentPath);
			return c.json({ error: "Agent not loaded" }, 404);
		}

		try {
			console.log("Creating session for agent:", agentPath);
			const newSession = await sessionManager.createAgentSession(
				loadedAgent,
				request,
			);
			console.log("Session created successfully:", newSession.id);
			return c.json(newSession);
		} catch (error) {
			console.error("Error creating session:", error);
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
				console.error(
					"Failed to start agent for session deletion:",
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
			console.error("Error deleting session:", error);
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
				console.error(
					"Failed to start agent for session switch:",
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
			console.error("Error switching session:", error);
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
				console.error("Failed to start agent for events:", agentPath, error);
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
				console.error(
					"Failed to start agent for session state:",
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
				console.error(
					"Failed to start agent for session state update:",
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
			console.error("Error updating session state:", error);
			return c.json({ error: "Failed to update state" }, 500);
		}
	});
}
