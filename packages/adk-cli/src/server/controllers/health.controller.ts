import type { Context } from "hono";

export class HealthController {
	public async getHealth(c: Context) {
		return c.json({ status: "ok", timestamp: new Date().toISOString() });
	}
}
