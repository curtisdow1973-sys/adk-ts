import { Hono } from "hono";
import { cors } from "hono/cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import chalk from "chalk";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

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
	private io: Server;
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
		this.app.use("*", cors({
			origin: ["http://localhost:3000", "https://adk-web.iqai.com"],
			methods: ["GET", "POST", "PUT", "DELETE"],
			credentials: true
		}));

		// Health check
		this.app.get("/health", (c) => {
			return c.json({ status: "ok", timestamp: new Date().toISOString() });
		});

		// Get all available agents
		this.app.get("/api/agents", (c) => {
			const agents = this.findAgentFiles(this.agentsDir);
			return c.json({ agents });
		});

		// Get running agents
		this.app.get("/api/agents/running", (c) => {
			const running = Array.from(this.runningAgents.entries()).map(([id, agent]) => ({
				id,
				status: agent.status,
				startTime: agent.startTime
			}));
			return c.json({ running });
		});

		// Start an agent
		this.app.post("/api/agents/:agentId/start", async (c) => {
			const agentId = c.req.param("agentId");
			const agents = this.findAgentFiles(this.agentsDir);
			const agent = agents.find(a => a.relativePath === agentId);

			if (!agent) {
				return c.json({ error: "Agent not found" }, 404);
			}

			if (this.runningAgents.has(agentId)) {
				return c.json({ error: "Agent is already running" }, 400);
			}

			try {
				const agentProcess = this.startAgent(agent, agentId);
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
				return c.json({ error: "Agent is not running or does not accept input" }, 404);
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
				origin: ["http://localhost:3000", "https://adk-web.iqai.com"],
				methods: ["GET", "POST"],
				credentials: true
			}
		});

		this.setupSocketHandlers();

		// Handle Hono app through HTTP server
		httpServer.on("request", (req, res) => {
			// Convert Node.js request to Hono request
			this.app.fetch(new Request(`http://localhost:${this.port}${req.url}`, {
				method: req.method,
				headers: req.headers as any,
				body: req.method !== "GET" && req.method !== "HEAD" ? req : undefined
			})).then(response => {
				res.statusCode = response.status;
				
				// Set headers
				response.headers.forEach((value, key) => {
					res.setHeader(key, value);
				});

				// Send body
				if (response.body) {
					response.body.pipeTo(new WritableStream({
						write(chunk) {
							res.write(chunk);
						},
						close() {
							res.end();
						}
					}));
				} else {
					res.end();
				}
			}).catch(error => {
				console.error("Request error:", error);
				res.statusCode = 500;
				res.end("Internal Server Error");
			});
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

	private findAgentFiles(directory: string): AgentFile[] {
		const agents: AgentFile[] = [];

		if (!existsSync(directory)) {
			return agents;
		}

		const scanDirectory = (dir: string, baseDir: string = directory) => {
			try {
				const entries = readdirSync(dir);

				for (const entry of entries) {
					const fullPath = join(dir, entry);
					const stat = statSync(fullPath);

					if (stat.isDirectory()) {
						scanDirectory(fullPath, baseDir);
					} else if (stat.isFile()) {
						const name = basename(entry, extname(entry));
						if (
							name === "agent" &&
							(extname(entry) === ".ts" || extname(entry) === ".js")
						) {
							const relativePath = dir.replace(baseDir, "").replace(/^\//, "");
							const displayName = relativePath
								? `${relativePath}/agent`
								: "agent";
							agents.push({
								path: fullPath,
								name: displayName,
								directory: dir,
								relativePath: fullPath
									.replace(process.cwd(), "")
									.replace(/^\//, ""),
							});
						}
					}
				}
			} catch (error) {
				// Ignore errors for directories we can't access
			}
		};

		scanDirectory(directory);
		return agents;
	}

	private startAgent(agent: AgentFile, agentId: string): ChildProcess {
		console.log(chalk.blue(`🚀 Starting agent: ${agent.name}`));

		const isTypeScript = agent.path.endsWith(".ts");
		const command = isTypeScript ? "npx" : "node";
		const args = isTypeScript 
			? ["tsx", agent.path]
			: [agent.path];

		const agentProcess = spawn(command, args, {
			cwd: agent.directory,
			stdio: ["pipe", "pipe", "pipe"],
		});

		const agentData: AgentProcess = {
			process: agentProcess,
			status: "running",
			startTime: new Date()
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
				timestamp: new Date().toISOString()
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
				timestamp: new Date().toISOString()
			});
		});

		agentProcess.on("close", (code) => {
			const status = code === 0 ? "Agent completed successfully" : `Agent exited with code ${code}`;
			console.log(chalk.yellow(`[${agent.name}] ${status}`));
			
			this.runningAgents.delete(agentId);
			
			this.io.to(`agent-${agentId}`).emit("agentMessage", {
				id: Date.now(),
				type: "system",
				content: status,
				agentId,
				timestamp: new Date().toISOString()
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
				timestamp: new Date().toISOString()
			});
		});

		this.io.to(`agent-${agentId}`).emit("agentMessage", {
			id: Date.now(),
			type: "system",
			content: `Agent ${agent.name} started`,
			agentId,
			timestamp: new Date().toISOString()
		});

		return agentProcess;
	}

	public async start(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server.listen(this.port, this.host, () => {
				console.log(chalk.green("✅ ADK Server started!"));
				console.log(chalk.cyan(`🌐 API Server: http://${this.host}:${this.port}`));
				console.log(chalk.cyan(`🔌 WebSocket Server: ws://${this.host}:${this.port}`));
				console.log(chalk.gray(`📁 Watching for agents in: ${this.agentsDir}`));
				resolve();
			});

			this.server.on("error", (error: Error) => {
				console.error(chalk.red("❌ Failed to start ADK server:"), error.message);
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
