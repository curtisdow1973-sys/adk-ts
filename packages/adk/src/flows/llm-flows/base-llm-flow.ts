import {
	type BaseAgent,
	CallbackContext,
	type InvocationContext,
	ReadonlyContext,
	StreamingMode,
} from "@adk/agents";
import { Event } from "@adk/events";
import { Logger } from "@adk/helpers/logger";
import { type BaseLlm, LlmRequest, type LlmResponse } from "@adk/models";
import { traceLlmCall } from "@adk/telemetry";
import { ToolContext } from "@adk/tools";
import * as functions from "./functions";

const _ADK_AGENT_NAME_LABEL_KEY = "adk_agent_name";

export abstract class BaseLlmFlow {
	requestProcessors: Array<any> = [];
	responseProcessors: Array<any> = [];

	protected logger = new Logger({ name: "BaseLlmFlow" });

	async *runAsync(invocationContext: InvocationContext): AsyncGenerator<Event> {
		this.logger.info(`Agent '${invocationContext.agent.name}' started.`);

		let stepCount = 0;
		while (true) {
			stepCount++;
			let lastEvent: Event | null = null;
			for await (const event of this._runOneStepAsync(invocationContext)) {
				lastEvent = event;
				yield event;
			}

			if (!lastEvent || lastEvent.isFinalResponse()) {
				this.logger.info(
					`Agent '${invocationContext.agent.name}' finished after ${stepCount} steps.`,
				);
				break;
			}

			if (lastEvent.partial) {
				this.logger.error(
					"Partial event encountered. LLM max output limit may be reached.",
				);
				throw new Error(
					"Last event shouldn't be partial. LLM max output limit may be reached.",
				);
			}
		}
	}

	async *runLive(invocationContext: InvocationContext): AsyncGenerator<Event> {
		this.logger.warn("⚠️ runLive not fully implemented, delegating to runAsync");
		yield* this.runAsync(invocationContext);
	}

	async *_runOneStepAsync(
		invocationContext: InvocationContext,
	): AsyncGenerator<Event> {
		this.logger.info("Framework running one step.");

		const llmRequest = new LlmRequest();

		// Preprocessing phase
		let preprocessEventCount = 0;
		for await (const event of this._preprocessAsync(
			invocationContext,
			llmRequest,
		)) {
			preprocessEventCount++;
			yield event;
		}
		if (preprocessEventCount > 0) {
			this.logger.debug(`Preprocessing: ${preprocessEventCount} events`);
		}

		if (invocationContext.endInvocation) {
			this.logger.info("Invocation ended during preprocessing.");
			return;
		}

		// Model response phase
		const modelResponseEvent = new Event({
			id: Event.newId(),
			invocationId: invocationContext.invocationId,
			author: invocationContext.agent.name,
			branch: invocationContext.branch,
		});

		let llmResponseCount = 0;
		for await (const llmResponse of this._callLlmAsync(
			invocationContext,
			llmRequest,
			modelResponseEvent,
		)) {
			llmResponseCount++;

			for await (const event of this._postprocessAsync(
				invocationContext,
				llmRequest,
				llmResponse,
				modelResponseEvent,
			)) {
				modelResponseEvent.id = Event.newId();
				yield event;
			}
		}

		if (llmResponseCount > 0) {
			this.logger.debug(`LLM processed ${llmResponseCount} responses`);
		}
	}

	async *_preprocessAsync(
		invocationContext: InvocationContext,
		llmRequest: LlmRequest,
	): AsyncGenerator<Event> {
		const agent = invocationContext.agent;
		if (
			!("canonicalTools" in agent) ||
			typeof agent.canonicalTools !== "function"
		) {
			return;
		}

		// Run request processors
		for (const processor of this.requestProcessors) {
			for await (const event of processor.runAsync(
				invocationContext,
				llmRequest,
			)) {
				yield event;
			}
		}

		// Process canonical tools
		const tools = await agent.canonicalTools(
			new ReadonlyContext(invocationContext),
		);

		for (const tool of tools) {
			const toolContext = new ToolContext(invocationContext);
			await tool.processLlmRequest(toolContext, llmRequest);
		}

		if (tools.length > 0) {
			this.logger.info(`Framework processed ${tools.length} tools.`);
		}
	}

	async *_postprocessAsync(
		invocationContext: InvocationContext,
		llmRequest: LlmRequest,
		llmResponse: LlmResponse,
		modelResponseEvent: Event,
	): AsyncGenerator<Event> {
		// Run response processors
		let processorEventCount = 0;
		for await (const event of this._postprocessRunProcessorsAsync(
			invocationContext,
			llmResponse,
		)) {
			processorEventCount++;
			yield event;
		}

		if (
			!llmResponse.content &&
			!llmResponse.errorCode &&
			!llmResponse.interrupted
		) {
			return;
		}

		// Finalize model response event
		const finalizedEvent = this._finalizeModelResponseEvent(
			llmRequest,
			llmResponse,
			modelResponseEvent,
		);

		yield finalizedEvent;

		// Handle function calls
		const functionCalls = finalizedEvent.getFunctionCalls();
		if (functionCalls) {
			this.logger.info(
				`Framework processed ${functionCalls.length} function calls.`,
			);
			let functionEventCount = 0;
			for await (const event of this._postprocessHandleFunctionCallsAsync(
				invocationContext,
				finalizedEvent,
				llmRequest,
			)) {
				functionEventCount++;
				yield event;
			}

			this.logger.debug(
				`Processed ${functionCalls.length} function calls → ${functionEventCount} events`,
			);
		}

		if (processorEventCount > 0) {
			this.logger.debug(`Response processors: ${processorEventCount} events`);
		}
	}

	async *_postprocessLive(
		invocationContext: InvocationContext,
		llmRequest: LlmRequest,
		llmResponse: LlmResponse,
		modelResponseEvent: Event,
	): AsyncGenerator<Event> {
		this.logger.info("Framework live postprocessing started.");

		// Run processors
		for await (const event of this._postprocessRunProcessorsAsync(
			invocationContext,
			llmResponse,
		)) {
			this.logger.debug("📤 Live response processor event", {
				eventId: event.id,
			});
			yield event;
		}

		// Skip model response event if no content, error, or turn completion
		// This handles live-specific cases like turn_complete
		if (
			!llmResponse.content &&
			!llmResponse.errorCode &&
			!llmResponse.interrupted &&
			!(llmResponse as any).turnComplete
		) {
			this.logger.debug(
				"ℹ️ Skipping live event - no content or completion signal",
			);
			return;
		}

		// Build the event
		const finalizedEvent = this._finalizeModelResponseEvent(
			llmRequest,
			llmResponse,
			modelResponseEvent,
		);

		this.logger.debug("📝 Finalized live model response event", {
			eventId: finalizedEvent.id,
			hasFunctionCalls: !!finalizedEvent.getFunctionCalls(),
		});

		yield finalizedEvent;

		// Handle function calls for live mode
		if (finalizedEvent.getFunctionCalls()) {
			this.logger.debug("🔧 Processing live function calls");

			// TODO: Implement functions.handleFunctionCallsLive when available
			const functionResponseEvent = await functions.handleFunctionCallsAsync(
				invocationContext,
				finalizedEvent,
				(llmRequest as any).toolsDict || {},
			);

			if (functionResponseEvent) {
				this.logger.debug("📤 Live function response event", {
					eventId: functionResponseEvent.id,
					hasTransfer: !!functionResponseEvent.actions?.transferToAgent,
				});

				yield functionResponseEvent;

				const transferToAgent = functionResponseEvent.actions?.transferToAgent;
				if (transferToAgent) {
					this.logger.info(
						`Framework transferred to agent '${transferToAgent}'.`,
					);

					const agentToRun = this._getAgentToRun(
						invocationContext,
						transferToAgent,
					);

					let transferEventCount = 0;
					for await (const event of agentToRun.runLive?.(invocationContext) ||
						agentToRun.runAsync(invocationContext)) {
						transferEventCount++;
						this.logger.debug(`📤 Transfer agent event ${transferEventCount}`, {
							eventId: event.id,
						});
						yield event;
					}

					this.logger.debug("✅ Agent transfer completed", {
						eventCount: transferEventCount,
					});
				}
			}
		}

		this.logger.info("Framework live postprocessing completed.");
	}

	async *_postprocessRunProcessorsAsync(
		invocationContext: InvocationContext,
		llmResponse: LlmResponse,
	): AsyncGenerator<Event> {
		for (const processor of this.responseProcessors) {
			for await (const event of processor.runAsync(
				invocationContext,
				llmResponse,
			)) {
				yield event;
			}
		}
	}

	async *_postprocessHandleFunctionCallsAsync(
		invocationContext: InvocationContext,
		functionCallEvent: Event,
		llmRequest: LlmRequest,
	): AsyncGenerator<Event> {
		const functionResponseEvent = await functions.handleFunctionCallsAsync(
			invocationContext,
			functionCallEvent,
			(llmRequest as any).toolsDict || {},
		);

		if (functionResponseEvent) {
			const authEvent = functions.generateAuthEvent(
				invocationContext,
				functionResponseEvent,
			);

			if (authEvent) {
				yield authEvent;
			}

			yield functionResponseEvent;

			const transferToAgent = functionResponseEvent.actions?.transferToAgent;
			if (transferToAgent) {
				const agentToRun = this._getAgentToRun(
					invocationContext,
					transferToAgent,
				);

				let transferEventCount = 0;
				for await (const event of agentToRun.runAsync(invocationContext)) {
					transferEventCount++;
					yield event;
				}

				this.logger.debug(
					`Transferred to agent ${transferToAgent} → ${transferEventCount} events`,
				);
			}
		}
	}

	_getAgentToRun(
		invocationContext: InvocationContext,
		agentName: string,
	): BaseAgent {
		const rootAgent = invocationContext.agent.rootAgent;
		const agentToRun = rootAgent.findAgent(agentName);

		if (!agentToRun) {
			this.logger.error(`Agent '${agentName}' not found in the agent tree.`);
			throw new Error(`Agent ${agentName} not found in the agent tree.`);
		}

		return agentToRun;
	}

	async *_callLlmAsync(
		invocationContext: InvocationContext,
		llmRequest: LlmRequest,
		modelResponseEvent: Event,
	): AsyncGenerator<LlmResponse> {
		// Before model callback
		const beforeModelCallbackContent = await this._handleBeforeModelCallback(
			invocationContext,
			llmRequest,
			modelResponseEvent,
		);

		if (beforeModelCallbackContent) {
			yield beforeModelCallbackContent;
			return;
		}

		// Initialize config and labels
		llmRequest.config = llmRequest.config || {};
		llmRequest.config.labels = llmRequest.config.labels || {};

		// Add agent name as label for billing/tracking
		if (!(_ADK_AGENT_NAME_LABEL_KEY in llmRequest.config.labels)) {
			llmRequest.config.labels[_ADK_AGENT_NAME_LABEL_KEY] =
				invocationContext.agent.name;
		}

		const llm = this.__getLlm(invocationContext);

		// Check for CFC (Continuous Function Calling) support
		const runConfig = invocationContext.runConfig;
		if ((runConfig as any).supportCfc) {
			this.logger.warn(
				"CFC (supportCfc) not fully implemented, using standard flow.",
			);
		}

		// Standard LLM call flow
		invocationContext.incrementLlmCallCount();

		const isStreaming =
			invocationContext.runConfig.streamingMode === StreamingMode.SSE;

		let responseCount = 0;
		for await (const llmResponse of llm.generateContentAsync(
			llmRequest,
			isStreaming,
		)) {
			responseCount++;

			// Telemetry tracing
			traceLlmCall(
				invocationContext,
				modelResponseEvent.id,
				llmRequest,
				llmResponse,
			);

			// After model callback
			const alteredLlmResponse = await this._handleAfterModelCallback(
				invocationContext,
				llmResponse,
				modelResponseEvent,
			);

			yield alteredLlmResponse || llmResponse;
		}

		if (responseCount > 0) {
			this.logger.debug(`${llm.model} → ${responseCount} responses`);
		}
	}

	async _handleBeforeModelCallback(
		invocationContext: InvocationContext,
		llmRequest: LlmRequest,
		modelResponseEvent: Event,
	): Promise<LlmResponse | undefined> {
		const agent = invocationContext.agent;

		// Check if agent has LlmAgent-like structure
		if (!("canonicalBeforeModelCallbacks" in agent)) {
			return;
		}

		const beforeCallbacks = (agent as any).canonicalBeforeModelCallbacks;
		if (!beforeCallbacks) {
			return;
		}

		const callbackContext = new CallbackContext(invocationContext, {
			eventActions: modelResponseEvent.actions,
		});

		for (const callback of beforeCallbacks) {
			let beforeModelCallbackContent = callback({
				callbackContext,
				llmRequest,
			});

			if (beforeModelCallbackContent instanceof Promise) {
				beforeModelCallbackContent = await beforeModelCallbackContent;
			}

			if (beforeModelCallbackContent) {
				return beforeModelCallbackContent;
			}
		}
	}

	async _handleAfterModelCallback(
		invocationContext: InvocationContext,
		llmResponse: LlmResponse,
		modelResponseEvent: Event,
	): Promise<LlmResponse | undefined> {
		const agent = invocationContext.agent;

		// Check if agent has LlmAgent-like structure
		if (!("canonicalAfterModelCallbacks" in agent)) {
			return;
		}

		const afterCallbacks = (agent as any).canonicalAfterModelCallbacks;
		if (!afterCallbacks) {
			return;
		}

		const callbackContext = new CallbackContext(invocationContext, {
			eventActions: modelResponseEvent.actions,
		});

		for (const callback of afterCallbacks) {
			let afterModelCallbackContent = callback({
				callbackContext,
				llmResponse,
			});

			if (afterModelCallbackContent instanceof Promise) {
				afterModelCallbackContent = await afterModelCallbackContent;
			}

			if (afterModelCallbackContent) {
				return afterModelCallbackContent;
			}
		}
	}

	_finalizeModelResponseEvent(
		llmRequest: LlmRequest,
		llmResponse: LlmResponse,
		modelResponseEvent: Event,
	): Event {
		// Python uses Pydantic model_validate with model_dump - we'll use object spreading
		const eventData = { ...modelResponseEvent } as any;
		const responseData = { ...llmResponse } as any;

		// Merge excluding null/undefined values (similar to exclude_none=True)
		Object.keys(responseData).forEach((key) => {
			if (responseData[key] !== null && responseData[key] !== undefined) {
				eventData[key] = responseData[key];
			}
		});

		const event = new Event(eventData);

		if (event.content) {
			const functionCalls = event.getFunctionCalls();
			if (functionCalls) {
				functions.populateClientFunctionCallId(event);
				event.longRunningToolIds = functions.getLongRunningFunctionCalls(
					functionCalls,
					(llmRequest as any).toolsDict || {},
				);
			}
		}

		return event;
	}

	__getLlm(invocationContext: InvocationContext): BaseLlm {
		const llm = (invocationContext.agent as any).canonicalModel;
		return llm;
	}
}
