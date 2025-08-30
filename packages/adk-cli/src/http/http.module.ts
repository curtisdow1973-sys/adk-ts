import { type DynamicModule, Module } from "@nestjs/common";
import { TOKENS } from "../common/tokens";
import { CoreModule } from "../core/core.module";
import { RUNTIME_CONFIG, type RuntimeConfig } from "./runtime-config";

// Controllers
import { AgentsController } from "./controllers/agents.controller";
import { HealthController } from "./controllers/health.controller";
import { SessionsController } from "./controllers/sessions.controller";

@Module({})
export class HttpModule {
	static register(config: RuntimeConfig): DynamicModule {
		return {
			module: HttpModule,
			imports: [CoreModule],
			controllers: [AgentsController, SessionsController, HealthController],
			providers: [
				{ provide: RUNTIME_CONFIG, useValue: config },
				{ provide: TOKENS.AGENTS_DIR, useValue: config.agentsDir },
				{ provide: TOKENS.QUIET, useValue: config.quiet },
			],
			exports: [],
		};
	}
}
