import { Body, Controller, Get, Inject, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
	MessageRequest,
	MessageResponse,
	MessagesResponse,
} from "../../common/types";
import { MessagingService } from "./messaging.service";

@ApiTags("messaging")
@Controller("api/agents/:id")
export class MessagingController {
	constructor(
		@Inject(MessagingService)
		private readonly messaging: MessagingService,
	) {}

	@Get("messages")
	async getAgentMessages(@Param("id") id: string): Promise<MessagesResponse> {
		const agentPath = decodeURIComponent(id);
		return this.messaging.getMessages(agentPath);
	}

	@Post("message")
	async postAgentMessage(
		@Param("id") id: string,
		@Body() body: MessageRequest,
	): Promise<MessageResponse> {
		const agentPath = decodeURIComponent(id);
		return this.messaging.postMessage(agentPath, body);
	}
}
