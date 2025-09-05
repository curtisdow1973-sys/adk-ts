import { Body, Controller, Get, Inject, Param, Put } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { StateResponse, StateUpdateRequest } from "../../common/types";
import { StateService } from "./state.service";

@ApiTags("state")
@Controller("api/agents/:id/sessions/:sessionId")
export class StateController {
	constructor(
		@Inject(StateService)
		private readonly state: StateService,
	) {}

	@Get("state")
	async getState(
		@Param("id") id: string,
		@Param("sessionId") sessionId: string,
	): Promise<StateResponse> {
		const agentPath = decodeURIComponent(id);
		return this.state.getState(agentPath, sessionId);
	}

	@Put("state")
	async updateState(
		@Param("id") id: string,
		@Param("sessionId") sessionId: string,
		@Body() request: StateUpdateRequest,
	) {
		const agentPath = decodeURIComponent(id);
		return this.state.updateState(
			agentPath,
			sessionId,
			request.path,
			request.value,
		);
	}
}
