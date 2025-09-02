#!/usr/bin/env node
import "reflect-metadata";

import { CommandFactory } from "nest-commander";
import { AppModule } from "./app.module";

// Decide how noisy Nest should be based on the invoked command.
// We only want framework bootstrap logs when actually starting a server
// (serve / run / web). Plain `adk` (help) should be clean.
function selectLogger(): any {
	const args = process.argv.slice(2);
	// Allow opt-in full Nest logs for debugging
	if (process.env.ADK_DEBUG_NEST === "1") {
		return ["log", "error", "warn", "debug", "verbose"] as const;
	}
	// If first arg is one of the server-related commands, keep errors & warnings only.
	const serverCommands = new Set(["serve", "run", "web"]);
	const isHelp = args.includes("--help") || args.includes("-h");
	if (args.length > 0 && serverCommands.has(args[0]) && !isHelp) {
		// Show standard Nest logs while actually starting a server / running agent chat.
		return ["log", "error", "warn"] as const;
	}
	// Help / no command: disable Nest logger completely.
	return false; // no framework bootstrap logs
}

async function bootstrap() {
	await CommandFactory.run(AppModule, {
		logger: selectLogger(),
	});
}

bootstrap();
