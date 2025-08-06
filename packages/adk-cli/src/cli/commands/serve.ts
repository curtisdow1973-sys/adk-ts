import { existsSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { ADKServer } from "../../server/api.js";

export interface ServeOptions {
	port?: number;
	dir?: string;
	host?: string;
	quiet?: boolean;
}

export async function serveCommand(
	options: ServeOptions = {},
): Promise<ADKServer> {
	const port = options.port || 3001;
	const host = options.host || "localhost";
	const agentsDir = resolve(options.dir || ".");

	if (!existsSync(agentsDir)) {
		console.error(chalk.red(`❌ Directory not found: ${agentsDir}`));
		process.exit(1);
	}

	if (!options.quiet) {
		console.log(chalk.blue("🚀 Starting ADK Server..."));
		console.log(chalk.gray(`   Agents directory: ${agentsDir}`));
		console.log(chalk.gray(`   Server address: http://${host}:${port}`));
	}

	const server = new ADKServer(agentsDir, port, host);

	try {
		await server.start();

		if (!options.quiet) {
			console.log(
				chalk.green(`✅ ADK Server running at http://${host}:${port}`),
			);
			console.log(chalk.cyan("   API endpoints:"));
			console.log(chalk.gray("   • GET  /health         - Health check"));
			console.log(
				chalk.gray("   • GET  /agents         - List available agents"),
			);
			console.log(chalk.gray("   • POST /agents/:id/run - Start an agent"));
			console.log(chalk.gray("   • POST /agents/:id/stop - Stop an agent"));
			console.log(
				chalk.gray("   • WS   /socket.io      - Real-time communication"),
			);
			console.log();
			console.log(chalk.yellow("Press Ctrl+C to stop the server"));
		}

		// Handle shutdown gracefully
		const cleanup = async () => {
			if (!options.quiet) {
				console.log(chalk.yellow("\n🛑 Shutting down ADK Server..."));
			}
			await server.stop();
			if (!options.quiet) {
				console.log(chalk.green("✅ Server stopped"));
			}
			process.exit(0);
		};

		process.on("SIGINT", cleanup);
		process.on("SIGTERM", cleanup);

		return server;
	} catch (error) {
		console.error(chalk.red("❌ Failed to start ADK server:"), error);
		process.exit(1);
	}
}
