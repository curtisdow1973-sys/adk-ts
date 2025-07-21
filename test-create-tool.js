import { createTool } from "@iqai/adk";
import * as z from "zod/v4";

// Test the createTool function works correctly
console.log("Testing createTool function...");

const testTool = createTool(
  'test_calculator',
  'A simple calculator for testing',
  z.object({
    operation: z.enum(['add', 'subtract']),
    a: z.number(),
    b: z.number()
  }),
  ({ operation, a, b }) => {
    if (operation === 'add') return { result: a + b };
    if (operation === 'subtract') return { result: a - b };
    return { error: 'Unknown operation' };
  }
);

console.log("Tool created successfully!");
console.log("Tool name:", testTool.name);
console.log("Tool declaration:", JSON.stringify(testTool.getDeclaration(), null, 2));
