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

// Agent status tracking removed; agents are always available on-demand

export interface ChatState {
	messages: Message[];
	selectedAgent: Agent | null;
}

export interface ConnectionState {
	apiUrl: string;
	connected: boolean;
	loading: boolean;
}
