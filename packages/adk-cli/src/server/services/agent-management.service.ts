import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { Server } from "socket.io";
import type { AgentFile, AgentProcess, SocketMessage } from "../types.js";

export class AgentManagementService {
	private runningAgents = new Map<string, AgentProcess>();
	private io: Server;

	constructor(io: Server) {
		this.io = io;
	}

	public getRunningAgents(): Array<{
		id: string;
		status: string;
		startTime: Date;
	}> {
		return Array.from(this.runningAgents.entries()).map(([id, agent]) => ({
			id,
			status: agent.status,
			startTime: agent.startTime,
		}));
	}

	public isAgentRunning(agentId: string): boolean {
		return this.runningAgents.has(agentId);
	}

	public async startAgent(
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
		const envVars = this.loadEnvironmentVariables(agent.directory);

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

		// Setup process event handlers
		this.setupProcessHandlers(agentProcess, agent, agentId, agentData);

		// Send initial success message
		this.emitMessage({
			id: Date.now(),
			type: "system",
			content: `Agent ${agent.name} started`,
			agentId,
			timestamp: new Date().toISOString(),
		});

		return agentProcess;
	}

	public stopAgent(agentId: string): boolean {
		const agentProcess = this.runningAgents.get(agentId);

		if (!agentProcess) {
			return false;
		}

		try {
			agentProcess.process.kill("SIGTERM");
			this.runningAgents.delete(agentId);
			return true;
		} catch (error: any) {
			console.error(
				chalk.red(`Failed to stop agent ${agentId}:`),
				error.message,
			);
			throw error;
		}
	}

	public sendMessageToAgent(agentId: string, message: string): boolean {
		const agentProcess = this.runningAgents.get(agentId);

		if (!agentProcess || !agentProcess.process.stdin) {
			return false;
		}

		try {
			agentProcess.process.stdin.write(`${message}\n`);
			return true;
		} catch (error: any) {
			console.error(
				chalk.red(`Failed to send message to agent ${agentId}:`),
				error.message,
			);
			throw error;
		}
	}

	public stopAllAgents(): void {
		console.log(chalk.yellow("\n🛑 Stopping all running agents..."));

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
	}

	public checkTsxAvailable(): boolean {
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

	private findNodeExecutable(): string {
		// Always use the same Node.js executable that's running this server
		return process.execPath;
	}

	private loadEnvironmentVariables(agentDirectory: string): NodeJS.ProcessEnv {
		const envPath = join(agentDirectory, ".env");
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

		return envVars;
	}

	private setupProcessHandlers(
		agentProcess: ChildProcess,
		agent: AgentFile,
		agentId: string,
		agentData: AgentProcess,
	): void {
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
					if (responseMatch?.[1]) {
						content = responseMatch[1].trim();
					}
				}

				// Always emit the message, but mark agent responses specially
				const messageType = isAgentResponse ? "agent" : "stdout";

				const socketMessage: SocketMessage = {
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

				this.emitMessage(socketMessage);
			}
		});

		agentProcess.stderr?.on("data", (data) => {
			const message = data.toString();
			console.error(chalk.red(`[${agent.name}] ${message.trim()}`));

			this.emitMessage({
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

			this.emitMessage({
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

			this.emitMessage({
				id: Date.now(),
				type: "error",
				content: `Process error: ${error.message}`,
				agentId,
				timestamp: new Date().toISOString(),
			});

			// Provide helpful error messages for common issues
			if (error.message.includes("ENOENT")) {
				if (agentProcess.spawnargs.some((arg) => arg.includes("npx"))) {
					console.error(
						chalk.red(
							"💡 Tip: Make sure 'tsx' is installed. Run: npm install -g tsx",
						),
					);
				} else {
					console.error(chalk.red("💡 Tip: Command not found"));
				}
			}
		});
	}

	private emitMessage(message: SocketMessage): void {
		this.io.to(`agent-${message.agentId}`).emit("agentMessage", message);
	}
}
