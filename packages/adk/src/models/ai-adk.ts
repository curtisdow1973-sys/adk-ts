import {
	generateText,
	streamText,
	type CoreMessage,
	type LanguageModel,
	tool,
} from "ai";
import { z } from "zod";
import { BaseLlm } from "./base-llm";
import type { LlmRequest } from "./llm-request";
import { LlmResponse } from "./llm-response";
import type { Content, Part } from "@google/genai";
import type { FunctionDeclaration } from "./function-declaration";
import type { BaseTool } from "../tools/base/base-tool";

/**
 * AI SDK integration that accepts a pre-configured LanguageModel.
 * Enables ADK to work with any provider supported by Vercel's AI SDK.
 */
export class AiSdkLlm extends BaseLlm {
	private modelInstance: LanguageModel;

	/**
	 * Constructor accepts a pre-configured LanguageModel instance
	 * @param model - Pre-configured LanguageModel from provider(modelName)
	 */
	constructor(model: LanguageModel) {
		const modelName =
			(model as any).modelId || (model as any).model || "ai-sdk-model";
		super(modelName);
		this.modelInstance = model;
	}

	/**
	 * Returns empty array - following Python ADK pattern
	 */
	static override supportedModels(): string[] {
		return [];
	}

	protected async *generateContentAsyncImpl(
		request: LlmRequest,
		stream = false,
	): AsyncGenerator<LlmResponse, void, unknown> {
		try {
			// Transform ADK request to AI SDK format
			const messages = this.transformMessages(request.contents || []);
			const system = request.getSystemInstructionText();
			const tools = this.transformTools(request.config?.tools);

			if (stream) {
				const result = streamText({
					model: this.modelInstance,
					messages,
					system,
					tools,
				});

				for await (const part of result.fullStream) {
					const response = this.streamPartToLlmResponse(part);
					this.ensureAdkCompatibility(response, request);
					yield response;
				}
			} else {
				const result = await generateText({
					model: this.modelInstance,
					messages,
					system,
					tools,
				});

				const response = this.resultToLlmResponse(result);
				this.ensureAdkCompatibility(response, request);
				yield response;
			}
		} catch (error) {
			const errorResponse = new LlmResponse({
				errorCode: "AI_SDK_ERROR",
				errorMessage: `AI SDK Error: ${String(error)}`,
				content: {
					role: "model",
					parts: [{ text: `Error: ${String(error)}` }],
				},
				finishReason: "STOP",
			});
			this.ensureAdkCompatibility(errorResponse, request);
			yield errorResponse;
		}
	}

	/**
	 * Ensures response structure matches ADK's AutoFlow expectations
	 */
	private ensureAdkCompatibility(
		response: LlmResponse,
		request: LlmRequest,
	): void {
		// Ensure basic response structure
		if (!response.content) {
			response.content = { role: "model", parts: [] };
		}
		if (!response.content.role) {
			response.content.role = "model";
		}
		if (!response.content.parts || !Array.isArray(response.content.parts)) {
			response.content.parts = [];
		}
		if (!response.usageMetadata) {
			response.usageMetadata = {
				promptTokenCount: 0,
				candidatesTokenCount: 0,
				totalTokenCount: 0,
			};
		}
		if (!response.finishReason) {
			response.finishReason = "STOP";
		}

		// Set up toolsDict with callable tools
		const toolsMap = new Map<string, BaseTool>();
		if (request.toolsDict) {
			for (const [toolName, tool] of Object.entries(request.toolsDict)) {
				toolsMap.set(toolName, tool);
			}
		}
		(response as any).toolsDict = toolsMap;

		// Set up function calls array for compatibility
		const functionCalls: any[] = [];
		for (const part of response.content.parts) {
			if ((part as any).functionCall) {
				const fc = (part as any).functionCall;
				functionCalls.push({
					name: fc.name,
					args: fc.args,
					id: fc.id,
				});
			}
		}
		(response as any).functionCalls = functionCalls;

		// Set up additional compatibility properties
		(response as any).candidates = [
			{
				content: response.content,
				finishReason: response.finishReason,
			},
		];
		(response as any).promptFeedback = {};

		const textParts = response.content.parts
			.filter((part) => part.text)
			.map((part) => part.text);
		if (textParts.length > 0) {
			(response as any).text = textParts.join("");
		}
	}

	/**
	 * Convert ADK schema to Zod schema
	 */
	private adkSchemaToZod(schema: any): z.ZodTypeAny {
		switch (schema.type?.toLowerCase()) {
			case "string":
				return z.string().describe(schema.description || "");
			case "number":
				return z.number().describe(schema.description || "");
			case "integer":
				return z
					.number()
					.int()
					.describe(schema.description || "");
			case "boolean":
				return z.boolean().describe(schema.description || "");
			case "array":
				if (schema.items) {
					return z.array(this.adkSchemaToZod(schema.items));
				}
				return z.array(z.any());
			case "object":
				if (schema.properties) {
					const shape: Record<string, z.ZodTypeAny> = {};
					for (const key in schema.properties) {
						shape[key] = this.adkSchemaToZod(schema.properties[key]);
					}
					return z.object(shape).describe(schema.description || "");
				}
				return z.object({});
			default:
				return z.any();
		}
	}

	/**
	 * Transform ADK Content[] to AI SDK CoreMessage[]
	 */
	private transformMessages(contents: Content[]): CoreMessage[] {
		const messages: CoreMessage[] = [];

		for (const content of contents) {
			const role = content.role;
			const hasFunctionResponse = content.parts?.some(
				(p) => p.functionResponse,
			);
			const hasFunctionCall = content.parts?.some(
				(p) => (p as any).functionCall,
			);

			if (role === "tool" || hasFunctionResponse) {
				for (const part of content.parts || []) {
					if (part.functionResponse) {
						const result =
							part.functionResponse.response?.result ||
							part.functionResponse.response;
						const resultString =
							typeof result === "string" ? result : JSON.stringify(result);

						messages.push({
							role: "tool",
							content: [
								{
									type: "tool-result",
									toolCallId: part.functionResponse.id || "",
									toolName: part.functionResponse.name || "unknown",
									result: resultString,
								},
							],
						});
					}
				}
			} else if (role === "model" || role === "assistant" || hasFunctionCall) {
				const textParts =
					content.parts
						?.filter((p) => p.text)
						.map((p) => p.text)
						.join("\n") || "";

				const toolCalls =
					content.parts
						?.filter((p) => (p as any).functionCall)
						.map((p) => {
							const fc = (p as any).functionCall;
							return {
								type: "tool-call" as const,
								toolCallId: fc.id || `call_${Date.now()}`,
								toolName: fc.name,
								args: fc.args || {},
							};
						}) || [];

				if (textParts.trim() || toolCalls.length > 0) {
					const messageContent: any[] = [];

					if (textParts.trim()) {
						messageContent.push({
							type: "text",
							text: textParts,
						});
					}

					messageContent.push(...toolCalls);

					messages.push({
						role: "assistant",
						content:
							messageContent.length === 1 && messageContent[0].type === "text"
								? messageContent[0].text
								: messageContent,
					});
				}
			} else {
				// User role - but skip if this was actually a tool response
				if (!hasFunctionResponse && !hasFunctionCall) {
					const textContent =
						content.parts?.map((p) => p.text || "").join("\n") || "";

					if (textContent.trim()) {
						messages.push({
							role: "user",
							content: textContent,
						});
					}
				}
			}
		}

		return messages;
	}

	/**
	 * Transform ADK FunctionDeclarations to AI SDK tools
	 */
	private transformTools(toolsConfig?: any): Record<string, any> | undefined {
		const functionDeclarations = toolsConfig?.[0]?.functionDeclarations as
			| FunctionDeclaration[]
			| undefined;

		if (!functionDeclarations || functionDeclarations.length === 0) {
			return undefined;
		}

		const transformedTools: Record<string, any> = {};

		for (const decl of functionDeclarations) {
			transformedTools[decl.name] = tool({
				description: decl.description,
				parameters: decl.parameters
					? this.adkSchemaToZod(decl.parameters)
					: z.object({}),
			});
		}

		return transformedTools;
	}

	/**
	 * Convert AI SDK result to LlmResponse
	 */
	private resultToLlmResponse(result: any): LlmResponse {
		const parts: Part[] = [];

		if (result.text?.trim()) {
			parts.push({ text: result.text });
		}

		if (result.toolCalls) {
			for (const call of result.toolCalls) {
				parts.push({
					functionCall: {
						id: call.toolCallId,
						name: call.toolName,
						args: call.args,
					},
				} as any);
			}
		}

		return new LlmResponse({
			content: { role: "model", parts },
			usageMetadata: {
				promptTokenCount: result.usage?.promptTokens || 0,
				candidatesTokenCount: result.usage?.completionTokens || 0,
				totalTokenCount: result.usage?.totalTokens || 0,
			},
			finishReason: "STOP",
		});
	}

	/**
	 * Convert AI SDK stream part to LlmResponse
	 */
	private streamPartToLlmResponse(part: any): LlmResponse {
		const parts: Part[] = [];
		let finishReason: string | undefined;

		switch (part.type) {
			case "text-delta":
				if (part.textDelta) {
					parts.push({ text: part.textDelta });
				}
				break;
			case "tool-call":
				parts.push({
					functionCall: {
						id: part.toolCallId,
						name: part.toolName,
						args: part.args,
					},
				} as any);
				break;
			case "step-finish":
				if (part.text?.trim()) {
					parts.push({ text: part.text });
				}
				break;
			case "finish":
				finishReason = part.finishReason || "STOP";
				if (part.text?.trim()) {
					parts.push({ text: part.text });
				}
				break;
			default:
				break;
		}

		// Ensure we have at least an empty text part
		if (parts.length === 0) {
			parts.push({ text: "" });
		}

		return new LlmResponse({
			content: { role: "model", parts },
			finishReason,
			partial: part.type === "text-delta" || part.type === "tool-call",
		});
	}
}
