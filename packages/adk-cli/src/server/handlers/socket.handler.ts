import chalk from "chalk";
import type { Server } from "socket.io";

export class SocketHandler {
	constructor(private io: Server) {
		this.setupHandlers();
	}

	private setupHandlers(): void {
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
}
