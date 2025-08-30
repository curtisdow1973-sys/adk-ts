import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import type {
  CreateSessionRequest,
  EventsResponse,
  LoadedAgent,
  SessionsResponse,
  StateResponse,
  StateUpdateRequest,
} from "../../common/types";
import { AgentManager } from "../../core/services/agent-manager.service";
import { SessionManager } from "../../core/services/session-manager.service";

async function ensureAgentLoaded(
  agentManager: AgentManager,
  agentPath: string,
): Promise<LoadedAgent | null> {
  if (!agentManager.getLoadedAgents().has(agentPath)) {
    try {
      await agentManager.startAgent(agentPath);
    } catch {
      return null;
    }
  }
  const loaded = agentManager.getLoadedAgents().get(agentPath);
  return loaded ?? null;
}

@Controller("api/agents/:id/sessions")
export class SessionsController {
  constructor(
    private readonly agentManager: AgentManager,
    private readonly sessionManager: SessionManager,
  ) {}

  @Get()
  async listSessions(@Param("id") id: string): Promise<SessionsResponse> {
    const agentPath = decodeURIComponent(id);
    const loaded = await ensureAgentLoaded(this.agentManager, agentPath);
    if (!loaded) {
      return { sessions: [] };
    }
    return this.sessionManager.getAgentSessions(loaded);
  }

  @Post()
  async createSession(
    @Param("id") id: string,
    @Body() request: CreateSessionRequest,
  ) {
    const agentPath = decodeURIComponent(id);
    const loaded = await ensureAgentLoaded(this.agentManager, agentPath);
    if (!loaded) {
      return { error: "Failed to load agent" } as any;
    }
    return this.sessionManager.createAgentSession(loaded, request);
  }

  @Delete(":sessionId")
  async deleteSession(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
  ) {
    const agentPath = decodeURIComponent(id);
    const loaded = await ensureAgentLoaded(this.agentManager, agentPath);
    if (!loaded) {
      return { error: "Failed to load agent" } as any;
    }
    await this.sessionManager.deleteAgentSession(loaded, sessionId);
    return { success: true };
  }

  @Post(":sessionId/switch")
  async switchSession(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
  ) {
    const agentPath = decodeURIComponent(id);
    const loaded = await ensureAgentLoaded(this.agentManager, agentPath);
    if (!loaded) {
      return { error: "Failed to load agent" } as any;
    }
    await this.sessionManager.switchAgentSession(loaded, sessionId);
    return { success: true };
  }

  @Get(":sessionId/events")
  async getEvents(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
  ): Promise<EventsResponse> {
    const agentPath = decodeURIComponent(id);
    const loaded = await ensureAgentLoaded(this.agentManager, agentPath);
    if (!loaded) {
      return { events: [], totalCount: 0 };
    }
    return this.sessionManager.getSessionEvents(loaded, sessionId);
  }

  @Get(":sessionId/state")
  async getState(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
  ): Promise<StateResponse> {
    const agentPath = decodeURIComponent(id);
    const loaded = await ensureAgentLoaded(this.agentManager, agentPath);
    if (!loaded) {
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
    return this.sessionManager.getSessionState(loaded, sessionId);
  }

  @Put(":sessionId/state")
  async updateState(
    @Param("id") id: string,
    @Param("sessionId") sessionId: string,
    @Body() request: StateUpdateRequest,
  ) {
    const agentPath = decodeURIComponent(id);
    const loaded = await ensureAgentLoaded(this.agentManager, agentPath);
    if (!loaded) {
      return { error: "Failed to load agent" } as any;
    }
    await this.sessionManager.updateSessionState(loaded, sessionId, request.path, request.value);
    return { success: true };
  }
}