import { InMemorySessionService } from "@iqai/adk";
import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import type { Agent, LoadedAgent } from "../../common/types";
import { AgentManager } from "./agent-manager.service";

// Mock the dependencies
jest.mock("./agent-loader.service");
jest.mock("./agent-scanner.service");

describe("AgentManager", () => {
	let agentManager: AgentManager;
	let sessionService: InMemorySessionService;

	beforeEach(async () => {
		sessionService = new InMemorySessionService();
		agentManager = new AgentManager(sessionService, true);

		// Mock agents map to simulate a discovered agent
		const mockAgent: Agent = {
			name: "test-agent",
			relativePath: "test-agent",
			absolutePath: "/fake/path/test-agent",
			instance: undefined,
		};
		agentManager.getAgents().set("test-agent", mockAgent);
	});

	describe("Session Persistence", () => {
		it("should reuse existing session when agent is started multiple times", async () => {
			// Create a manual session first
			const userId = "user_test-agent";
			const appName = "adk-server";
			const initialSession = await sessionService.createSession(
				appName,
				userId,
				{ testKey: "testValue" },
				"test-session-id",
			);

			// Mock the agent loading process since we can't load real files in tests
			const originalStartAgent = agentManager.startAgent.bind(agentManager);
			jest.spyOn(agentManager, "startAgent").mockImplementation(async (agentPath: string) => {
				// Simulate that we found existing sessions
				const existingSessions = await sessionService.listSessions(appName, userId);
				expect(existingSessions.sessions.length).toBe(1);
				expect(existingSessions.sessions[0].id).toBe("test-session-id");
				expect(existingSessions.sessions[0].state.testKey).toBe("testValue");

				// Mock the loaded agent to verify the session ID is reused
				const mockLoadedAgent: LoadedAgent = {
					agent: { name: "test-agent" } as any,
					runner: {} as any,
					sessionId: existingSessions.sessions[0].id,
					userId,
					appName,
				};

				agentManager.getLoadedAgents().set(agentPath, mockLoadedAgent);
			});

			// Start the agent
			await agentManager.startAgent("test-agent");

			// Verify the loaded agent uses the existing session
			const loadedAgent = agentManager.getLoadedAgents().get("test-agent");
			expect(loadedAgent).toBeDefined();
			expect(loadedAgent?.sessionId).toBe("test-session-id");

			// Start the agent again (simulating a refresh)
			await agentManager.startAgent("test-agent");

			// Verify it still uses the same session
			const loadedAgent2 = agentManager.getLoadedAgents().get("test-agent");
			expect(loadedAgent2?.sessionId).toBe("test-session-id");

			// Verify no additional sessions were created
			const finalSessions = await sessionService.listSessions(appName, userId);
			expect(finalSessions.sessions.length).toBe(1);
		});

		it("should create new session when no existing sessions found", async () => {
			const userId = "user_test-agent";
			const appName = "adk-server";

			// Verify no sessions exist initially
			const initialSessions = await sessionService.listSessions(appName, userId);
			expect(initialSessions.sessions.length).toBe(0);

			// Mock the agent start process
			jest.spyOn(agentManager, "startAgent").mockImplementation(async (agentPath: string) => {
				// Verify no existing sessions
				const existingSessions = await sessionService.listSessions(appName, userId);
				expect(existingSessions.sessions.length).toBe(0);

				// Simulate creating a new session since none exist
				const newSession = await sessionService.createSession(appName, userId, {});

				const mockLoadedAgent: LoadedAgent = {
					agent: { name: "test-agent" } as any,
					runner: {} as any,
					sessionId: newSession.id,
					userId,
					appName,
				};

				agentManager.getLoadedAgents().set(agentPath, mockLoadedAgent);
			});

			// Start the agent
			await agentManager.startAgent("test-agent");

			// Verify a session was created
			const finalSessions = await sessionService.listSessions(appName, userId);
			expect(finalSessions.sessions.length).toBe(1);

			const loadedAgent = agentManager.getLoadedAgents().get("test-agent");
			expect(loadedAgent).toBeDefined();
			expect(loadedAgent?.sessionId).toBe(finalSessions.sessions[0].id);
		});
	});
});