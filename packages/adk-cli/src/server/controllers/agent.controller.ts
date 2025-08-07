import type { Context } from "hono";
import type { AgentManagementService } from "../services/agent-management.service.js";
import type { AgentScannerService } from "../services/agent-scanner.service.js";

export class AgentController {
	constructor(
		private agentScanner: AgentScannerService,
		private agentManager: AgentManagementService,
	) {}

	public async getAgents(c: Context) {
		const agents = await this.agentScanner.findAgentFiles();
		return c.json({ agents });
	}

	public async getRunningAgents(c: Context) {
		const running = this.agentManager.getRunningAgents();
		return c.json({ running });
	}

	public async startAgent(c: Context) {
		const agentId = c.req.param("agentId");
		const agents = await this.agentScanner.findAgentFiles();
		const agent = agents.find((a) => a.relativePath === agentId);

		if (!agent) {
			return c.json({ error: "Agent not found" }, 404);
		}

		if (this.agentManager.isAgentRunning(agentId)) {
			return c.json({ error: "Agent is already running" }, 400);
		}

		try {
			await this.agentManager.startAgent(agent, agentId);
			return c.json({ success: true, agentId, status: "started" });
		} catch (error: any) {
			return c.json({ error: `Failed to start agent: ${error.message}` }, 500);
		}
	}

	public async stopAgent(c: Context) {
		const agentId = c.req.param("agentId");

		if (!this.agentManager.isAgentRunning(agentId)) {
			return c.json({ error: "Agent is not running" }, 404);
		}

		try {
			this.agentManager.stopAgent(agentId);
			return c.json({ success: true, agentId, status: "stopped" });
		} catch (error: any) {
			return c.json({ error: `Failed to stop agent: ${error.message}` }, 500);
		}
	}

	public async sendMessageToAgent(c: Context) {
		const agentId = c.req.param("agentId");
		const { message } = await c.req.json();

		if (!this.agentManager.isAgentRunning(agentId)) {
			return c.json(
				{ error: "Agent is not running or does not accept input" },
				404,
			);
		}

		try {
			const success = this.agentManager.sendMessageToAgent(agentId, message);
			if (success) {
				return c.json({ success: true, agentId, message: "Message sent" });
			}
			return c.json({ error: "Failed to send message to agent" }, 500);
		} catch (error: any) {
			return c.json({ error: `Failed to send message: ${error.message}` }, 500);
		}
	}
}
