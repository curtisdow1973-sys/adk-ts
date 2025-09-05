"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Api } from "../Api";
import type { Agent, Message } from "../app/(dashboard)/_schema";

interface AgentApiResponse {
	agents: Agent[];
}

interface EventItem {
	id: string;
	author: string;
	timestamp: number;
	content: any;
}

interface EventsResponse {
	events: EventItem[];
	totalCount: number;
}

export function useAgents(apiUrl: string, currentSessionId?: string | null) {
	const queryClient = useQueryClient();
	const apiClient = useMemo(() => {
		if (!apiUrl) return null;
		return new Api({ baseUrl: apiUrl });
	}, [apiUrl]);
	const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
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
			if (!apiClient) throw new Error("API URL is required");
			const res = await apiClient.api.agentsControllerListAgents();
			const data: AgentApiResponse = res.data;
			return data.agents;
		},
		enabled: !!apiClient,
		staleTime: 30000,
		retry: 2,
	});

	// Fetch messages for selected agent and session by transforming events → messages
	const { data: sessionEvents } = useQuery({
		queryKey: [
			"agent-messages",
			apiUrl,
			selectedAgent?.relativePath,
			currentSessionId,
		],
		queryFn: async (): Promise<EventsResponse> => {
			if (!apiClient || !selectedAgent || !currentSessionId) {
				return { events: [], totalCount: 0 };
			}
			const res = await apiClient.api.eventsControllerGetEvents(
				encodeURIComponent(selectedAgent.relativePath),
				currentSessionId,
			);
			return res.data as EventsResponse;
		},
		enabled: !!apiClient && !!selectedAgent && !!currentSessionId,
		staleTime: 10000,
	});

	// Update messages when events change
	useEffect(() => {
		if (sessionEvents?.events && selectedAgent) {
			const asMessages: Message[] = sessionEvents.events
				.map((ev, index) => {
					const textParts = Array.isArray(ev.content?.parts)
						? ev.content.parts
								.filter(
									(p: any) =>
										typeof p === "object" &&
										"text" in p &&
										typeof p.text === "string",
								)
								.map((p: any) => p.text)
						: [];
					const text = textParts.join("").trim();
					return {
						id: index + 1,
						type: ev.author === "user" ? "user" : "assistant",
						content: text,
						timestamp: new Date(ev.timestamp * 1000),
					} as Message;
				})
				.filter((m) => m.content.length > 0);

			setMessages(asMessages);
			if (asMessages.length > 0) {
				setLastMessageId(Math.max(...asMessages.map((m) => m.id)));
			}
		}
	}, [sessionEvents, selectedAgent]);

	// Send message mutation
	const sendMessageMutation = useMutation({
		mutationFn: async ({
			agent,
			message,
			attachments,
		}: { agent: Agent; message: string; attachments?: File[] }) => {
			const userMessage: Message = {
				id: Date.now(),
				type: "user",
				content: message,
				timestamp: new Date(),
			};
			setMessages((prev) => [...prev, userMessage]);

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

			const body = { message, attachments: encodedAttachments };

			if (!apiClient) throw new Error("API client not ready");
			try {
				const res = await apiClient.api.messagingControllerPostAgentMessage(
					encodeURIComponent(agent.relativePath),
					body,
				);
				return res.data;
			} catch (e: any) {
				setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
				throw new Error(e?.message || "Failed to send message");
			}
		},
		onSuccess: () => {
			// Refresh session events and derived messages
			if (currentSessionId && selectedAgent) {
				queryClient.invalidateQueries({
					queryKey: [
						"events",
						apiUrl,
						selectedAgent.relativePath,
						currentSessionId,
					],
				});
				queryClient.invalidateQueries({
					queryKey: [
						"agent-messages",
						apiUrl,
						selectedAgent.relativePath,
						currentSessionId,
					],
				});
			}
		},
		onError: (error) => {
			console.error(error);
			toast.error("Failed to send message. Please try again.");
		},
	});

	const selectAgent = useCallback((agent: Agent) => {
		setSelectedAgent(agent);
		setMessages([]);
		setLastMessageId(0);
	}, []);

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
		connected: !!apiUrl,
		loading,
		error,
		sendMessage,
		selectAgent,
		refreshAgents,
		isSendingMessage: sendMessageMutation.isPending,
	};
}
