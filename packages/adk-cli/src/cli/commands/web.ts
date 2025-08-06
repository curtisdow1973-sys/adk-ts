import { existsSync, readdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, join, resolve } from "node:path";
import chalk from "chalk";
import cors from "cors";
import express from "express";
import { Server } from "socket.io";

interface AgentFile {
	path: string;
	name: string;
	directory: string;
	relativePath: string;
}

function findAgentFiles(directory: string): AgentFile[] {
	const agents: AgentFile[] = [];

	if (!existsSync(directory)) {
		return agents;
	}

	function scanDirectory(dir: string, baseDir: string = directory) {
		try {
			const entries = readdirSync(dir);

			for (const entry of entries) {
				const fullPath = join(dir, entry);
				const stat = statSync(fullPath);

				if (stat.isDirectory()) {
					// Recursively scan subdirectories
					scanDirectory(fullPath, baseDir);
				} else if (stat.isFile()) {
					// Check if it's an agent file (agent.ts or agent.js)
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
	}

	scanDirectory(directory);
	return agents;
}

const webUIHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>ADK Agent Testing Interface</title>
	<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
	<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
	<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
	<script src="/socket.io/socket.io.js"></script>
	<style>
		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			min-height: 100vh;
			color: #333;
		}

		.container {
			max-width: 1200px;
			margin: 0 auto;
			padding: 20px;
		}

		.header {
			text-align: center;
			margin-bottom: 30px;
			color: white;
		}

		.header h1 {
			font-size: 2.5rem;
			margin-bottom: 10px;
			text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
		}

		.header p {
			font-size: 1.1rem;
			opacity: 0.9;
		}

		.main-content {
			display: grid;
			grid-template-columns: 1fr 2fr;
			gap: 20px;
			height: calc(100vh - 200px);
		}

		.agents-panel {
			background: white;
			border-radius: 12px;
			padding: 20px;
			box-shadow: 0 8px 32px rgba(0,0,0,0.1);
			overflow-y: auto;
		}

		.chat-panel {
			background: white;
			border-radius: 12px;
			box-shadow: 0 8px 32px rgba(0,0,0,0.1);
			display: flex;
			flex-direction: column;
		}

		.agents-list {
			list-style: none;
		}

		.agent-item {
			padding: 12px;
			margin-bottom: 8px;
			border-radius: 8px;
			background: #f8f9fa;
			border: 2px solid transparent;
			cursor: pointer;
			transition: all 0.2s ease;
		}

		.agent-item:hover {
			background: #e9ecef;
			transform: translateY(-1px);
		}

		.agent-item.active {
			background: #e3f2fd;
			border-color: #2196f3;
		}

		.agent-name {
			font-weight: 600;
			color: #2c3e50;
			margin-bottom: 4px;
		}

		.agent-path {
			font-size: 0.85rem;
			color: #6c757d;
			font-family: 'Monaco', 'Menlo', monospace;
		}

		.chat-header {
			padding: 20px;
			border-bottom: 1px solid #e9ecef;
			background: #f8f9fa;
			border-radius: 12px 12px 0 0;
		}

		.chat-messages {
			flex: 1;
			padding: 20px;
			overflow-y: auto;
			background: white;
		}

		.chat-input-container {
			padding: 20px;
			border-top: 1px solid #e9ecef;
			background: #f8f9fa;
			border-radius: 0 0 12px 12px;
		}

		.chat-input {
			width: 100%;
			padding: 12px 16px;
			border: 2px solid #e9ecef;
			border-radius: 25px;
			font-size: 1rem;
			outline: none;
			transition: border-color 0.2s ease;
		}

		.chat-input:focus {
			border-color: #2196f3;
		}

		.message {
			margin-bottom: 16px;
			padding: 12px 16px;
			border-radius: 18px;
			max-width: 80%;
			word-wrap: break-word;
		}

		.message.user {
			background: #2196f3;
			color: white;
			margin-left: auto;
		}

		.message.assistant {
			background: #f1f3f4;
			color: #333;
		}

		.message.system {
			background: #fff3cd;
			color: #856404;
			text-align: center;
			max-width: 100%;
		}

		.empty-state {
			text-align: center;
			color: #6c757d;
			padding: 40px;
		}

		.empty-state h3 {
			margin-bottom: 10px;
			color: #495057;
		}

		.status-indicator {
			display: inline-block;
			width: 8px;
			height: 8px;
			border-radius: 50%;
			margin-right: 8px;
		}

		.status-indicator.running {
			background: #28a745;
		}

		.status-indicator.stopped {
			background: #dc3545;
		}

		.btn {
			padding: 8px 16px;
			border: none;
			border-radius: 6px;
			cursor: pointer;
			font-size: 0.9rem;
			transition: all 0.2s ease;
		}

		.btn-primary {
			background: #2196f3;
			color: white;
		}

		.btn-primary:hover {
			background: #1976d2;
		}

		.btn-secondary {
			background: #6c757d;
			color: white;
		}

		.btn-secondary:hover {
			background: #545b62;
		}
	</style>
</head>
<body>
	<div id="root"></div>

	<script type="text/babel">
		const { useState, useEffect } = React;

		function App() {
			const [agents, setAgents] = useState([]);
			const [selectedAgent, setSelectedAgent] = useState(null);
			const [messages, setMessages] = useState([]);
			const [inputMessage, setInputMessage] = useState('');
			const [agentStatus, setAgentStatus] = useState({});
			const [socket, setSocket] = useState(null);

			useEffect(() => {
				// Initialize socket connection
				const newSocket = io();
				setSocket(newSocket);

				// Fetch available agents
				fetch('/api/agents')
					.then(res => res.json())
					.then(data => setAgents(data));

				// Listen for agent status updates
				newSocket.on('agentStatus', (status) => {
					setAgentStatus(prev => ({ ...prev, ...status }));
				});

				// Listen for agent messages
				newSocket.on('agentMessage', (message) => {
					if (message.agentId === selectedAgent?.path) {
						setMessages(prev => [...prev, message]);
					}
				});

				return () => newSocket.close();
			}, []);

			const selectAgent = (agent) => {
				setSelectedAgent(agent);
				setMessages([{
					id: Date.now(),
					type: 'system',
					content: \`Selected agent: \${agent.name}\`
				}]);
			};

			const sendMessage = (e) => {
				e.preventDefault();
				if (!inputMessage.trim() || !selectedAgent) return;

				const message = {
					id: Date.now(),
					type: 'user',
					content: inputMessage,
					agentId: selectedAgent.path
				};

				setMessages(prev => [...prev, message]);

				// Send to agent via socket
				socket.emit('sendToAgent', {
					agentId: selectedAgent.path,
					message: inputMessage
				});

				setInputMessage('');
			};

			const startAgent = (agent) => {
				socket.emit('startAgent', { agentId: agent.path });
			};

			const stopAgent = (agent) => {
				socket.emit('stopAgent', { agentId: agent.path });
			};

			return (
				<div className="container">
					<div className="header">
						<h1>🤖 ADK Agent Testing Interface</h1>
						<p>Select an agent from the left panel to start testing</p>
					</div>

					<div className="main-content">
						<div className="agents-panel">
							<h3 style={{marginBottom: '20px', color: '#2c3e50'}}>
								📁 Available Agents ({agents.length})
							</h3>

							{agents.length === 0 ? (
								<div className="empty-state">
									<h4>No agents found</h4>
									<p>Create agent.ts files in the ./agents directory</p>
								</div>
							) : (
								<ul className="agents-list">
									{agents.map(agent => (
										<li
											key={agent.path}
											className={\`agent-item \${selectedAgent?.path === agent.path ? 'active' : ''}\`}
											onClick={() => selectAgent(agent)}
										>
											<div className="agent-name">
												<span className={\`status-indicator \${agentStatus[agent.path] === 'running' ? 'running' : 'stopped'}\`}></span>
												{agent.name}
											</div>
											<div className="agent-path">{agent.relativePath}</div>
											<div style={{marginTop: '8px'}}>
												{agentStatus[agent.path] === 'running' ? (
													<button
														className="btn btn-secondary"
														onClick={(e) => {
															e.stopPropagation();
															stopAgent(agent);
														}}
													>
														Stop
													</button>
												) : (
													<button
														className="btn btn-primary"
														onClick={(e) => {
															e.stopPropagation();
															startAgent(agent);
														}}
													>
														Start
													</button>
												)}
											</div>
										</li>
									))}
								</ul>
							)}
						</div>

						<div className="chat-panel">
							{selectedAgent ? (
								<>
									<div className="chat-header">
										<h3>💬 Chat with {selectedAgent.name}</h3>
										<p style={{color: '#6c757d', marginTop: '4px'}}>
											Status: <span style={{color: agentStatus[selectedAgent.path] === 'running' ? '#28a745' : '#dc3545'}}>
												{agentStatus[selectedAgent.path] || 'stopped'}
											</span>
										</p>
									</div>

									<div className="chat-messages">
										{messages.map(message => (
											<div key={message.id} className={\`message \${message.type}\`}>
												{message.content}
											</div>
										))}
									</div>

									<div className="chat-input-container">
										<form onSubmit={sendMessage}>
											<input
												type="text"
												className="chat-input"
												placeholder="Type your message..."
												value={inputMessage}
												onChange={(e) => setInputMessage(e.target.value)}
											/>
										</form>
									</div>
								</>
							) : (
								<div className="empty-state">
									<h3>👈 Select an agent to start chatting</h3>
									<p>Choose an agent from the left panel to begin testing</p>
								</div>
							)}
						</div>
					</div>
				</div>
			);
		}

		ReactDOM.render(<App />, document.getElementById('root'));
	</script>
</body>
</html>
`;

export async function startWebUI(
	options: { port?: string; dir?: string } = {},
) {
	const port = Number.parseInt(options.port || "3001", 10);
	const agentsDir = resolve(options.dir || "./agents");

	console.log(chalk.blue("🚀 Starting ADK Web Interface..."));
	console.log(chalk.gray(`Scanning for agents in: ${agentsDir}`));

	const app = express();
	const server = createServer(app);
	const io = new Server(server, {
		cors: {
			origin: "*",
			methods: ["GET", "POST"],
		},
	});

	app.use(cors());
	app.use(express.json());

	// Serve the web UI
	app.get("/", (req, res) => {
		res.send(webUIHtml);
	});

	// API endpoint to get available agents
	app.get("/api/agents", (req, res) => {
		const agents = findAgentFiles(agentsDir);
		res.json(agents);
	});

	// Track running agents
	const runningAgents = new Map();

	// Socket.IO connection handling
	io.on("connection", (socket) => {
		console.log(chalk.green("👤 Client connected"));

		// Send current agent statuses
		const statuses: Record<string, string> = {};
		for (const [agentId, process] of runningAgents) {
			statuses[agentId] = "running";
		}
		socket.emit("agentStatus", statuses);

		socket.on("startAgent", ({ agentId }) => {
			if (runningAgents.has(agentId)) {
				socket.emit("agentMessage", {
					id: Date.now(),
					type: "system",
					content: "Agent is already running",
					agentId,
				});
				return;
			}

			try {
				const { spawn } = require("node:child_process");
				const isTypeScript = extname(agentId) === ".ts";
				const command = isTypeScript ? "npx" : "node";
				const args = isTypeScript ? ["tsx", agentId] : [agentId];

				const agentProcess = spawn(command, args, {
					cwd: process.cwd(),
					env: { ...process.env, NODE_ENV: "development" },
					stdio: ["pipe", "pipe", "pipe"],
				});

				runningAgents.set(agentId, agentProcess);

				socket.emit("agentMessage", {
					id: Date.now(),
					type: "system",
					content: "Agent started successfully",
					agentId,
				});

				io.emit("agentStatus", { [agentId]: "running" });

				agentProcess.stdout?.on("data", (data: Buffer) => {
					socket.emit("agentMessage", {
						id: Date.now(),
						type: "assistant",
						content: data.toString(),
						agentId,
					});
				});

				agentProcess.stderr?.on("data", (data: Buffer) => {
					socket.emit("agentMessage", {
						id: Date.now(),
						type: "system",
						content: `Error: ${data.toString()}`,
						agentId,
					});
				});

				agentProcess.on("exit", (code: number | null) => {
					runningAgents.delete(agentId);
					io.emit("agentStatus", { [agentId]: "stopped" });
					socket.emit("agentMessage", {
						id: Date.now(),
						type: "system",
						content: `Agent exited with code ${code}`,
						agentId,
					});
				});
			} catch (error) {
				socket.emit("agentMessage", {
					id: Date.now(),
					type: "system",
					content: `Failed to start agent: ${error}`,
					agentId,
				});
			}
		});

		socket.on("stopAgent", ({ agentId }) => {
			const agentProcess = runningAgents.get(agentId);
			if (agentProcess) {
				agentProcess.kill("SIGTERM");
				runningAgents.delete(agentId);
				io.emit("agentStatus", { [agentId]: "stopped" });
				socket.emit("agentMessage", {
					id: Date.now(),
					type: "system",
					content: "Agent stopped",
					agentId,
				});
			}
		});

		socket.on("sendToAgent", ({ agentId, message }) => {
			const agentProcess = runningAgents.get(agentId);
			if (agentProcess?.stdin) {
				agentProcess.stdin.write(`${message}\n`);
			} else {
				socket.emit("agentMessage", {
					id: Date.now(),
					type: "system",
					content: "Agent is not running or does not accept input",
					agentId,
				});
			}
		});

		socket.on("disconnect", () => {
			console.log(chalk.yellow("👤 Client disconnected"));
		});
	});

	// Handle shutdown gracefully
	process.on("SIGINT", () => {
		console.log(chalk.yellow("\n🛑 Shutting down web interface..."));

		// Stop all running agents
		for (const [agentId, agentProcess] of runningAgents) {
			agentProcess.kill("SIGTERM");
		}

		server.close(() => {
			process.exit(0);
		});
	});

	server.listen(port, () => {
		console.log(chalk.green("✅ ADK Web Interface started!"));
		console.log(chalk.cyan(`🌐 Open http://localhost:${port} in your browser`));
		console.log(chalk.gray(`📁 Watching for agents in: ${agentsDir}`));
		console.log(chalk.gray("Press Ctrl+C to stop"));
	});
}
