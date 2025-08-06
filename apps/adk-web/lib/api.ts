// API functions for agents
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

export interface ApiCallParams {
	apiUrl: string;
	path: string;
	data?: any;
}

export async function makeApiCall({ apiUrl, path, data = {} }: ApiCallParams) {
	const response = await fetch("/api/proxy", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			apiUrl,
			path,
			data,
		}),
	});

	if (!response.ok) {
		throw new Error(`API call failed: ${response.statusText}`);
	}

	return response;
}

export async function fetchAgents(apiUrl: string): Promise<Agent[]> {
	const response = await fetch(
		`/api/proxy?apiUrl=${encodeURIComponent(apiUrl)}&path=/api/agents`,
	);

	if (!response.ok) {
		throw new Error("Failed to fetch agents");
	}

	return response.json();
}

export async function startAgent({
	apiUrl,
	agent,
}: { apiUrl: string; agent: Agent }) {
	return makeApiCall({
		apiUrl,
		path: `/api/agents/${encodeURIComponent(agent.relativePath)}/start`,
	});
}

export async function stopAgent({
	apiUrl,
	agent,
}: { apiUrl: string; agent: Agent }) {
	return makeApiCall({
		apiUrl,
		path: `/api/agents/${encodeURIComponent(agent.relativePath)}/stop`,
	});
}

export async function sendMessageToAgent({
	apiUrl,
	agent,
	message,
}: {
	apiUrl: string;
	agent: Agent;
	message: string;
}) {
	console.log("Sending message to agent:", {
		agentPath: agent.path,
		agentRelativePath: agent.relativePath,
		message,
	});
	return makeApiCall({
		apiUrl,
		path: `/api/agents/${encodeURIComponent(agent.relativePath)}/message`,
		data: { message },
	});
}
