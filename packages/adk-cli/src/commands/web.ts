import chalk from "chalk";
import open from "open";
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
	const apiPort = options.port || 3001;
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

	const apiUrl = `http://${host}:${apiPort}`;
	let webAppUrl: string;

	if (useLocal) {
		// Local development: assume web app is already running on webPort
		webAppUrl = `http://${host}:${webPort}?apiUrl=${encodeURIComponent(apiUrl)}`;
		console.log(chalk.green(`✅ Local web interface ready at ${webAppUrl}`));
	} else {
		// Production: use hosted web interface
		webAppUrl = `${webUrl}?apiUrl=${encodeURIComponent(apiUrl)}`;
		console.log(chalk.green(`✅ Web interface ready at ${webAppUrl}`));
	}

	try {
		await open(webAppUrl);
	} catch (error) {
		console.log(chalk.cyan(webAppUrl));
	}

	console.log(chalk.cyan("Press Ctrl+C to stop the API server"));
}
