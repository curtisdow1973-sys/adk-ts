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

/**
 * AI SDK integration that accepts a pre-configured LanguageModel.
 */
export class AiSdkLlm extends BaseLlm {
	private modelInstance: LanguageModel;

	/**
	 * Constructor accepts model name and provider function
	 * @param modelName - Model name (e.g., "gemini-2.5-pro", "gpt-4o")
	 * @param provider - Provider function (e.g., google, openai, anthropic)
	 */
	constructor(modelName: string, provider: any) {
		if (!provider || typeof provider !== "function") {
			throw new Error("Provider function is required");
		}

		super(modelName);
		this.modelInstance = provider(modelName);
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
				yield response;
			}
		} catch (error) {
			const errorResponse = new LlmResponse({
				errorCode: "AI_SDK_ERROR",
				errorMessage: `AI SDK Error: ${String(error)}`,
			});
			yield errorResponse;
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

			if (role === "tool") {
				for (const part of content.parts || []) {
					if (part.functionResponse) {
						messages.push({
							role: "tool",
							content: [
								{
									type: "tool-result",
									toolCallId: part.functionResponse.id || "",
									toolName: part.functionResponse.name || "unknown",
									result:
										part.functionResponse.response?.result ||
										part.functionResponse.response,
								},
							],
						});
					}
				}
			} else if (role === "model" || role === "assistant") {
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

				if (textParts || toolCalls.length > 0) {
					const messageContent: any[] = [];

					if (textParts) {
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
				// User role
				const textContent =
					content.parts?.map((p) => p.text || "").join("\n") || "";

				if (textContent) {
					messages.push({
						role: "user",
						content: textContent,
					});
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

		if (result.text) {
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
				});
			}
		}

		return new LlmResponse({
			content: { role: "model", parts },
			usageMetadata: {
				promptTokenCount: result.usage?.promptTokens || 0,
				candidatesTokenCount: result.usage?.completionTokens || 0,
				totalTokenCount: result.usage?.totalTokens || 0,
			},
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
				parts.push({ text: part.textDelta });
				break;
			case "tool-call":
				parts.push({
					functionCall: {
						id: part.toolCallId,
						name: part.toolName,
						args: part.args,
					},
				});
				break;
			case "finish":
				finishReason = part.finishReason;
				break;
		}

		return new LlmResponse({
			content: { role: "model", parts },
			finishReason,
			partial: part.type === "text-delta",
		});
	}
}
