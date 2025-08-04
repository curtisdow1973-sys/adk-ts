#!/usr/bin/env node

import { main } from "./create-project";
import { runAdkCli } from "./cli";

// Check if being called as create-adk-project specifically
const isCreateOnly =
	process.argv0?.includes("create-adk-project") ||
	process.env.CREATE_ONLY === "true";

if (isCreateOnly) {
	// Run only the create functionality (legacy mode)
	main().catch(console.error);
} else {
	// Run the full CLI (default mode)
	runAdkCli().catch((error) => {
		console.error("CLI Error:", error);
		process.exit(1);
	});
}
