import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";

@ApiTags("health")
@Controller()
export class HealthController {
	@Get("health")
	@ApiOperation({
		summary: "Health check",
		description:
			"Basic liveness probe returning status: ok when the service is up.",
	})
	health() {
		return { status: "ok" };
	}
}
