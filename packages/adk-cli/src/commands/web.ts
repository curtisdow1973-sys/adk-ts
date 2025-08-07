import chalk from "chalk";
import { type ServeOptions, serveCommand } from "./serve.js";

export interface WebCommandOptions {
	port?: number;
	dir?: string;
	host?: string;
	webPort?: number;
	local?: boolean;
	webUrl?: string;
}

export async function webCommand(
	options: WebCommandOptions = {},
): Promise<void> {
	const apiPort = options.port || 8042; // Default to port 8042 to match serve command
	const webPort = options.webPort || 3000;
	const host = options.host || "localhost";
	const useLocal = options.local || false;
	const webUrl = options.webUrl || "https://adk-web.iqai.com";

	console.log(chalk.blue("🌐 Starting ADK Web Interface..."));

	// Start the API server first
	const serveOptions: ServeOptions = {
		port: apiPort,
		dir: options.dir,
		host,
		quiet: true,
	};

	await serveCommand(serveOptions);

	let webAppUrl: string;

	if (useLocal) {
		// Local development: assume web app is already running on webPort
		// Only add port parameter if it's not the default
		if (apiPort === 8042) {
			webAppUrl = `http://${host}:${webPort}`;
		} else {
			webAppUrl = `http://${host}:${webPort}?port=${apiPort}`;
		}
	} else {
		// Production: use hosted web interface
		// Only add port parameter if it's not the default
		if (apiPort === 8042) {
			webAppUrl = webUrl;
		} else {
			webAppUrl = `${webUrl}?port=${apiPort}`;
		}
	}

	// Show the URL and server info
	console.log(chalk.cyan(`🔗 Open this URL in your browser: ${webAppUrl}`));
	console.log(chalk.gray(`   API Server: http://${host}:${apiPort}`));

	console.log(chalk.cyan("Press Ctrl+C to stop the API server"));
}
