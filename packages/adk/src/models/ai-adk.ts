import { generateText, type CoreMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { BaseLlm } from "./base-llm";
import type { LlmRequest } from "./llm-request";
import { LlmResponse } from "./llm-response";

/**
 * Vercel AI SDK integration
 */
export class AiSdkLlm extends BaseLlm {
	private vercelModel: any;

	constructor(modelName: string) {
		super(modelName);
		this.vercelModel = openai(modelName);
	}

	protected async *generateContentAsyncImpl(
		request: LlmRequest,
	): AsyncGenerator<LlmResponse, void, unknown> {
		try {
			// Transform ADK to AI sdk format
			const result = await generateText({
				model: this.vercelModel,
				messages:
					(request.contents?.map((c) => ({
						role: c.role === "model" ? "assistant" : c.role,
						content: c.parts?.map((p) => p.text).join("") || "",
					})) as CoreMessage[]) || [],
				system: request.getSystemInstructionText(),
			});

			yield new LlmResponse({
				content: {
					role: "model",
					parts: [{ text: result.text }],
				},
			});
		} catch (error) {
			yield new LlmResponse({
				errorCode: "VERCEL_SDK_ERROR",
				errorMessage: String(error),
			});
		}
	}
}
