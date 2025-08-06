import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import open from "open";
import { type ServeOptions, serveCommand } from "./serve.js";

export interface WebOptions {
	port?: number;
	dir?: string;
	host?: string;
	webPort?: number;
	local?: boolean;
	webUrl?: string;
}

export async function webCommand(options: WebOptions = {}): Promise<void> {
	const apiPort = options.port || 3001;
	const webPort = options.webPort || 3000;
	const host = options.host || "localhost";
	let useLocal = options.local || false;
	const webUrl = options.webUrl || "https://adk-web.iqai.com";

	console.log(chalk.blue("🌐 Starting ADK Web Interface..."));

	// Start the API server first
	const serveOptions: ServeOptions = {
		port: apiPort,
		dir: options.dir,
		host,
		quiet: true,
	};

	console.log(chalk.blue("🚀 Starting ADK API Server..."));
	const server = await serveCommand(serveOptions);

	if (useLocal) {
		// Try to run local web app
		const webAppPath = findWebAppPath();

		if (!webAppPath) {
			console.log(chalk.red("❌ Could not find adk-web app directory"));
			console.log(
				chalk.yellow("� Make sure you're running from the ADK workspace root"),
			);
			console.log(
				chalk.yellow("🔗 Falling back to production web interface..."),
			);
			useLocal = false;
		} else {
			console.log(chalk.blue("🌐 Starting local web app..."));

			// Start the Next.js development server
			const webProcess = spawn("pnpm", ["dev", "--port", webPort.toString()], {
				cwd: webAppPath,
				stdio: "inherit",
				shell: true,
			});

			// Wait a moment for the web server to start
			await new Promise((resolve) => setTimeout(resolve, 3000));

			const webAppUrl = `http://${host}:${webPort}`;
			console.log(
				chalk.green(`✅ ADK API Server running at http://${host}:${apiPort}`),
			);
			console.log(chalk.green(`✅ ADK Web App running at ${webAppUrl}`));

			try {
				await open(webAppUrl);
				console.log(chalk.green("✅ Local web interface opened in browser"));
			} catch (error) {
				console.log(
					chalk.yellow("⚠️  Could not auto-open browser. Please visit:"),
				);
				console.log(chalk.cyan(webAppUrl));
			}

			console.log();
			console.log(
				chalk.yellow("🔄 Local web interface is connected to your ADK server"),
			);
			console.log(
				chalk.gray(
					"   Any agents you run will be accessible through the web UI",
				),
			);
			console.log();
			console.log(chalk.cyan("Press Ctrl+C to stop both servers"));

			// Handle cleanup
			process.on("SIGINT", () => {
				console.log(chalk.yellow("\n🛑 Shutting down servers..."));
				webProcess.kill("SIGTERM");
				process.exit(0);
			});

			process.on("SIGTERM", () => {
				webProcess.kill("SIGTERM");
				process.exit(0);
			});

			return;
		}
	}

	// Use production web interface
	console.log(chalk.blue("🔗 Opening production web interface..."));

	const apiUrl = `http://${host}:${apiPort}`;
	const webAppUrl = `${webUrl}?apiUrl=${encodeURIComponent(apiUrl)}`;

	try {
		await open(webAppUrl);
		console.log(chalk.green("✅ Production web interface opened in browser"));
	} catch (error) {
		console.log(chalk.yellow("⚠️  Could not auto-open browser. Please visit:"));
		console.log(chalk.cyan(webAppUrl));
	}

	console.log();
	console.log(
		chalk.green(`✅ ADK API Server running at http://${host}:${apiPort}`),
	);
	console.log(
		chalk.yellow("🔄 Production web interface is connected to your ADK server"),
	);
	console.log(
		chalk.gray("   Any agents you run will be accessible through the web UI"),
	);
	console.log();
	console.log(chalk.cyan("Press Ctrl+C to stop the API server"));
}

function findWebAppPath(): string | null {
	// Try to find the adk-web app relative to the CLI package
	const possiblePaths = [
		// From packages/adk-cli to apps/adk-web
		join(process.cwd(), "../../apps/adk-web"),
		join(__dirname, "../../../apps/adk-web"),
		join(__dirname, "../../../../apps/adk-web"),
		// If running from workspace root
		join(process.cwd(), "apps/adk-web"),
		// If running from anywhere in the workspace
		join(process.cwd(), "../apps/adk-web"),
		join(process.cwd(), "../../apps/adk-web"),
	];

	for (const path of possiblePaths) {
		if (existsSync(join(path, "package.json"))) {
			return path;
		}
	}

	return null;
}

// Legacy function name for backward compatibility
export const startWebUI = webCommand;
