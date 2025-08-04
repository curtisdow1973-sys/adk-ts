import express, { type Request, type Response } from "express";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import { InMemorySessionService } from "@iqai/adk";
import { Runner } from "@iqai/adk";
import { BaseAgent } from "@iqai/adk";
import type { Content, Part } from "@google/genai";
import { loadDotenvForAgent } from "./utils";
import { loadAgentFromFile } from "./operations";

/**
 * Checks if a directory is a valid agent directory (contains agent.ts or index.ts)
 *
 * @param dirPath Path to directory to check
 * @returns True if directory is a valid agent directory
 */
function isAgentDirectory(dirPath: string): boolean {
	const absolutePath = path.isAbsolute(dirPath)
		? dirPath
		: path.resolve(process.cwd(), dirPath);

	if (
		!fs.existsSync(absolutePath) ||
		!fs.statSync(absolutePath).isDirectory()
	) {
		return false;
	}

	// Check for agent files in order of preference
	const possibleFiles = [
		path.join(absolutePath, "src", "agent.ts"),
		path.join(absolutePath, "src", "index.ts"),
		path.join(absolutePath, "agent.ts"),
		path.join(absolutePath, "index.ts"),
	];

	return possibleFiles.some((filePath) => fs.existsSync(filePath));
}

/**
 * Gets all agent directories in a parent directory
 *
 * @param parentDir Parent directory to search in
 * @returns Array of agent directory names
 */
function getAgentDirectories(parentDir: string): string[] {
	if (!fs.existsSync(parentDir)) return [];

	const excludeDirs = [
		"node_modules",
		"dist",
		".git",
		".github",
		".vscode",
		".idea",
	];

	return fs.readdirSync(parentDir).filter((name) => {
		if (name.startsWith(".") || excludeDirs.includes(name)) {
			return false;
		}

		const fullPath = path.join(parentDir, name);
		if (!fs.statSync(fullPath).isDirectory()) {
			return false;
		}

		return isAgentDirectory(fullPath);
	});
}

export interface WebServerOptions {
	agentDir: string;
	port?: number;
}

/**
 * Start web server for agent interaction
 *
 * @param options Configuration options for the web server
 */
export async function startWebServer(options: WebServerOptions): Promise<void> {
	const { agentDir, port = 3000 } = options;

	const app = express();
	const server = http.createServer(app);

	// Configure CORS and middleware
	app.use(cors());
	app.use(express.json());
	app.use(express.static(path.join(__dirname, "browser")));

	// Services
	const sessionService = new InMemorySessionService();

	// Load agent
	const agentPath = path.resolve(agentDir);
	if (!isAgentDirectory(agentPath)) {
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
		throw new Error(`No agent file found in ${agentPath}`);
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
	app.get("/api/health", (req: Request, res: Response) => {
		res.json({ status: "healthy", agent: rootAgent.name });
	});

	app.post("/api/chat", async (req: Request, res: Response) => {
		try {
			const { message, sessionId } = req.body;

			if (!message) {
				return res.status(400).json({ error: "Message is required" });
			}

			// Get or create session
			let session: any;
			if (sessionId) {
				session = await sessionService.getSession(
					rootAgent.name,
					"web-user",
					sessionId,
				);
			}

			if (!session) {
				session = await sessionService.createSession(
					rootAgent.name,
					"web-user",
					{},
				);
			}

			const content: Content = {
				role: "user",
				parts: [{ text: message } as Part],
			};

			// Stream response
			res.setHeader("Content-Type", "text/event-stream");
			res.setHeader("Cache-Control", "no-cache");
			res.setHeader("Connection", "keep-alive");

			let responseText = "";
			for await (const event of runner.runAsync({
				userId: session.userId,
				sessionId: session.id,
				newMessage: content,
			})) {
				if (event.content?.parts) {
					const text = event.content.parts
						.map((part: Part) => part.text || "")
						.join("");

					if (text && text !== responseText) {
						responseText = text;
						res.write(
							`data: ${JSON.stringify({
								type: "message",
								content: text,
								sessionId: session.id,
							})}\n\n`,
						);
					}
				}
			}

			res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
			res.end();
		} catch (error) {
			console.error("Chat error:", error);
			res.status(500).json({ error: "Internal server error" });
		}
	});

	// Serve the web interface
	app.get("*", (req: Request, res: Response) => {
		const indexPath = path.join(__dirname, "browser", "index.html");
		if (fs.existsSync(indexPath)) {
			res.sendFile(indexPath);
		} else {
			// Fallback HTML if browser assets not found
			res.send(`
				<!DOCTYPE html>
				<html>
				<head>
					<title>ADK Agent: ${rootAgent.name}</title>
					<style>
						body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
						.chat-container { border: 1px solid #ddd; height: 400px; overflow-y: auto; padding: 10px; margin-bottom: 10px; }
						.input-container { display: flex; gap: 10px; }
						input { flex: 1; padding: 10px; }
						button { padding: 10px 20px; }
						.message { margin-bottom: 10px; }
						.user { color: #007bff; }
						.agent { color: #28a745; }
					</style>
				</head>
				<body>
					<h1>🤖 ${rootAgent.name}</h1>
					<div class="chat-container" id="chat"></div>
					<div class="input-container">
						<input type="text" id="messageInput" placeholder="Type your message..." />
						<button onclick="sendMessage()">Send</button>
					</div>
					<script>
						let sessionId = null;
						function addMessage(sender, content) {
							const chat = document.getElementById('chat');
							const msg = document.createElement('div');
							msg.className = 'message ' + sender;
							msg.innerHTML = '<strong>' + (sender === 'user' ? 'You' : '${rootAgent.name}') + ':</strong> ' + content;
							chat.appendChild(msg);
							chat.scrollTop = chat.scrollHeight;
						}
						async function sendMessage() {
							const input = document.getElementById('messageInput');
							const message = input.value.trim();
							if (!message) return;
							
							addMessage('user', message);
							input.value = '';
							
							try {
								const response = await fetch('/api/chat', {
									method: 'POST',
									headers: { 'Content-Type': 'application/json' },
									body: JSON.stringify({ message, sessionId })
								});
								
								const reader = response.body.getReader();
								const decoder = new TextDecoder();
								let content = '';
								
								while (true) {
									const { done, value } = await reader.read();
									if (done) break;
									
									const chunk = decoder.decode(value);
									const lines = chunk.split('\\n');
									
									for (const line of lines) {
										if (line.startsWith('data: ')) {
											const data = JSON.parse(line.slice(6));
											if (data.type === 'message') {
												content = data.content;
												sessionId = data.sessionId;
											}
										}
									}
								}
								
								if (content) {
									addMessage('agent', content);
								}
							} catch (error) {
								addMessage('agent', 'Error: ' + error.message);
							}
						}
						document.getElementById('messageInput').addEventListener('keypress', function(e) {
							if (e.key === 'Enter') sendMessage();
						});
					</script>
				</body>
				</html>
			`);
		}
	});

	// Start server
	server.listen(port, () => {
		console.log(`🌐 Web server running at http://localhost:${port}`);
		console.log(`🤖 Agent: ${rootAgent.name}`);
		console.log(`📁 Agent directory: ${agentPath}`);
	});
}
