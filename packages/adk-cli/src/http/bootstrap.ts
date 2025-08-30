import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { HttpModule } from "./http.module";
import { AgentManager } from "./modules/providers/agent-manager.service";
import type { RuntimeConfig } from "./runtime-config";

export interface StartedHttpServer {
	app: NestExpressApplication;
	url: string;
	stop: () => Promise<void>;
}

/**
 * Start a Nest Express HTTP server with the ADK controllers and providers.
 * Mirrors previous Hono server endpoints:
 * - GET /health
 * - /api/agents ...
 * - /api/agents/:id/sessions ...
 */
export async function startHttpServer(
	config: RuntimeConfig,
): Promise<StartedHttpServer> {
	const app = await NestFactory.create<NestExpressApplication>(
		HttpModule.register(config),
		{ logger: config.quiet ? ["error", "warn"] : ["log", "error", "warn"] },
	);

	// CORS parity with previous Hono app.use("/*", cors())
	app.enableCors({
		origin: true,
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization"],
	});

	// Initial agent scan (parity with ADKServer constructor)
	const agentManager = app.get(AgentManager, { strict: false });
	agentManager.scanAgents(config.agentsDir);

	await app.listen(config.port, config.host);
	const url = `http://${config.host}:${config.port}`;

	const stop = async () => {
		try {
			// Graceful shutdown: stop all agents first
			agentManager.stopAllAgents();
		} finally {
			await app.close();
		}
	};

	return { app, url, stop };
}
