export interface Agent {
	path: string;
	name: string;
	directory: string;
	relativePath: string;
}

export interface Message {
	id: number;
	type: "user" | "assistant" | "system";
	content: string;
	timestamp: Date;
}

export type AgentStatus = "running" | "stopped";

export interface AgentWithStatus extends Agent {
	status: AgentStatus;
}

export interface ChatState {
	messages: Message[];
	selectedAgent: Agent | null;
}

export interface ConnectionState {
	apiUrl: string;
	connected: boolean;
	loading: boolean;
}
