import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiParam } from "@nestjs/swagger";
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
	@ApiOperation({
		summary: "Get session events",
		description:
			"Returns chronological events for a specific agent session including actions, function calls, and responses.",
	})
	@ApiParam({ name: "id", description: "URL-encoded absolute agent path or identifier" })
	@ApiParam({ name: "sessionId", description: "Target session identifier" })
	async getEvents(
		@Param("id") id: string,
		@Param("sessionId") sessionId: string,
	): Promise<EventsResponse> {
		const agentPath = decodeURIComponent(id);
		return this.events.getEvents(agentPath, sessionId);
	}
}
