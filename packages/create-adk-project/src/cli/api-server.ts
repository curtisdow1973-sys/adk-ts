import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import { BaseAgent } from "@iqai/adk";
import { LlmAgent } from "@iqai/adk";
import { InMemorySessionService } from "@iqai/adk";
import { Runner } from "@iqai/adk";
import type { Content } from "@iqai/adk";
import { loadDotenvForAgent } from "./utils";
import { loadAgentFromFile } from "./operations";

interface AgentRunRequest {
	appName: string;
	userId: string;
	sessionId?: string;
	newMessage: Content;
	streaming?: boolean;
}

export interface ApiServerOptions {
	agentDir: string;
	port?: number;
	allowOrigins?: string[];
}

/**
 * Create and start API server for agent interaction
 *
 * @param options Configuration options for the API server
 */
export async function createApiServer(
	options: ApiServerOptions,
): Promise<void> {
	const { agentDir, port = 8000, allowOrigins = ["*"] } = options;

	const app = express();
	const server = http.createServer(app);

	// Configure CORS and middleware
	app.use(
		cors({
			origin: allowOrigins,
			credentials: true,
		}),
	);
	app.use(express.json());

	// Services
	const sessionService = new InMemorySessionService();

	// Load agent
	const agentPath = path.resolve(agentDir);
	if (!fs.existsSync(agentPath) || !fs.statSync(agentPath).isDirectory()) {
		throw new Error(`Invalid agent directory: ${agentPath}`);
	}

	// Find agent file
	const possibleFiles = [
		path.join(agentPath, "src", "agent.ts"),
		path.join(agentPath, "src", "index.ts"),
		path.join(agentPath, "agent.ts"),
		path.join(agentPath, "index.ts"),
	];

	let agentFilePath: string | undefined;
	for (const filePath of possibleFiles) {
		if (fs.existsSync(filePath)) {
			agentFilePath = filePath;
			break;
		}
	}

	if (!agentFilePath) {
		throw new Error(
			`No agent file found in ${agentPath}. Looking for: ${possibleFiles.join(", ")}`,
		);
	}

	// Load environment variables
	const agentName = path.basename(agentPath);
	const agentParentDir = path.dirname(agentPath);
	loadDotenvForAgent(agentName, agentParentDir);

	// Load the agent
	const rootAgent = await loadAgentFromFile(agentFilePath);

	// Create runner
	const runner = new Runner({
		appName: rootAgent.name,
		agent: rootAgent,
		sessionService,
	});

	// API Routes
	app.get("/health", (req: express.Request, res: express.Response) => {
		res.json({
			status: "healthy",
			agent: rootAgent.name,
			timestamp: new Date().toISOString(),
		});
	});

	app.get("/agent/info", (req: express.Request, res: express.Response) => {
		res.json({
			name: rootAgent.name,
			description: rootAgent.description || "No description available",
			type: "LlmAgent",
		});
	});

	app.post("/sessions", async (req: express.Request, res: express.Response) => {
		try {
			const { userId = "api-user", initialState = {} } = req.body;

			const session = await sessionService.createSession(
				rootAgent.name,
				userId,
				initialState,
			);

			res.json({
				sessionId: session.id,
				userId: session.userId,
				appName: session.appName,
				state: session.state,
			});
		} catch (error) {
			console.error("Create session error:", error);
			res.status(500).json({ error: "Failed to create session" });
		}
	});

	app.get(
		"/sessions/:sessionId",
		async (req: express.Request, res: express.Response) => {
			try {
				const session = await sessionService.getSession(
					rootAgent.name,
					req.params.sessionId || "api-user",
					req.params.sessionId,
				);

				if (!session) {
					return res.status(404).json({ error: "Session not found" });
				}

				res.json({
					sessionId: session.id,
					userId: session.userId,
					appName: session.appName,
					state: session.state,
					events: session.events,
				});
			} catch (error) {
				console.error("Get session error:", error);
				res.status(500).json({ error: "Failed to get session" });
			}
		},
	);

	app.post("/run", async (req: express.Request, res: express.Response) => {
		try {
			const request: AgentRunRequest = req.body;

			if (!request.newMessage) {
				return res.status(400).json({ error: "newMessage is required" });
			}

			// Get or create session
			let session: any;
			if (request.sessionId) {
				session = await sessionService.getSession(
					request.appName || rootAgent.name,
					request.userId || "api-user",
					request.sessionId,
				);
			}

			if (!session) {
				session = await sessionService.createSession(
					request.appName || rootAgent.name,
					request.userId || "api-user",
					{},
				);
			}

			if (request.streaming) {
				// Streaming response
				res.setHeader("Content-Type", "text/event-stream");
				res.setHeader("Cache-Control", "no-cache");
				res.setHeader("Connection", "keep-alive");

				let responseContent = "";
				for await (const event of runner.runAsync({
					userId: session.userId,
					sessionId: session.id,
					newMessage: request.newMessage,
				})) {
					if (event.content?.parts) {
						const text = event.content.parts
							.map((part: any) => part.text || "")
							.join("");

						if (text && text !== responseContent) {
							responseContent = text;
							res.write(
								`data: ${JSON.stringify({
									type: "content",
									content: text,
									sessionId: session.id,
								})}\n\n`,
							);
						}
					}
				}

				res.write(
					`data: ${JSON.stringify({
						type: "done",
						sessionId: session.id,
					})}\n\n`,
				);
				res.end();
			} else {
				// Non-streaming response
				let responseContent = "";
				for await (const event of runner.runAsync({
					userId: session.userId,
					sessionId: session.id,
					newMessage: request.newMessage,
				})) {
					if (event.content?.parts) {
						const text = event.content.parts
							.map((part: any) => part.text || "")
							.join("");

						if (text) {
							responseContent = text;
						}
					}
				}

				res.json({
					content: responseContent,
					sessionId: session.id,
					userId: session.userId,
				});
			}
		} catch (error) {
			console.error("Run error:", error);
			res.status(500).json({
				error: "Internal server error",
				message: error instanceof Error ? error.message : String(error),
			});
		}
	});

	// Error handling middleware
	app.use(
		(
			error: any,
			req: express.Request,
			res: express.Response,
			next: express.NextFunction,
		) => {
			console.error("Unhandled error:", error);
			res.status(500).json({ error: "Internal server error" });
		},
	);

	// Start server
	server.listen(port, () => {
		console.log(`🔌 API server running at http://localhost:${port}`);
		console.log(`🤖 Agent: ${rootAgent.name}`);
		console.log(`📁 Agent directory: ${agentPath}`);
		console.log("\n📋 Available endpoints:");
		console.log("  GET  /health - Health check");
		console.log("  GET  /agent/info - Agent information");
		console.log("  POST /sessions - Create new session");
		console.log("  GET  /sessions/:id - Get session");
		console.log("  POST /run - Run agent (supports streaming)");
	});
}
