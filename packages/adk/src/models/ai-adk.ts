import {
	generateText,
	streamText,
	type CoreMessage,
	type LanguageModel,
	tool,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { BaseLlm } from "./base-llm";
import type { LlmRequest } from "./llm-request";
import { LlmResponse } from "./llm-response";
import type { Content, Part } from "@google/genai";
import type { FunctionDeclaration } from "./function-declaration";

function adkSchemaToZod(schema: any): z.ZodTypeAny {
	switch (schema.type.toLowerCase()) {
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
				return z.array(adkSchemaToZod(schema.items));
			}
			return z.array(z.any());
		case "object":
			if (schema.properties) {
				const shape: Record<string, z.ZodTypeAny> = {};
				for (const key in schema.properties) {
					shape[key] = adkSchemaToZod(schema.properties[key]);
				}
				return z.object(shape).describe(schema.description || "");
			}
			return z.object({});
		default:
			return z.any();
	}
}

/**
 * Vercel AI SDK integration for various models.
 */
export class AiSdkLlm extends BaseLlm {
	private vercelModel: LanguageModel;

	constructor(modelName: string) {
		super(modelName);
		// This can be extended with a provider map like in the previous example
		// to support Anthropic, Google, etc., through the Vercel AI SDK.
		this.vercelModel = google(modelName as any);
	}

	protected async *generateContentAsyncImpl(
		request: LlmRequest,
		stream = false,
	): AsyncGenerator<LlmResponse, void, unknown> {
		try {
			// 1. Transform ADK request to AI SDK format
			const messages = this.transformMessages(request.contents || []);
			const system = request.getSystemInstructionText();
			const tools = this.transformTools(request.config?.tools);

			// 2. Decide whether to stream or make a single call
			if (stream) {
				const result = streamText({
					model: this.vercelModel,
					messages,
					system,
					tools,
				});

				for await (const part of result.fullStream) {
					yield this.vercelStreamPartToLlmResponse(part);
				}
			} else {
				const result = await generateText({
					model: this.vercelModel,
					messages,
					system,
					tools,
				});

				yield this.vercelResultToLlmResponse(result);
			}
		} catch (error) {
			yield new LlmResponse({
				errorCode: "VERCEL_SDK_ERROR",
				errorMessage: String(error),
			});
		}
	}

	/**
	 * Transforms ADK Content[] to Vercel AI SDK CoreMessage[]
	 */
	private transformMessages(contents: Content[]): CoreMessage[] {
		const messages: CoreMessage[] = [];
		for (const content of contents) {
			const role = content.role;
			if (role === "tool") {
				// Handle tool response messages
				for (const part of content.parts || []) {
					if (part.functionResponse) {
						messages.push({
							role: "tool",
							content: [
								{
									type: "tool-result",
									toolCallId: part.functionResponse.id || "",
									toolName: part.functionResponse.name,
									result: part.functionResponse.response,
								},
							],
						});
					}
				}
			} else {
				// Handle user and assistant messages
				messages.push({
					role: role === "model" ? "assistant" : "user",
					content:
						content.parts?.map((p) => (p.text ? p.text : "")).join("\n") || "",
				});
			}
		}
		return messages;
	}

	/**
	 * Transforms ADK FunctionDeclarations into Vercel AI SDK tool definitions.
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
					? adkSchemaToZod(decl.parameters)
					: z.object({}),
			});
		}

		return transformedTools;
	}

	/**
	 * Converts a final Vercel AI SDK result to an LlmResponse.
	 */
	private vercelResultToLlmResponse(result: any): LlmResponse {
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
				promptTokenCount: result.usage.promptTokens,
				candidatesTokenCount: result.usage.completionTokens,
				totalTokenCount: result.usage.totalTokens,
			},
		});
	}

	/**
	 * Converts a single part from a Vercel AI SDK stream to an LlmResponse.
	 */
	private vercelStreamPartToLlmResponse(part: any): LlmResponse {
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
			// Usage metadata is typically available at the end of the stream
			...(part.type === "finish" && {
				usageMetadata: {
					promptTokenCount: part.usage.promptTokens,
					candidatesTokenCount: part.usage.completionTokens,
					totalTokenCount: part.usage.totalTokens,
				},
			}),
		});
	}
}
