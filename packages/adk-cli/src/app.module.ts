import { Module } from "@nestjs/common";
import { CliModule } from "./cli/cli.module";
import { CoreModule } from "./core/core.module";

@Module({
	imports: [
		// Root composition: CLI commands + core services.
		// HTTP server is bootstrapped on demand from the ServeCommand via http/bootstrap.
		CoreModule,
		CliModule,
	],
})
export class AppModule {}
