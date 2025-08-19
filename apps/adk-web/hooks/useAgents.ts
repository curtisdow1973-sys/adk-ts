"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { Agent, Message } from "../app/(dashboard)/_schema";

interface AgentApiResponse {
	agents: Agent[];
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
	// Agent status tracking removed
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

			const response = await fetch(`${apiUrl}/api/agents`);
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
	// Running status tracking removed

	// Fetch messages for selected agent (no polling - only load once and on invalidation)
	const { data: agentMessages } = useQuery({
		queryKey: ["agent-messages", apiUrl, selectedAgent?.relativePath],
		queryFn: async (): Promise<AgentMessagesResponse> => {
			if (!apiUrl || !selectedAgent)
				throw new Error("API URL and agent required");

			const response = await fetch(
				`${apiUrl}/api/agents/${encodeURIComponent(selectedAgent.relativePath)}/messages`,
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
	// No agent status to update

	// Update messages when agent messages change
	useEffect(() => {
		if (agentMessages?.messages && selectedAgent) {
			// Filter out empty/whitespace-only messages (e.g., tool-call placeholders)
			const nonEmpty = agentMessages.messages.filter(
				(m) => typeof m.content === "string" && m.content.trim().length > 0,
			);

			// Map to UI message shape
			const allMessages = nonEmpty.map(
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

	// Send message mutation
	const sendMessageMutation = useMutation({
		mutationFn: async ({
			agent,
			message,
			attachments,
		}: { agent: Agent; message: string; attachments?: File[] }) => {
			// Add optimistic user message immediately
			const userMessage: Message = {
				id: Date.now(), // Temporary ID
				type: "user",
				content: message,
				timestamp: new Date(),
			};
			setMessages((prev) => [...prev, userMessage]);

			// Encode attachments (if any) to base64
			let encodedAttachments:
				| Array<{ name: string; mimeType: string; data: string }>
				| undefined;
			if (attachments && attachments.length > 0) {
				const fileToBase64 = (file: File) =>
					new Promise<string>((resolve, reject) => {
						const reader = new FileReader();
						reader.onload = () => {
							const result = reader.result as string;
							const base64 = result.includes(",")
								? result.split(",")[1]
								: result;
							resolve(base64);
						};
						reader.onerror = () => reject(reader.error);
						reader.readAsDataURL(file);
					});

				encodedAttachments = await Promise.all(
					attachments.map(async (file) => ({
						name: file.name,
						mimeType: file.type || "application/octet-stream",
						data: await fileToBase64(file),
					})),
				);
			}

			const body = {
				message,
				attachments: encodedAttachments,
			};

			const response = await fetch(
				`${apiUrl}/api/agents/${encodeURIComponent(agent.relativePath)}/message`,
				{
					method: "POST",
					body: JSON.stringify(body),
				},
			);
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
			// No running status to refresh
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
	const sendMessage = useCallback(
		(message: string, attachments?: File[]) => {
			if (!selectedAgent) return;
			sendMessageMutation.mutate({
				agent: selectedAgent,
				message,
				attachments,
			});
		},
		[selectedAgent, sendMessageMutation],
	);

	return {
		agents,
		selectedAgent,
		messages,
		agentStatus: {},
		connected: !!apiUrl, // Always "connected" if we have an API URL
		loading,
		error,
		sendMessage,
		selectAgent,
		refreshAgents,
		isSendingMessage: sendMessageMutation.isPending,
	};
}
