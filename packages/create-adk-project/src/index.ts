import { main } from "./create-project";
import { runAdkCli } from "./cli";

const isCreateOnly =
	process.argv0?.includes("create-adk-project") ||
	process.env.CREATE_ONLY === "true";

if (isCreateOnly) {
	main().catch(console.error);
} else {
	runAdkCli().catch((error) => {
		console.error("CLI Error:", error);
		process.exit(1);
	});
}
