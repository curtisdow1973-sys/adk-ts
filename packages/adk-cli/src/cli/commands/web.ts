import chalk from "chalk";
import open from "open";
import { serveCommand, type ServeOptions } from "./serve.js";

export interface WebOptions {
	port?: number;
	dir?: string;
	host?: string;
	webUrl?: string;
}

export async function webCommand(options: WebOptions = {}): Promise<void> {
	const port = options.port || 3001;
	const host = options.host || "localhost";
	const webUrl = options.webUrl || "https://adk-web.iqai.com";

	console.log(chalk.blue("🌐 Starting ADK Web Interface..."));

	// Start the server (quietly since we'll handle our own messaging)
	const serveOptions: ServeOptions = {
		port,
		dir: options.dir,
		host,
		quiet: true
	};

	const server = await serveCommand(serveOptions);

	// Construct the web app URL with API endpoint
	const apiUrl = `http://${host}:${port}`;
	const webAppUrl = `${webUrl}?apiUrl=${encodeURIComponent(apiUrl)}`;
	
	console.log(chalk.green(`✅ ADK Server running at ${apiUrl}`));
	console.log(chalk.cyan(`🚀 Opening web interface: ${webAppUrl}`));
	
	try {
		await open(webAppUrl);
		console.log(chalk.green("✅ Web interface opened in browser"));
	} catch (error) {
		console.log(chalk.yellow("⚠️  Could not auto-open browser. Please visit:"));
		console.log(chalk.cyan(webAppUrl));
	}

	console.log();
	console.log(chalk.yellow("🔄 Web interface is connected to your local ADK server"));
	console.log(chalk.gray("   Any agents you run will be accessible through the web UI"));
	console.log(chalk.yellow("Press Ctrl+C to stop both server and web interface"));
}

// Legacy function name for backward compatibility
export const startWebUI = webCommand;
