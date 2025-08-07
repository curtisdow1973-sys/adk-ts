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
	type: "user" | "assistant" | "system" | "error";
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
		staleTime: 30000, // Cache for 30 seconds
	});

	// Fetch messages for selected agent (no polling - only load once and on invalidation)
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
		staleTime: 30000, // Cache for 30 seconds
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
			// Get all messages from the session service and replace current messages
			const allMessages = agentMessages.messages.map(
				(msg): Message => ({
					id: msg.id,
					type: msg.type === "error" ? "system" : msg.type,
					content: msg.content.trim(),
					timestamp: new Date(msg.timestamp),
				}),
			);

			setMessages(allMessages);
			if (allMessages.length > 0) {
				setLastMessageId(Math.max(...allMessages.map((m) => m.id)));
			}
		}
	}, [agentMessages, selectedAgent]);

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
			// Add optimistic user message immediately
			const userMessage: Message = {
				id: Date.now(), // Temporary ID
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
				// Remove optimistic message on error
				setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
				const errorData = await response.text();
				throw new Error(
					`Failed to send message: ${response.status} - ${errorData}`,
				);
			}
			return response.json();
		},
		onSuccess: () => {
			// Fetch updated messages after successful send
			queryClient.invalidateQueries({
				queryKey: ["agent-messages", apiUrl, selectedAgent?.relativePath],
			});
			// Also refresh running agents status since auto-start may have occurred
			queryClient.invalidateQueries({ queryKey: ["running-agents", apiUrl] });
		},
		onError: (error) => {
			console.error("Failed to send message:", error);
		},
	});

	// Agent selection handler
	const selectAgent = useCallback((agent: Agent) => {
		setSelectedAgent(agent);
		setMessages([]); // Clear messages when switching agents - they'll be loaded from the session
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
