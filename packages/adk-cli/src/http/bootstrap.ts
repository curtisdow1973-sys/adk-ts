import "reflect-metadata";

import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { resolve } from "node:path";
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

	// Hot reloading: watch agent directories and optional watchPaths to refresh agents on change
	const watchers: FSWatcher[] = [];
	const debouncers: NodeJS.Timeout[] = [];
	const shouldWatch = config.hotReload ?? process.env.NODE_ENV !== "production";
	if (shouldWatch) {
		const rawPaths =
			Array.isArray(config.watchPaths) && config.watchPaths.length > 0
				? config.watchPaths
				: [config.agentsDir];
		const paths = rawPaths.filter(Boolean).map((p) => resolve(p as string));
		for (const p of paths) {
			try {
				const watcher = watch(
					p,
					// recursive is supported on macOS and Windows; best-effort on others
					{ recursive: true },
					(_event, filename) => {
						// Simple global debounce: clear pending reloads and schedule a new one
						while (debouncers.length) {
							const t = debouncers.pop();
							if (t) clearTimeout(t);
						}
						const t = setTimeout(async () => {
							try {
								// Clear running agents so next use reloads fresh code, then rescan
								agentManager.stopAllAgents();
								agentManager.scanAgents(config.agentsDir);
								if (!config.quiet) {
									console.log(
										`[hot-reload] Reloaded agents after change in ${filename ?? p}`,
									);
								}
							} catch (e) {
								console.error("[hot-reload] Error during reload:", e);
							}
						}, 300);
						debouncers.push(t);
					},
				);
				watchers.push(watcher);
				if (!config.quiet) {
					console.log(`[hot-reload] Watching ${p}`);
				}
			} catch (e) {
				console.warn(
					`[hot-reload] Failed to watch ${p}: ${
						e instanceof Error ? e.message : String(e)
					}`,
				);
			}
		}
	}

	await app.listen(config.port, config.host);
	const url = `http://${config.host}:${config.port}`;

	const stop = async () => {
		try {
			// Graceful shutdown: stop all agents first
			agentManager.stopAllAgents();
		} finally {
			// Tear down file watchers and any pending timers
			for (const t of debouncers) {
				clearTimeout(t);
			}
			for (const w of watchers) {
				try {
					w.close();
				} catch {}
			}
			await app.close();
		}
	};

	return { app, url, stop };
}
