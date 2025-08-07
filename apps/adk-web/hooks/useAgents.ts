"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { Agent, Message } from "../app/(dashboard)/_schema/types";

interface AgentApiResponse {
	agents: Agent[];
}

interface RunningAgentsResponse {
	running: Array<{
		id: string;
		status: "running" | "stopped" | "error";
		startTime: string;
	}>;
}

interface AgentMessage {
	id: number;
	type: "stdout" | "stderr" | "system" | "error";
	content: string;
	timestamp: string;
}

interface AgentMessagesResponse {
	messages: AgentMessage[];
}

export function useAgents(apiUrl: string) {
	const queryClient = useQueryClient();
	const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [agentStatus, setAgentStatus] = useState<
		Record<string, "running" | "stopped" | "error">
	>({});
	const [lastMessageId, setLastMessageId] = useState<number>(0);

	// Fetch available agents
	const {
		data: agents = [],
		isLoading: loading,
		error,
		refetch: refreshAgents,
	} = useQuery({
		queryKey: ["agents", apiUrl],
		queryFn: async (): Promise<Agent[]> => {
			if (!apiUrl) throw new Error("API URL is required");

			const response = await fetch(
				`/api/proxy?apiUrl=${encodeURIComponent(apiUrl)}&path=/api/agents`,
			);
			if (!response.ok) {
				throw new Error(`Failed to fetch agents: ${response.status}`);
			}
			const data: AgentApiResponse = await response.json();
			return data.agents;
		},
		enabled: !!apiUrl,
		staleTime: 30000,
		retry: 2,
	});

	// Fetch running agents status
	const { data: runningAgents } = useQuery({
		queryKey: ["running-agents", apiUrl],
		queryFn: async (): Promise<RunningAgentsResponse> => {
			if (!apiUrl) throw new Error("API URL is required");

			const response = await fetch(
				`/api/proxy?apiUrl=${encodeURIComponent(apiUrl)}&path=/api/agents/running`,
			);
			if (!response.ok) {
				throw new Error(`Failed to fetch running agents: ${response.status}`);
			}
			return response.json();
		},
		enabled: !!apiUrl,
		refetchInterval: 2000, // Poll every 2 seconds
		staleTime: 1000,
	});

	// Fetch messages for selected agent
	const { data: agentMessages } = useQuery({
		queryKey: ["agent-messages", apiUrl, selectedAgent?.relativePath],
		queryFn: async (): Promise<AgentMessagesResponse> => {
			if (!apiUrl || !selectedAgent)
				throw new Error("API URL and agent required");

			const response = await fetch(
				`/api/proxy?apiUrl=${encodeURIComponent(apiUrl)}&path=/api/agents/${encodeURIComponent(selectedAgent.relativePath)}/messages`,
			);
			if (!response.ok) {
				throw new Error(`Failed to fetch agent messages: ${response.status}`);
			}
			return response.json();
		},
		enabled: !!apiUrl && !!selectedAgent,
		refetchInterval: 1000, // Poll every 1 second for messages
		staleTime: 500,
	});

	// Update agent status when running agents data changes
	useEffect(() => {
		if (runningAgents?.running) {
			const statusMap: Record<string, "running" | "stopped" | "error"> = {};
			runningAgents.running.forEach((agent) => {
				statusMap[agent.id] = agent.status;
			});
			setAgentStatus(statusMap);
		}
	}, [runningAgents]);

	// Update messages when agent messages change
	useEffect(() => {
		if (agentMessages?.messages && selectedAgent) {
			const newMessages = agentMessages.messages
				.filter((msg) => msg.id > lastMessageId)
				.map(
					(msg): Message => ({
						id: msg.id,
						type:
							msg.type === "stdout"
								? "assistant"
								: msg.type === "system"
									? "system"
									: "system",
						content: msg.content.trim(),
						timestamp: new Date(msg.timestamp),
					}),
				);

			if (newMessages.length > 0) {
				setMessages((prev) => [...prev, ...newMessages]);
				setLastMessageId(Math.max(...agentMessages.messages.map((m) => m.id)));
			}
		}
	}, [agentMessages, selectedAgent, lastMessageId]);

	// Start agent mutation
	const startAgentMutation = useMutation({
		mutationFn: async ({ agent }: { agent: Agent }) => {
			const response = await fetch("/api/proxy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					apiUrl,
					path: `/api/agents/${encodeURIComponent(agent.relativePath)}/start`,
					data: {},
				}),
			});
			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(
					`Failed to start agent: ${response.status} - ${errorData}`,
				);
			}
			return response.json();
		},
		onSuccess: (_, { agent }) => {
			setAgentStatus((prev) => ({ ...prev, [agent.relativePath]: "running" }));
			queryClient.invalidateQueries({ queryKey: ["running-agents", apiUrl] });
		},
		onError: (error, { agent }) => {
			setAgentStatus((prev) => ({ ...prev, [agent.relativePath]: "error" }));
			console.error("Failed to start agent:", error);
		},
	});

	// Stop agent mutation
	const stopAgentMutation = useMutation({
		mutationFn: async ({ agent }: { agent: Agent }) => {
			const response = await fetch("/api/proxy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					apiUrl,
					path: `/api/agents/${encodeURIComponent(agent.relativePath)}/stop`,
					data: {},
				}),
			});
			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(
					`Failed to stop agent: ${response.status} - ${errorData}`,
				);
			}
			return response.json();
		},
		onSuccess: (_, { agent }) => {
			setAgentStatus((prev) => ({ ...prev, [agent.relativePath]: "stopped" }));
			queryClient.invalidateQueries({ queryKey: ["running-agents", apiUrl] });
		},
		onError: (error) => {
			console.error("Failed to stop agent:", error);
		},
	});

	// Send message mutation
	const sendMessageMutation = useMutation({
		mutationFn: async ({
			agent,
			message,
		}: { agent: Agent; message: string }) => {
			// Add user message to chat immediately
			const userMessage: Message = {
				id: Date.now(),
				type: "user",
				content: message,
				timestamp: new Date(),
			};
			setMessages((prev) => [...prev, userMessage]);

			const response = await fetch("/api/proxy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					apiUrl,
					path: `/api/agents/${encodeURIComponent(agent.relativePath)}/message`,
					data: { message },
				}),
			});
			if (!response.ok) {
				const errorData = await response.text();
				throw new Error(
					`Failed to send message: ${response.status} - ${errorData}`,
				);
			}
			return response.json();
		},
		onSuccess: () => {
			// Force refresh messages after sending
			queryClient.invalidateQueries({
				queryKey: ["agent-messages", apiUrl, selectedAgent?.relativePath],
			});
		},
		onError: (error) => {
			// Add error message to chat
			const errorMessage: Message = {
				id: Date.now(),
				type: "system",
				content: `Error: ${error.message}`,
				timestamp: new Date(),
			};
			setMessages((prev) => [...prev, errorMessage]);
		},
	});

	// Agent selection handler
	const selectAgent = useCallback((agent: Agent) => {
		setSelectedAgent(agent);
		setMessages([
			{
				id: Date.now(),
				type: "system",
				content: `Selected agent: ${agent.name}`,
				timestamp: new Date(),
			},
		]);
		setLastMessageId(0); // Reset message tracking for new agent
	}, []);

	// Action handlers
	const startAgent = useCallback(
		(agent: Agent) => {
			startAgentMutation.mutate({ agent });
		},
		[startAgentMutation],
	);

	const stopAgent = useCallback(
		(agent: Agent) => {
			stopAgentMutation.mutate({ agent });
		},
		[stopAgentMutation],
	);

	const sendMessage = useCallback(
		(message: string) => {
			if (!selectedAgent) return;
			sendMessageMutation.mutate({ agent: selectedAgent, message });
		},
		[selectedAgent, sendMessageMutation],
	);

	return {
		agents,
		selectedAgent,
		messages,
		agentStatus,
		connected: !!apiUrl, // Always "connected" if we have an API URL
		loading,
		error,
		startAgent,
		stopAgent,
		sendMessage,
		selectAgent,
		refreshAgents,
		isStartingAgent: startAgentMutation.isPending,
		isStoppingAgent: stopAgentMutation.isPending,
		isSendingMessage: sendMessageMutation.isPending,
	};
}
