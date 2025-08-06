import { type ChildProcess, spawn, execSync } from "node:child_process";
import {
	existsSync,
	readFile,
	readFileSync,
	readdirSync,
	statSync,
} from "node:fs";
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
				await this.startAgent(agent, agentId);
				return c.json({ success: true, agentId, status: "started" });
			} catch (error: any) {
				console.error(
					chalk.red(`Failed to start agent ${agentId}:`),
					error.message,
				);
				return c.json(
					{ error: `Failed to start agent: ${error.message}` },
					500,
				);
			}
		});

		// Stop an agent
		this.app.post("/api/agents/:agentId/stop", (c) => {
			const agentId = c.req.param("agentId");
			const agentProcess = this.runningAgents.get(agentId);

			if (!agentProcess) {
				return c.json({ error: "Agent is not running" }, 404);
			}

			try {
				agentProcess.process.kill("SIGTERM");
				this.runningAgents.delete(agentId);
				return c.json({ success: true, agentId, status: "stopped" });
			} catch (error: any) {
				console.error(
					chalk.red(`Failed to stop agent ${agentId}:`),
					error.message,
				);
				return c.json({ error: `Failed to stop agent: ${error.message}` }, 500);
			}
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

			try {
				agentProcess.process.stdin.write(`${message}\n`);
				return c.json({ success: true, agentId, message: "Message sent" });
			} catch (error: any) {
				console.error(
					chalk.red(`Failed to send message to agent ${agentId}:`),
					error.message,
				);
				return c.json(
					{ error: `Failed to send message: ${error.message}` },
					500,
				);
			}
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
			console.log(chalk.gray(`   Socket ID: ${socket.id}`));

			socket.on("joinAgent", (agentId) => {
				socket.join(`agent-${agentId}`);
				console.log(
					chalk.blue(
						`👤 Client ${socket.id} joined agent room: agent-${agentId}`,
					),
				);

				// Send a test message to confirm connection
				socket.emit("agentMessage", {
					id: Date.now(),
					type: "system",
					content: `Connected to agent room: ${agentId}`,
					agentId,
					timestamp: new Date().toISOString(),
				});
			});

			socket.on("leaveAgent", (agentId) => {
				socket.leave(`agent-${agentId}`);
				console.log(
					chalk.yellow(
						`👤 Client ${socket.id} left agent room: agent-${agentId}`,
					),
				);
			});

			socket.on("disconnect", (reason) => {
				console.log(
					chalk.yellow(`👤 Client ${socket.id} disconnected: ${reason}`),
				);
			});

			socket.on("error", (error) => {
				console.error(chalk.red(`👤 Socket ${socket.id} error:`), error);
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
							const displayName = this.getAgentDisplayName(fullPath, baseDir);

							// Use the displayName as relativePath (without file extension)
							const relativePath = displayName;

							// Set directory to project root (where .env file is located)
							const projectRoot = basename(dir) === "src" ? dirname(dir) : dir;

							agents.push({
								path: fullPath,
								name: displayName,
								directory: projectRoot,
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
		const name = basename(fileName, extname(fileName));
		const ext = extname(fileName);

		// Check for files explicitly named "agent.ts" or "agent.js"
		if (name === "agent" && (ext === ".ts" || ext === ".js")) {
			return await this.hasAgentContent(fullPath);
		}

		// Check for common entry points in src/ directory
		const commonEntryPoints = ["index", "main", "agent"];
		if (commonEntryPoints.includes(name) && (ext === ".ts" || ext === ".js")) {
			// Only consider src/ directory files as potential agents
			const dirName = basename(dirname(fullPath));
			if (dirName === "src") {
				return await this.hasAgentContent(fullPath);
			}
		}

		return false;
	}

	private async hasAgentContent(fullPath: string): Promise<boolean> {
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
				// AgentBuilder patterns
				/AgentBuilder\.(?:create|withModel|withInstruction)/,
				// Simple function calls that might be agents
				/\.ask\(/,
				/\.run\(/,
			];

			// Check if any pattern matches
			const hasAgentExport = agentExportPatterns.some((pattern) =>
				pattern.test(content),
			);

			// Additional check for ADK imports (stronger signal this is an ADK agent)
			const hasAdkImport =
				/from\s+['"]@iqai\/adk['"]/.test(content) ||
				/import.*LlmAgent/.test(content) ||
				/import.*AgentBuilder/.test(content);

			return hasAgentExport || hasAdkImport;
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

	private findNodeExecutable(): string {
		// Always use the same Node.js executable that's running this server
		return process.execPath;
	}

	private checkTsxAvailable(): boolean {
		try {
			// Check if tsx is available via npm list
			execSync("npm list tsx --depth=0", { stdio: "ignore", timeout: 3000 });
			return true;
		} catch {
			try {
				// Check if tsx is available globally
				execSync("npm list -g tsx --depth=0", {
					stdio: "ignore",
					timeout: 3000,
				});
				return true;
			} catch {
				return false;
			}
		}
	}

	private async startAgent(
		agent: AgentFile,
		agentId: string,
	): Promise<ChildProcess> {
		console.log(chalk.blue(`🚀 Starting agent: ${agent.name}`));
		console.log(`🏠 Agent directory: ${agent.directory}`);
		console.log(`📂 Agent path: ${agent.path}`);

		const isTypeScript = agent.path.endsWith(".ts");
		let command: string;
		let args: string[];

		if (isTypeScript) {
			// Simple and reliable: use Node.js with tsx via require
			if (this.checkTsxAvailable()) {
				// Use Node.js to run tsx programmatically
				command = this.findNodeExecutable();
				args = [
					"-e",
					`require('tsx/cjs/api').register(); require('${agent.path}')`,
				];
				console.log(chalk.green("🔧 Using Node.js with tsx require"));
			} else {
				// Try to install tsx locally first
				console.log(
					chalk.yellow("⚠️ tsx not found, attempting to install locally..."),
				);
				try {
					// Ensure we have a package.json first
					const packageJsonPath = join(agent.directory, "package.json");
					if (!existsSync(packageJsonPath)) {
						execSync("npm init -y", {
							cwd: agent.directory,
							stdio: "pipe",
							timeout: 10000,
						});
					}

					execSync("npm install tsx", {
						cwd: agent.directory,
						stdio: "inherit",
						timeout: 30000,
					});
					console.log(chalk.green("✅ tsx installed successfully"));

					// Now use the locally installed tsx
					command = this.findNodeExecutable();
					args = [
						"-e",
						`require('tsx/cjs/api').register(); require('${agent.path}')`,
					];
					console.log(
						chalk.green("🔧 Using Node.js with locally installed tsx"),
					);
				} catch (installError) {
					throw new Error(
						`TypeScript runtime not available and auto-installation failed.\nPlease manually install tsx in the agent directory:\n  cd ${agent.directory}\n  npm install tsx\nInstallation error: ${(installError as Error).message}`,
					);
				}
			}
		} else {
			// JavaScript files - use Node.js directly
			command = process.execPath;
			args = [agent.path];
			console.log(chalk.green("🔧 Using Node.js directly"));
		}

		console.log(chalk.gray(`🔧 Command: ${command} ${args.join(" ")}`));

		// Load environment variables from .env file in the agent directory
		const envPath = join(agent.directory, ".env");
		const envVars = { ...process.env };

		try {
			if (existsSync(envPath)) {
				console.log(`📁 Loading .env file from: ${envPath}`);
				const envContent = readFileSync(envPath, "utf-8");
				const envLines = envContent.split("\n");

				for (const line of envLines) {
					const trimmedLine = line.trim();
					if (trimmedLine && !trimmedLine.startsWith("#")) {
						const equalIndex = trimmedLine.indexOf("=");
						if (equalIndex > 0) {
							const key = trimmedLine.substring(0, equalIndex).trim();
							let value = trimmedLine.substring(equalIndex + 1).trim();

							// Remove surrounding quotes if present
							if (
								(value.startsWith('"') && value.endsWith('"')) ||
								(value.startsWith("'") && value.endsWith("'"))
							) {
								value = value.slice(1, -1);
							}

							envVars[key] = value;
							// Log environment variables but hide sensitive ones
							if (
								!key.toLowerCase().includes("key") &&
								!key.toLowerCase().includes("secret") &&
								!key.toLowerCase().includes("token") &&
								!key.toLowerCase().includes("password")
							) {
								console.log(`🔑 ${key} = ${value}`);
							} else {
								console.log(`🔑 ${key} = [HIDDEN]`);
							}
						}
					}
				}
			} else {
				console.log(chalk.gray(`📁 No .env file found at: ${envPath}`));
			}
		} catch (error) {
			console.warn(
				chalk.yellow(`⚠️ Warning: Could not load .env file from ${envPath}:`),
				error,
			);
		}

		// Spawn the agent process
		const spawnOptions = {
			cwd: agent.directory,
			stdio: "pipe" as const,
			env: envVars,
			shell: command.includes("npx"), // Use shell for npx commands
		};

		const agentProcess = spawn(command, args, spawnOptions);

		const agentData: AgentProcess = {
			process: agentProcess,
			status: "running",
			startTime: new Date(),
		};

		this.runningAgents.set(agentId, agentData);

		// Handle agent output with better parsing
		agentProcess.stdout?.on("data", (data) => {
			const rawMessage = data.toString();
			console.log(chalk.gray(`[${agent.name}] ${rawMessage.trim()}`));

			// Split into lines and process each one
			const lines = rawMessage.split("\n");
			for (const line of lines) {
				const trimmedLine = line.trim();
				if (!trimmedLine) continue;

				// Check if this line contains an agent response
				let isAgentResponse = false;
				let content = trimmedLine;

				// Look for response patterns
				if (
					trimmedLine.includes("🤖 Response:") ||
					trimmedLine.includes("Response:") ||
					trimmedLine.match(/🤖.*:/)
				) {
					isAgentResponse = true;
					// Extract just the response content
					const responseMatch = trimmedLine.match(/🤖\s*Response:\s*(.+)/) ||
						trimmedLine.match(/Response:\s*(.+)/) || [null, trimmedLine];
					if (responseMatch && responseMatch[1]) {
						content = responseMatch[1].trim();
					}
				}

				// Always emit the message, but mark agent responses specially
				const messageType = isAgentResponse ? "agent" : "stdout";

				const socketMessage = {
					id: Date.now() + Math.random(), // Ensure unique IDs
					type: messageType,
					content: content,
					agentId,
					timestamp: new Date().toISOString(),
				};

				console.log(
					chalk.blue(`[WebSocket] Emitting message to agent-${agentId}:`),
					{
						type: messageType,
						content:
							content.substring(0, 100) + (content.length > 100 ? "..." : ""),
						agentId,
					},
				);

				this.io.to(`agent-${agentId}`).emit("agentMessage", socketMessage);
			}
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
			console.error(
				chalk.red(`[${agent.name}] Process error: ${error.message}`),
			);

			agentData.status = "error";
			this.runningAgents.delete(agentId);

			this.io.to(`agent-${agentId}`).emit("agentMessage", {
				id: Date.now(),
				type: "error",
				content: `Process error: ${error.message}`,
				agentId,
				timestamp: new Date().toISOString(),
			});

			// Provide helpful error messages for common issues
			if (error.message.includes("ENOENT")) {
				if (command.includes("npx")) {
					console.error(
						chalk.red(
							`💡 Tip: Make sure 'tsx' is installed. Run: npm install -g tsx`,
						),
					);
				} else {
					console.error(chalk.red(`💡 Tip: Command not found: ${command}`));
				}
			}
		});

		// Send initial success message
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

				// Check TypeScript runtime availability
				const tsxAvailable = this.checkTsxAvailable();

				if (tsxAvailable) {
					console.log(chalk.green("🔧 TypeScript support: tsx available"));
				} else {
					console.log(
						chalk.yellow(
							"⚠️ TypeScript support: Not available (will attempt auto-install)",
						),
					);
				}

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
				try {
					agentData.process.kill("SIGTERM");
					console.log(chalk.gray(`🛑 Stopped agent: ${agentId}`));
				} catch (error) {
					console.warn(
						chalk.yellow(`⚠️ Warning: Could not stop agent ${agentId}:`),
						error,
					);
				}
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
