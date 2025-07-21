import * as z from "zod/v4";
import type {
	FunctionDeclaration,
	JSONSchema,
} from "../../models/function-declaration";
import type { ToolContext } from "../tool-context";
import { BaseTool } from "./base-tool";

/**
 * Configuration options for createTool
 */
export interface CreateToolOptions {
	/** Whether the tool is a long running operation */
	isLongRunning?: boolean;
	/** Whether the tool execution should be retried on failure */
	shouldRetryOnFailure?: boolean;
	/** Maximum retry attempts */
	maxRetryAttempts?: number;
}

/**
 * A tool implementation created by createTool
 */
class CreatedTool<T extends Record<string, any>> extends BaseTool {
	private func: (args: T, context?: ToolContext) => any;
	private schema: z.ZodSchema<T>;
	private functionDeclaration: FunctionDeclaration;

	constructor(
		name: string,
		description: string,
		schema: z.ZodSchema<T>,
		func: (args: T, context?: ToolContext) => any,
		options: CreateToolOptions = {},
	) {
		super({
			name,
			description,
			isLongRunning: options.isLongRunning || false,
			shouldRetryOnFailure: options.shouldRetryOnFailure || false,
			maxRetryAttempts: options.maxRetryAttempts || 3,
		});

		this.func = func;
		this.schema = schema;
		this.functionDeclaration = this.buildDeclaration();
	}

	/**
	 * Executes the tool function with validation
	 */
	async runAsync(args: any, context: ToolContext): Promise<any> {
		try {
			// Validate arguments using Zod schema
			const validatedArgs = this.schema.parse(args);

			// Check if function accepts context parameter
			const funcAcceptsContext = this.func.length > 1;

			// Call the function with validated arguments
			let result: any;
			if (funcAcceptsContext) {
				if (this.isAsyncFunction(this.func)) {
					result = await this.func(validatedArgs, context);
				} else {
					result = this.func(validatedArgs, context);
				}
			} else {
				if (this.isAsyncFunction(this.func)) {
					result = await this.func(validatedArgs);
				} else {
					result = this.func(validatedArgs);
				}
			}

			// Ensure we return an object
			return result || {};
		} catch (error) {
			if (error instanceof z.ZodError) {
				return {
					error: `Invalid arguments for ${this.name}: ${error.issues
						.map((e) => `${e.path.join(".")}: ${e.message}`)
						.join(", ")}`,
				};
			}

			return {
				error: `Error executing ${this.name}: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Returns the function declaration for this tool
	 */
	getDeclaration(): FunctionDeclaration {
		return this.functionDeclaration;
	}

	/**
	 * Builds the function declaration from the Zod schema
	 */
	private buildDeclaration(): FunctionDeclaration {
		const parameters = z.toJSONSchema(this.schema) as JSONSchema;

		return {
			name: this.name,
			description: this.description,
			parameters,
		};
	}

	/**
	 * Checks if the function is async
	 */
	private isAsyncFunction(func: (...args: any[]) => any): boolean {
		return func.constructor.name === "AsyncFunction";
	}
}

/**
 * Creates a tool from a name, description, Zod schema, and function.
 *
 * This is a more user-friendly alternative to FunctionTool that provides:
 * - Automatic argument validation using Zod schemas
 * - Clear error messages for invalid inputs
 * - Automatic JSON Schema generation for LLM function declarations
 * - Support for both sync and async functions
 * - Optional ToolContext parameter support
 *
 * @param name The name of the tool
 * @param description A description of what the tool does
 * @param schema Zod schema for validating tool arguments
 * @param func The function to execute (can be sync or async)
 * @param options Optional configuration for the tool
 * @returns A BaseTool instance ready for use with agents
 *
 * @example
 * ```typescript
 * import { createTool } from '@iqai/adk';
 * import { z } from 'zod';
 *
 * const calculatorTool = createTool(
 *   'calculator',
 *   'Performs basic arithmetic operations',
 *   z.object({
 *     operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
 *     a: z.number().describe('First number'),
 *     b: z.number().describe('Second number')
 *   }),
 *   ({ operation, a, b }) => {
 *     switch (operation) {
 *       case 'add': return { result: a + b };
 *       case 'subtract': return { result: a - b };
 *       case 'multiply': return { result: a * b };
 *       case 'divide': return { result: b !== 0 ? a / b : 'Cannot divide by zero' };
 *       default: return { error: 'Unknown operation' };
 *     }
 *   }
 * );
 * ```
 */
export function createTool<T extends Record<string, any>>(
	name: string,
	description: string,
	schema: z.ZodSchema<T>,
	func: (args: T, context?: ToolContext) => any,
	options: CreateToolOptions = {},
): BaseTool {
	return new CreatedTool(name, description, schema, func, options);
}
