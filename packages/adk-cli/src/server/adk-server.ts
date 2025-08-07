import { createServer } from "node:http";
import type { Readable } from "node:stream";
import chalk from "chalk";
import type { Hono } from "hono";
import { Server } from "socket.io";
import { SocketHandler } from "./handlers/index.js";
import { createApiRoutes } from "./routes.js";
import {
	AgentManagementService,
	AgentScannerService,
} from "./services/index.js";

export class ADKServer {
	private app: Hono;
	private server: any;
	private io: Server;
	private agentScanner: AgentScannerService;
	private agentManager: AgentManagementService;
	private socketHandler: SocketHandler;
	private port: number;
	private host: string;

	constructor(agentsDir: string, port = 3001, host = "localhost") {
		this.port = port;
		this.host = host;

		// Initialize services in correct order
		this.agentScanner = new AgentScannerService(agentsDir);
		this.io = this.setupServer(); // Initialize io and HTTP server
		this.agentManager = new AgentManagementService(this.io);
		this.socketHandler = new SocketHandler(this.io); // SocketHandler sets up connection handlers

		// Setup API routes after services are initialized
		this.app = createApiRoutes(this.agentScanner, this.agentManager);

		// Now setup the HTTP request handler
		this.setupHttpHandler();
	}

	private setupServer(): Server {
		const httpServer = createServer();
		this.server = httpServer;

		// Setup Socket.IO
		const io = new Server(httpServer, {
			cors: {
				origin: ["http://localhost:3000", "http://localhost:3001"],
				methods: ["GET", "POST"],
				credentials: true,
			},
		});

		return io;
	}

	private setupHttpHandler(): void {
		// Handle Hono app through HTTP server
		this.server.on("request", async (req: any, res: any) => {
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
				console.log(
					chalk.gray(
						`📁 Watching for agents in: ${this.agentScanner.getBaseDir()}`,
					),
				);

				// Check TypeScript runtime availability
				const tsxAvailable = this.agentManager.checkTsxAvailable();

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
			this.agentManager.stopAllAgents();

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
