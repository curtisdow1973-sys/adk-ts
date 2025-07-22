import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBuilder } from "../../agents/agent-builder.js";
import { InMemoryArtifactService } from "../../artifacts/in-memory-artifact-service.js";
import { InMemoryMemoryService } from "../../memory/in-memory-memory-service.js";
import { InMemorySessionService } from "../../sessions/in-memory-session-service.js";

describe("AgentBuilder - New API", () => {
	let sessionService: InMemorySessionService;
	let memoryService: InMemoryMemoryService;
	let artifactService: InMemoryArtifactService;

	beforeEach(() => {
		sessionService = new InMemorySessionService();
		memoryService = new InMemoryMemoryService();
		artifactService = new InMemoryArtifactService();
	});

	describe("withMemory", () => {
		it("should configure memory service separately", async () => {
			const { agent, runner } = await AgentBuilder.create("test-agent")
				.withModel("gemini-2.5-flash")
				.withMemory(memoryService)
				.withSession(sessionService, { userId: "user1", appName: "app1" })
				.build();

			expect(agent).toBeDefined();
			expect(runner).toBeDefined();
		});
	});

	describe("withArtifactService", () => {
		it("should configure artifact service separately", async () => {
			const { agent, runner } = await AgentBuilder.create("test-agent")
				.withModel("gemini-2.5-flash")
				.withArtifactService(artifactService)
				.withSession(sessionService, { userId: "user1", appName: "app1" })
				.build();

			expect(agent).toBeDefined();
			expect(runner).toBeDefined();
		});
	});

	describe("Combined usage", () => {
		it("should work with both memory and artifact services", async () => {
			const { agent, runner } = await AgentBuilder.create("test-agent")
				.withModel("gemini-2.5-flash")
				.withMemory(memoryService)
				.withArtifactService(artifactService)
				.withSession(sessionService, { userId: "user1", appName: "app1" })
				.build();

			expect(agent).toBeDefined();
			expect(runner).toBeDefined();
		});

		it("should work in any order", async () => {
			const { agent, runner } = await AgentBuilder.create("test-agent")
				.withSession(sessionService, { userId: "user1", appName: "app1" })
				.withModel("gemini-2.5-flash")
				.withArtifactService(artifactService)
				.withMemory(memoryService)
				.build();

			expect(agent).toBeDefined();
			expect(runner).toBeDefined();
		});
	});

	describe("Backward compatibility", () => {
		it("should still work without memory or artifact services", async () => {
			const { agent, runner } = await AgentBuilder.create("test-agent")
				.withModel("gemini-2.5-flash")
				.withSession(sessionService, { userId: "user1", appName: "app1" })
				.build();

			expect(agent).toBeDefined();
			expect(runner).toBeDefined();
		});

		it("should work with default session", async () => {
			const { agent, runner } = await AgentBuilder.create("test-agent")
				.withModel("gemini-2.5-flash")
				.build();

			expect(agent).toBeDefined();
			expect(runner).toBeDefined();
		});
	});
});
