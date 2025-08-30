import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type {
	AgentListResponse,
	MessageRequest,
	MessageResponse,
	MessagesResponse,
} from "../../common/types";
import type { AgentManager } from "../../core/services/agent-manager.service";
import type { SessionManager } from "../../core/services/session-manager.service";

function mapAgentsToResponse(agents: Map<string, any>): AgentListResponse[] {
	return Array.from(agents.values()).map((agent) => ({
		path: agent.absolutePath,
		name: agent.name,
		directory: agent.absolutePath,
		relativePath: agent.relativePath,
	}));
}

function createEmptyMessagesResponse(): MessagesResponse {
	return { messages: [] };
}

@Controller("api/agents")
export class AgentsController {
	constructor(
		private readonly agentManager: AgentManager,
		private readonly sessionManager: SessionManager,
	) {}

	@Get()
	listAgents(): { agents: AgentListResponse[] } {
		const agentsList = mapAgentsToResponse(this.agentManager.getAgents());
		return { agents: agentsList };
	}

	@Post("refresh")
	refreshAgents(): { agents: AgentListResponse[] } {
		const agentsDir = process.cwd();
		this.agentManager.scanAgents(agentsDir);
		const agentsList = mapAgentsToResponse(this.agentManager.getAgents());
		return { agents: agentsList };
	}

	@Get(":id/messages")
	async getAgentMessages(@Param("id") id: string): Promise<MessagesResponse> {
		const agentPath = decodeURIComponent(id);
		const loadedAgent = this.agentManager.getLoadedAgents().get(agentPath);
		if (!loadedAgent) {
			return createEmptyMessagesResponse();
		}
		const messages = await this.sessionManager.getSessionMessages(loadedAgent);
		const response: MessagesResponse = { messages };
		return response;
	}

	@Post(":id/message")
	async postAgentMessage(
		@Param("id") id: string,
		@Body() body: MessageRequest,
	): Promise<MessageResponse> {
		const agentPath = decodeURIComponent(id);
		const { message, attachments } = body || { message: "", attachments: [] };
		const responseText = await this.agentManager.sendMessageToAgent(
			agentPath,
			message,
			attachments,
		);
		const messageResponse: MessageResponse = { response: responseText };
		return messageResponse;
	}
}
