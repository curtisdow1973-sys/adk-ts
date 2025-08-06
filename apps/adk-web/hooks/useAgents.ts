"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
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
	agentId: string;
	timestamp: string;
}

export function useAgents(apiUrl: string) {
	const queryClient = useQueryClient();
	const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [connected, setConnected] = useState(false);
	const [socket, setSocket] = useState<Socket | null>(null);
	const [agentStatus, setAgentStatus] = useState<
		Record<string, "running" | "stopped" | "error">
	>({});

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
		enabled: !!apiUrl && connected,
		refetchInterval: 5000,
		staleTime: 1000,
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

	// WebSocket connection for real-time messages
	useEffect(() => {
		console.log("🔧 WebSocket useEffect triggered");
		console.log("apiUrl:", apiUrl);
		console.log("selectedAgent:", selectedAgent);

		if (!apiUrl) {
			console.log("❌ No apiUrl provided for WebSocket connection");
			return;
		}

		console.log("🚀 Setting up WebSocket connection to:", apiUrl);

		try {
			const newSocket = io(apiUrl, {
				transports: ["websocket", "polling"],
				timeout: 10000,
				forceNew: true,
			});

			console.log("📡 Socket.IO client created:", newSocket);

			newSocket.on("connect", () => {
				console.log("✅ Connected to ADK server WebSocket");
				console.log("Socket ID:", newSocket.id);
				setConnected(true);
			});

			newSocket.on("disconnect", (reason) => {
				console.log("❌ Disconnected from ADK server WebSocket:", reason);
				setConnected(false);
			});

			newSocket.on("connect_error", (error) => {
				console.error("🔥 WebSocket connection error:", error);
				console.error("Error details:", error.message);
				console.error("Attempted to connect to:", apiUrl);
				setConnected(false);
			});

			newSocket.on("agentMessage", (message: AgentMessage) => {
				console.log("📨 Received agentMessage:", message);
				if (selectedAgent && message.agentId === selectedAgent.relativePath) {
					console.log(
						"✅ Adding message to chat for agent:",
						selectedAgent.relativePath,
					);
					const newMessage: Message = {
						id: message.id,
						type:
							message.type === "stdout"
								? "assistant"
								: (message.type as Message["type"]),
						content: message.content.trim(),
						timestamp: new Date(message.timestamp),
					};
					setMessages((prev) => {
						const updated = [...prev, newMessage];
						console.log("💬 Messages updated, total count:", updated.length);
						return updated;
					});
				} else {
					console.log(
						"⚠️ Message not for selected agent. Selected:",
						selectedAgent?.relativePath,
						"Message for:",
						message.agentId,
					);
				}
			});

			setSocket(newSocket);

			return () => {
				console.log("🧹 Cleaning up WebSocket connection");
				newSocket.close();
			};
		} catch (error) {
			console.error("💥 Error creating Socket.IO client:", error);
		}
	}, [apiUrl, selectedAgent]);

	// Join agent room when agent is selected
	useEffect(() => {
		if (socket && selectedAgent && socket.connected) {
			console.log("🏠 Joining agent room:", selectedAgent.relativePath);
			socket.emit("joinAgent", selectedAgent.relativePath);

			return () => {
				console.log("🚪 Leaving agent room:", selectedAgent.relativePath);
				socket.emit("leaveAgent", selectedAgent.relativePath);
			};
		}
	}, [socket, selectedAgent, socket?.connected]);

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
		connected,
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
