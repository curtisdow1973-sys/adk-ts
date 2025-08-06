import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFile, readdirSync, statSync } from "node:fs";
import { type IncomingMessage, createServer } from "node:http";
import { basename, dirname, extname, join } from "node:path";
import type { Readable } from "node:stream";
import { promisify } from "node:util";
import chalk from "chalk";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Server } from "socket.io";

interface AgentFile {
	path: string;
	name: string;
	directory: string;
	relativePath: string;
}

interface AgentProcess {
	process: ChildProcess;
	status: "running" | "stopped" | "error";
	startTime: Date;
}

export class ADKServer {
	private app: Hono;
	private server: any;
	private io!: Server;
	private runningAgents = new Map<string, AgentProcess>();
	private agentsDir: string;
	private port: number;
	private host: string;

	constructor(agentsDir: string, port = 3001, host = "localhost") {
		this.agentsDir = agentsDir;
		this.port = port;
		this.host = host;
		this.app = new Hono();
		this.setupRoutes();
		this.setupServer();
	}

	private setupRoutes() {
		// Enable CORS for all routes
		this.app.use(
			"*",
			cors({
				origin: ["http://localhost:3000", "http://localhost:3001"],
				credentials: true,
			}),
		);

		// Health check
		this.app.get("/health", (c) => {
			return c.json({ status: "ok", timestamp: new Date().toISOString() });
		});

		// Get all available agents
		this.app.get("/api/agents", async (c) => {
			const agents = await this.findAgentFiles(this.agentsDir);
			return c.json({ agents });
		});

		// Get running agents
		this.app.get("/api/agents/running", (c) => {
			const running = Array.from(this.runningAgents.entries()).map(
				([id, agent]) => ({
					id,
					status: agent.status,
					startTime: agent.startTime,
				}),
			);
			return c.json({ running });
		});

		// Start an agent
		this.app.post("/api/agents/:agentId/start", async (c) => {
			const agentId = c.req.param("agentId");
			const agents = await this.findAgentFiles(this.agentsDir);
			const agent = agents.find((a) => a.relativePath === agentId);

			if (!agent) {
				return c.json({ error: "Agent not found" }, 404);
			}

			if (this.runningAgents.has(agentId)) {
				return c.json({ error: "Agent is already running" }, 400);
			}

			try {
				this.startAgent(agent, agentId);
				return c.json({ success: true, agentId, status: "started" });
			} catch (error) {
				return c.json({ error: "Failed to start agent" }, 500);
			}
		});

		// Stop an agent
		this.app.post("/api/agents/:agentId/stop", (c) => {
			const agentId = c.req.param("agentId");
			const agentProcess = this.runningAgents.get(agentId);

			if (!agentProcess) {
				return c.json({ error: "Agent is not running" }, 404);
			}

			agentProcess.process.kill("SIGTERM");
			this.runningAgents.delete(agentId);

			return c.json({ success: true, agentId, status: "stopped" });
		});

		// Send message to agent
		this.app.post("/api/agents/:agentId/message", async (c) => {
			const agentId = c.req.param("agentId");
			const { message } = await c.req.json();
			const agentProcess = this.runningAgents.get(agentId);

			if (!agentProcess || !agentProcess.process.stdin) {
				return c.json(
					{ error: "Agent is not running or does not accept input" },
					404,
				);
			}

			agentProcess.process.stdin.write(`${message}\n`);
			return c.json({ success: true, agentId, message: "Message sent" });
		});
	}

	private setupServer() {
		const httpServer = createServer();
		this.server = httpServer;

		// Setup Socket.IO
		this.io = new Server(httpServer, {
			cors: {
				origin: ["http://localhost:3000", "http://localhost:3001"],
				methods: ["GET", "POST"],
				credentials: true,
			},
		});

		this.setupSocketHandlers();

		// Handle Hono app through HTTP server
		httpServer.on("request", async (req, res) => {
			try {
				// Convert Node.js request to Hono request
				const url = `http://localhost:${this.port}${req.url}`;

				// Handle request body for non-GET/HEAD requests
				let body: BodyInit | null = null;
				if (req.method !== "GET" && req.method !== "HEAD") {
					const chunks: Buffer[] = [];
					for await (const chunk of req as Readable) {
						chunks.push(chunk);
					}
					body = Buffer.concat(chunks);
				}

				const response = await this.app.fetch(
					new Request(url, {
						method: req.method,
						headers: req.headers as HeadersInit,
						body,
					}),
				);

				res.statusCode = response.status;

				// Set headers
				response.headers.forEach((value: string, key: string) => {
					res.setHeader(key, value);
				});

				// Send body
				if (response.body) {
					response.body.pipeTo(
						new WritableStream({
							write(chunk) {
								res.write(chunk);
							},
							close() {
								res.end();
							},
						}),
					);
				} else {
					res.end();
				}
			} catch (error: any) {
				console.error("Request error:", error);
				res.statusCode = 500;
				res.end("Internal Server Error");
			}
		});
	}

	private setupSocketHandlers() {
		this.io.on("connection", (socket) => {
			console.log(chalk.green("👤 Client connected to ADK server"));

			socket.on("joinAgent", (agentId) => {
				socket.join(`agent-${agentId}`);
				console.log(chalk.blue(`👤 Client joined agent room: ${agentId}`));
			});

			socket.on("leaveAgent", (agentId) => {
				socket.leave(`agent-${agentId}`);
				console.log(chalk.yellow(`👤 Client left agent room: ${agentId}`));
			});

			socket.on("disconnect", () => {
				console.log(chalk.yellow("👤 Client disconnected from ADK server"));
			});
		});
	}

	private async findAgentFiles(directory: string): Promise<AgentFile[]> {
		const agents: AgentFile[] = [];

		if (!existsSync(directory)) {
			return agents;
		}

		const scanDirectory = async (dir: string, baseDir: string = directory) => {
			try {
				const entries = readdirSync(dir);

				for (const entry of entries) {
					const fullPath = join(dir, entry);
					const stat = statSync(fullPath);

					if (stat.isDirectory()) {
						// Skip node_modules and other common directories we don't want to scan
						if (this.shouldSkipDirectory(entry, fullPath)) {
							continue;
						}
						await scanDirectory(fullPath, baseDir);
					} else if (stat.isFile()) {
						// Look for agent files (TypeScript or JavaScript)
						if (await this.isAgentFile(entry, fullPath)) {
							const relativePath = fullPath
								.replace(baseDir, "")
								.replace(/^[/\\]/, "");

							const displayName = this.getAgentDisplayName(fullPath, baseDir);

							agents.push({
								path: fullPath,
								name: displayName,
								directory: dir,
								relativePath,
							});
						}
					}
				}
			} catch (error) {
				// Ignore errors for directories we can't access
			}
		};

		await scanDirectory(directory);
		return agents;
	}

	private shouldSkipDirectory(dirName: string, fullPath: string): boolean {
		const skipDirs = [
			"node_modules",
			".git",
			".next",
			"dist",
			"build",
			".turbo",
			"coverage",
			".nyc_output",
			"__pycache__",
			".pytest_cache",
			".vscode",
			".idea",
		];

		return skipDirs.includes(dirName);
	}

	private async isAgentFile(
		fileName: string,
		fullPath: string,
	): Promise<boolean> {
		// Only look for files explicitly named "agent.ts" or "agent.js"
		const name = basename(fileName, extname(fileName));
		const ext = extname(fileName);

		if (name !== "agent" || !(ext === ".ts" || ext === ".js")) {
			return false;
		}

		try {
			const readFileAsync = promisify(readFile);
			const content = await readFileAsync(fullPath, "utf-8");

			// Check for common agent export patterns
			const agentExportPatterns = [
				// Default exports of LlmAgent
				/export\s+default\s+.*(?:LlmAgent|Agent)/,
				// Named exports
				/export\s+(?:const|let|var)\s+(?:rootAgent|agent|Agent|RootAgent)/,
				// Object exports
				/export\s*\{\s*(?:rootAgent|agent|Agent|RootAgent|default)/,
				// Class exports that might be agents
				/export\s+(?:default\s+)?class\s+\w*Agent/,
				// Variable assignments that look like agents
				/(?:rootAgent|agent|Agent|RootAgent)\s*[:=]\s*new\s+LlmAgent/,
			];

			// Check if any pattern matches
			const hasAgentExport = agentExportPatterns.some((pattern) =>
				pattern.test(content),
			);

			// Additional check for ADK imports (stronger signal this is an ADK agent)
			const hasAdkImport =
				/from\s+['"]@iqai\/adk['"]/.test(content) ||
				/import.*LlmAgent/.test(content);

			return hasAgentExport && hasAdkImport;
		} catch (error) {
			// If we can't read the file, assume it's not a valid agent
			return false;
		}
	}

	private getAgentDisplayName(fullPath: string, baseDir: string): string {
		const relativePath = fullPath.replace(baseDir, "").replace(/^[/\\]/, "");
		const fileName = basename(fullPath, extname(fullPath));

		// If it's in a subdirectory, include the directory name
		const dir = dirname(relativePath);
		if (dir && dir !== ".") {
			return `${dir}/${fileName}`;
		}

		return fileName;
	}

	private startAgent(agent: AgentFile, agentId: string): ChildProcess {
		console.log(chalk.blue(`🚀 Starting agent: ${agent.name}`));

		const isTypeScript = agent.path.endsWith(".ts");
		const command = isTypeScript ? "npx" : "node";
		const args = isTypeScript ? ["tsx", agent.path] : [agent.path];

		const agentProcess = spawn(command, args, {
			cwd: agent.directory,
			stdio: ["pipe", "pipe", "pipe"],
		});

		const agentData: AgentProcess = {
			process: agentProcess,
			status: "running",
			startTime: new Date(),
		};

		this.runningAgents.set(agentId, agentData);

		// Handle agent output
		agentProcess.stdout?.on("data", (data) => {
			const message = data.toString();
			console.log(chalk.gray(`[${agent.name}] ${message.trim()}`));

			this.io.to(`agent-${agentId}`).emit("agentMessage", {
				id: Date.now(),
				type: "stdout",
				content: message,
				agentId,
				timestamp: new Date().toISOString(),
			});
		});

		agentProcess.stderr?.on("data", (data) => {
			const message = data.toString();
			console.error(chalk.red(`[${agent.name}] ${message.trim()}`));

			this.io.to(`agent-${agentId}`).emit("agentMessage", {
				id: Date.now(),
				type: "stderr",
				content: message,
				agentId,
				timestamp: new Date().toISOString(),
			});
		});

		agentProcess.on("close", (code) => {
			const status =
				code === 0
					? "Agent completed successfully"
					: `Agent exited with code ${code}`;
			console.log(chalk.yellow(`[${agent.name}] ${status}`));

			this.runningAgents.delete(agentId);

			this.io.to(`agent-${agentId}`).emit("agentMessage", {
				id: Date.now(),
				type: "system",
				content: status,
				agentId,
				timestamp: new Date().toISOString(),
			});
		});

		agentProcess.on("error", (error) => {
			console.error(chalk.red(`[${agent.name}] Error: ${error.message}`));

			agentData.status = "error";

			this.io.to(`agent-${agentId}`).emit("agentMessage", {
				id: Date.now(),
				type: "error",
				content: `Error: ${error.message}`,
				agentId,
				timestamp: new Date().toISOString(),
			});
		});

		this.io.to(`agent-${agentId}`).emit("agentMessage", {
			id: Date.now(),
			type: "system",
			content: `Agent ${agent.name} started`,
			agentId,
			timestamp: new Date().toISOString(),
		});

		return agentProcess;
	}

	public async start(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server.listen(this.port, this.host, () => {
				console.log(chalk.green("✅ ADK Server started!"));
				console.log(
					chalk.cyan(`🌐 API Server: http://${this.host}:${this.port}`),
				);
				console.log(
					chalk.cyan(`🔌 WebSocket Server: ws://${this.host}:${this.port}`),
				);
				console.log(chalk.gray(`📁 Watching for agents in: ${this.agentsDir}`));
				resolve();
			});

			this.server.on("error", (error: Error) => {
				console.error(
					chalk.red("❌ Failed to start ADK server:"),
					error.message,
				);
				reject(error);
			});
		});
	}

	public async stop(): Promise<void> {
		return new Promise((resolve) => {
			console.log(chalk.yellow("\n🛑 Shutting down ADK server..."));

			// Stop all running agents
			for (const [agentId, agentData] of this.runningAgents) {
				agentData.process.kill("SIGTERM");
			}
			this.runningAgents.clear();

			this.server.close(() => {
				console.log(chalk.green("✅ ADK server stopped"));
				resolve();
			});
		});
	}

	public getPort(): number {
		return this.port;
	}
}
