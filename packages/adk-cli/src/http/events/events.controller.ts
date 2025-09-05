import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { EventsResponse } from "../../common/types";
import { EventsService } from "./events.service";

@ApiTags("events")
@Controller("api/agents/:id/sessions/:sessionId")
export class EventsController {
	constructor(
		@Inject(EventsService)
		private readonly events: EventsService,
	) {}

	@Get("events")
	async getEvents(
		@Param("id") id: string,
		@Param("sessionId") sessionId: string,
	): Promise<EventsResponse> {
		const agentPath = decodeURIComponent(id);
		return this.events.getEvents(agentPath, sessionId);
	}
}
