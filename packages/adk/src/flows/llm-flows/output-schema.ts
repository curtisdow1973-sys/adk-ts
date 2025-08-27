import { jsonrepair } from "jsonrepair";
import type { InvocationContext } from "../../agents/invocation-context";
import { Event } from "../../events/event";
import { Logger } from "../../logger";
import type { LlmResponse } from "../../models/llm-response";
import { BaseLlmResponseProcessor } from "./base-llm-processor";

/**
 * Response processor for Output Schema validation and parsing
 *
 * This processor validates and parses LLM responses against the agent's output schema if specified.
 * It runs during the response processing phase and ensures that the response content conforms to
 * the expected structure defined by the agent's Zod schema.
 *
 * Key features:
 * - Validates JSON responses against Zod schemas
 * - Parses and formats valid responses
 * - Generates detailed error events for validation failures
 * - Updates response content with validated, typed data
 *
 * The processor only runs for agents that have an outputSchema configured and skips
 * processing for responses without content or for agents without schemas.
 */
class OutputSchemaResponseProcessor extends BaseLlmResponseProcessor {
	private logger = new Logger({ name: "OutputSchemaResponseProcessor" });

	async *runAsync(
		invocationContext: InvocationContext,
		llmResponse: LlmResponse,
	): AsyncGenerator<Event> {
		// Check if response has content to process
		if (
			!llmResponse ||
			!llmResponse.content ||
			!llmResponse.content.parts ||
			llmResponse.content.parts.length === 0
		) {
			return;
		}

		const agent = invocationContext.agent;

		// Only process agents with output schema
		if (!("outputSchema" in agent) || !agent.outputSchema) {
			return;
		}

		// Extract text content from response parts
		let textContent = llmResponse.content.parts
			.map((part) => {
				if (part && typeof part === "object" && "text" in part) {
					return part.text || "";
				}
				return "";
			})
			.join("");

		// Skip empty content
		if (!textContent.trim()) {
			return;
		}

		// Helper: strip common code fences and surrounding explanatory text
		function stripCodeFences(raw: string): string {
			// Prefer explicit triple-backtick fenced blocks (```json or ```)
			const fencePattern = /```(?:json)?\s*([\s\S]*?)```/i;
			const fenceMatch = raw.match(fencePattern);
			if (fenceMatch?.[1]) {
				return fenceMatch[1].trim();
			}

			// Some models include inline single-line backticks or surrounding explanatory lines.
			// Remove lines that look like prose before the JSON (e.g. "Here's the JSON:")
			const lines = raw.split(/\r?\n/).map((l) => l.trim());
			// Find first line that looks like it starts with { or [
			const startIdx = lines.findIndex(
				(l) => l.startsWith("{") || l.startsWith("["),
			);
			if (startIdx >= 0) {
				return lines.slice(startIdx).join("\n").trim();
			}

			return raw.trim();
		}

		try {
			// Prepare candidate JSON text by stripping fences and simple prefixes
			const candidate = stripCodeFences(textContent);

			// Try a normal parse first, fall back to jsonrepair if available
			let parsed: any;
			try {
				parsed = JSON.parse(candidate);
			} catch (err) {
				// Try jsonrepair (throws if it can't repair)
				try {
					this.logger.debug(
						"Initial JSON.parse failed, attempting jsonrepair",
						{
							agent: agent.name,
						},
					);
					const repaired = jsonrepair(candidate as string);
					parsed = JSON.parse(repaired);
					this.logger.debug("jsonrepair successful", { agent: agent.name });
				} catch (repairErr) {
					// If repair also fails, rethrow the original parse error to be handled below
					throw err;
				}
			}

			const validated = (agent.outputSchema as any).parse(parsed);

			// Update the response content with validated data
			// This ensures downstream processors get the validated, typed data
			textContent = JSON.stringify(validated, null, 2);

			// Update the response parts with the validated content
			llmResponse.content.parts = llmResponse.content.parts.map((part) => {
				if (part && typeof part === "object" && "text" in part) {
					return {
						...part,
						text: textContent,
					};
				}
				return part;
			});

			this.logger.debug("Output schema validation successful", {
				agent: agent.name,
				originalLength: textContent.length,
				validatedKeys: Object.keys(validated),
			});
		} catch (error) {
			// Create error message with detailed information
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const detailedError = `Output schema validation failed for agent '${agent.name}': ${errorMessage}`;

			this.logger.error(detailedError, {
				agent: agent.name,
				responseContent:
					textContent.substring(0, 200) +
					(textContent.length > 200 ? "..." : ""),
				error: errorMessage,
			});

			// Update response with error information
			llmResponse.errorCode = "OUTPUT_SCHEMA_VALIDATION_FAILED";
			llmResponse.errorMessage = detailedError;
			llmResponse.error = new Error(detailedError);

			// Create error event
			const errorEvent = new Event({
				id: Event.newId(),
				invocationId: invocationContext.invocationId,
				author: agent.name,
				branch: invocationContext.branch,
				content: {
					role: "assistant",
					parts: [
						{
							text: `Error: ${detailedError}`,
						},
					],
				},
			});

			// Set error properties on the event (it extends LlmResponse)
			errorEvent.errorCode = "OUTPUT_SCHEMA_VALIDATION_FAILED";
			errorEvent.errorMessage = detailedError;
			errorEvent.error = new Error(detailedError);

			yield errorEvent;
		}
	}
}

/**
 * Export the response processor instance
 */
export const responseProcessor = new OutputSchemaResponseProcessor();
