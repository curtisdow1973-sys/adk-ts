import { describe, expect, it, vi } from "vitest";
import * as z from "zod/v4";
import { createTool } from "../../tools/base/create-tool";
import { ToolContext } from "../../tools/tool-context";

describe("createTool", () => {
	const mockContext: ToolContext = {
		sessionId: "test-session",
		userId: "test-user",
		appName: "test-app",
	} as ToolContext;

	describe("Tool with schema", () => {
		it("should create a tool with schema and proper type inference", () => {
			const tool = createTool({
				name: "calculator",
				description: "Adds two numbers",
				schema: z.object({
					a: z.number().describe("First number"),
					b: z.number().describe("Second number"),
				}),
				fn: ({ a, b }) => ({ result: a + b }),
			});

			expect(tool.name).toBe("calculator");
			expect(tool.description).toBe("Adds two numbers");
			expect(tool.isLongRunning).toBe(false);
			expect(tool.shouldRetryOnFailure).toBe(false);
			expect(tool.maxRetryAttempts).toBe(3);
		});

		it("should generate correct function declaration with schema", () => {
			const tool = createTool({
				name: "calculator",
				description: "Adds two numbers",
				schema: z.object({
					a: z.number().describe("First number"),
					b: z.number().describe("Second number"),
				}),
				fn: ({ a, b }) => ({ result: a + b }),
			});

			const declaration = tool.getDeclaration();
			expect(declaration.name).toBe("calculator");
			expect(declaration.description).toBe("Adds two numbers");
			expect(declaration.parameters).toEqual({
				type: "object",
				properties: {
					a: {
						type: "number",
						description: "First number",
					},
					b: {
						type: "number",
						description: "Second number",
					},
				},
				required: ["a", "b"],
			});
		});

		it("should execute function with validated arguments", async () => {
			const mockFn = vi.fn(({ a, b }) => ({ result: a + b }));
			const tool = createTool({
				name: "calculator",
				description: "Adds two numbers",
				schema: z.object({
					a: z.number(),
					b: z.number(),
				}),
				fn: mockFn,
			});

			const result = await tool.runAsync({ a: 5, b: 3 }, mockContext);
			expect(result).toEqual({ result: 8 });
			expect(mockFn).toHaveBeenCalledWith({ a: 5, b: 3 });
		});
	});

	describe("Tool without schema", () => {
		it("should create a tool without schema", () => {
			const tool = createTool({
				name: "timestamp",
				description: "Gets the current timestamp",
				fn: () => ({ timestamp: Date.now() }),
			});

			expect(tool.name).toBe("timestamp");
			expect(tool.description).toBe("Gets the current timestamp");
			expect(tool.isLongRunning).toBe(false);
			expect(tool.shouldRetryOnFailure).toBe(false);
			expect(tool.maxRetryAttempts).toBe(3);
		});

		it("should generate correct function declaration without schema", () => {
			const tool = createTool({
				name: "timestamp",
				description: "Gets the current timestamp",
				fn: () => ({ timestamp: Date.now() }),
			});

			const declaration = tool.getDeclaration();
			expect(declaration.name).toBe("timestamp");
			expect(declaration.description).toBe("Gets the current timestamp");
			expect(declaration.parameters).toEqual({
				type: "object",
				properties: {},
			});
		});

		it("should execute function without arguments", async () => {
			const mockFn = vi.fn(() => ({ timestamp: 123456789 }));
			const tool = createTool({
				name: "timestamp",
				description: "Gets the current timestamp",
				fn: mockFn,
			});

			const result = await tool.runAsync({}, mockContext);
			expect(result).toEqual({ timestamp: 123456789 });
			expect(mockFn).toHaveBeenCalledWith({});
		});

		it("should support optional configuration parameters", () => {
			const tool = createTool({
				name: "greeting",
				description: "Returns a greeting message",
				fn: () => ({ message: "Hello, World!" }),
				isLongRunning: true,
				shouldRetryOnFailure: true,
				maxRetryAttempts: 5,
			});

			expect(tool.isLongRunning).toBe(true);
			expect(tool.shouldRetryOnFailure).toBe(true);
			expect(tool.maxRetryAttempts).toBe(5);
		});
	});

	describe("Error handling", () => {
		it("should handle validation errors for tools with schema", async () => {
			const tool = createTool({
				name: "calculator",
				description: "Adds two numbers",
				schema: z.object({
					a: z.number(),
					b: z.number(),
				}),
				fn: ({ a, b }) => ({ result: a + b }),
			});

			const result = await tool.runAsync({ a: "invalid", b: 3 }, mockContext);
			expect(result.error).toContain("Invalid arguments for calculator");
		});

		it("should handle function execution errors", async () => {
			const tool = createTool({
				name: "error_tool",
				description: "A tool that throws an error",
				fn: () => {
					throw new Error("Test error");
				},
			});

			const result = await tool.runAsync({}, mockContext);
			expect(result.error).toContain("Error executing error_tool: Test error");
		});
	});
});
