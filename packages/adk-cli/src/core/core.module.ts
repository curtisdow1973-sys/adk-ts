import { InMemorySessionService } from "@iqai/adk";
import { Module, type Provider } from "@nestjs/common";
import { TOKENS } from "../common/tokens";

import { AgentLoader } from "./services/agent-loader.service";
import { AgentManager } from "./services/agent-manager.service";
import { AgentScanner } from "./services/agent-scanner.service";
import { SessionManager } from "./services/session-manager.service";

const providers: Provider[] = [
	// Defaults (overridable via dynamic modules or command bootstrap)
	{ provide: TOKENS.QUIET, useValue: false },
	{ provide: TOKENS.AGENTS_DIR, useValue: process.cwd() },

	// Core session service from @iqai/adk
	{
		provide: InMemorySessionService,
		useFactory: () => new InMemorySessionService(),
	},

	// Core services wired through DI (factories), passing quiet flag and session service
	{
		provide: AgentScanner,
		inject: [TOKENS.QUIET],
		useFactory: (quiet: boolean) => new AgentScanner(quiet),
	},
	{
		provide: AgentLoader,
		inject: [TOKENS.QUIET],
		useFactory: (quiet: boolean) => new AgentLoader(quiet),
	},
	{
		provide: AgentManager,
		inject: [InMemorySessionService, TOKENS.QUIET],
		useFactory: (sessionService: InMemorySessionService, quiet: boolean) =>
			new AgentManager(sessionService, quiet),
	},
	{
		provide: SessionManager,
		inject: [InMemorySessionService, TOKENS.QUIET],
		useFactory: (sessionService: InMemorySessionService, quiet: boolean) =>
			new SessionManager(sessionService, quiet),
	},
];

@Module({
	providers,
	exports: [
		InMemorySessionService,
		AgentScanner,
		AgentLoader,
		AgentManager,
		SessionManager,
		TOKENS.QUIET,
		TOKENS.AGENTS_DIR,
	],
})
export class CoreModule {}
