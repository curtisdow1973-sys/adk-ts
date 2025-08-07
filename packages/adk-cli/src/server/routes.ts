import { Hono } from "hono";
import { AgentController, HealthController } from "./controllers/index.js";
import { corsMiddleware } from "./middleware/index.js";
import type { AgentManagementService } from "./services/agent-management.service.js";
import type { AgentScannerService } from "./services/agent-scanner.service.js";

export function createApiRoutes(
	agentScanner: AgentScannerService,
	agentManager: AgentManagementService,
): Hono {
	const app = new Hono();

	// Initialize controllers
	const healthController = new HealthController();
	const agentController = new AgentController(agentScanner, agentManager);

	// Apply middleware
	app.use("*", corsMiddleware);

	// Health routes
	app.get("/health", healthController.getHealth.bind(healthController));

	// Agent routes
	app.get("/api/agents", agentController.getAgents.bind(agentController));
	app.get(
		"/api/agents/running",
		agentController.getRunningAgents.bind(agentController),
	);
	app.post(
		"/api/agents/:agentId/start",
		agentController.startAgent.bind(agentController),
	);
	app.post(
		"/api/agents/:agentId/stop",
		agentController.stopAgent.bind(agentController),
	);
	app.post(
		"/api/agents/:agentId/message",
		agentController.sendMessageToAgent.bind(agentController),
	);

	return app;
}
