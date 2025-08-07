import type { ChildProcess } from "node:child_process";

export interface AgentFile {
	path: string;
	name: string;
	directory: string;
	relativePath: string;
}

export interface AgentProcess {
	process: ChildProcess;
	status: "running" | "stopped" | "error";
	startTime: Date;
}

export interface SocketMessage {
	id: number;
	type: "agent" | "stdout" | "stderr" | "system" | "error";
	content: string;
	agentId: string;
	timestamp: string;
}
