import {
	generateText,
	streamText,
	type CoreMessage,
	type LanguageModel,
	tool,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { BaseLlm } from "./base-llm";
import type { LlmRequest } from "./llm-request";
import { LlmResponse } from "./llm-response";
import type { Content, Part } from "@google/genai";
import type { FunctionDeclaration } from "./function-declaration";
import { v4 as uuidv4 } from "uuid";

type ProviderType = "openai" | "anthropic" | "google";

/**
 * Vercel AI SDK integration for various models.
 */
export class AiSdkLlm extends BaseLlm {
	private vercelModel: LanguageModel;
	private provider: ProviderType;

	constructor(modelName: string) {
		super(modelName);

		if (modelName.startsWith("gemini")) {
			this.provider = "google";
			this.vercelModel = google(modelName);
		} else if (modelName.startsWith("claude")) {
			this.provider = "anthropic";
			this.vercelModel = anthropic(modelName);
		} else if (
			modelName.startsWith("gpt") ||
			modelName.startsWith("o1") ||
			modelName.startsWith("o3")
		) {
			this.provider = "openai";
			this.vercelModel = openai(modelName);
		} else {
			throw new Error(
				`Unsupported model provider for: ${modelName}. Please use a model name with a known prefix (e.g., 'gemini', 'claude', 'gpt', 'o1', 'o3').`,
			);
		}

		console.log(
			`🤖 Initialized ${this.provider} provider for model: ${modelName}`,
		);
	}

	/**
	 * Gets the detected provider type
	 */
	getProvider(): ProviderType {
		return this.provider;
	}

	/**
	 * Returns supported model patterns for registry registration
	 */
	static override supportedModels(): string[] {
		return [
			// OpenAI patterns
			"gpt-.*",
			"o1-.*",
			"o3-.*",

			// Anthropic patterns
			"claude-.*",

			// Google patterns
			"gemini-.*",
		];
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

			if (stream) {
				const result = streamText({
					model: this.vercelModel,
					messages,
					system,
					tools,
				});

				for await (const part of result.fullStream) {
					const response = this.vercelStreamPartToLlmResponse(part);
					this.setToolsDict(response, request);
					yield response;
				}
			} else {
				const result = await generateText({
					model: this.vercelModel,
					messages,
					system,
					tools,
				});

				const response = this.vercelResultToLlmResponse(result);
				this.setToolsDict(response, request);
				yield response;
			}
		} catch (error) {
			const errorResponse = new LlmResponse({
				errorCode: "VERCEL_SDK_ERROR",
				errorMessage: `${this.provider.toUpperCase()}_ERROR: ${String(error)}`,
			});
			this.setToolsDict(errorResponse, request);
			yield errorResponse;
		}
	}

	// Helper method to convert ADK schema to Zod
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
	 * Set toolsDict as Map
	 */
	private setToolsDict(response: LlmResponse, request: LlmRequest): void {
		if (request.toolsDict) {
			const toolsMap = new Map();
			for (const [key, value] of Object.entries(request.toolsDict)) {
				toolsMap.set(key, value);
			}
			(response as any).toolsDict = toolsMap;
		} else {
			(response as any).toolsDict = new Map();
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
								toolCallId: fc.id || `call_${uuidv4()}`,
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
				const textContent =
					content.parts?.map((p) => (p.text ? p.text : "")).join("\n") || "";
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
	 * Transforms ADK FunctionDeclarations into Vercel AI SDK tool definitions
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
	 * Converts a final Vercel AI SDK result to an LlmResponse
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
				promptTokenCount: result.usage?.promptTokens || 0,
				candidatesTokenCount: result.usage?.completionTokens || 0,
				totalTokenCount: result.usage?.totalTokens || 0,
			},
		});
	}

	/**
	 * Converts a single part from a Vercel AI SDK stream to an LlmResponse
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
		});
	}
}
