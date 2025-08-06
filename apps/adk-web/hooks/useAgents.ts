import type { Agent, Message } from "@/lib/api";
import {
	fetchAgents,
	sendMessageToAgent,
	startAgent,
	stopAgent,
} from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function useAgents(apiUrl: string) {
	const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [agentStatus, setAgentStatus] = useState<
		Record<string, "running" | "stopped">
	>({});
	const queryClient = useQueryClient();

	// Fetch agents with React Query
	const {
		data: agents = [],
		isLoading: loading,
		error,
		isSuccess,
	} = useQuery({
		queryKey: ["agents", apiUrl],
		queryFn: () => fetchAgents(apiUrl),
		enabled: !!apiUrl, // Only run if apiUrl exists
		staleTime: 30000, // Consider data fresh for 30 seconds
		retry: 3,
	});

	const connected = isSuccess && !error;

	// Start agent mutation
	const startAgentMutation = useMutation({
		mutationFn: (agent: Agent) => startAgent({ apiUrl, agent }),
		onSuccess: (_, agent) => {
			setAgentStatus((prev) => ({ ...prev, [agent.path]: "running" }));
			if (selectedAgent?.path === agent.path) {
				addMessage("system", `Agent ${agent.name} started successfully`);
			}
		},
		onError: (error, agent) => {
			console.error("Failed to start agent:", error);
			addMessage("system", `Failed to start agent: ${error}`);
		},
	});

	// Stop agent mutation
	const stopAgentMutation = useMutation({
		mutationFn: (agent: Agent) => stopAgent({ apiUrl, agent }),
		onSuccess: (_, agent) => {
			setAgentStatus((prev) => ({ ...prev, [agent.path]: "stopped" }));
			if (selectedAgent?.path === agent.path) {
				addMessage("system", `Agent ${agent.name} stopped`);
			}
		},
		onError: (error) => {
			console.error("Failed to stop agent:", error);
			addMessage("system", `Failed to stop agent: ${error}`);
		},
	});

	// Send message mutation
	const sendMessageMutation = useMutation({
		mutationFn: (message: string) => {
			if (!selectedAgent) throw new Error("No agent selected");
			return sendMessageToAgent({ apiUrl, agent: selectedAgent, message });
		},
		onError: (error) => {
			addMessage("system", `Error sending message: ${error}`);
		},
	});

	const addMessage = (type: Message["type"], content: string) => {
		setMessages((prev) => [
			...prev,
			{
				id: Date.now(),
				type,
				content,
				timestamp: new Date(),
			},
		]);
	};

	const selectAgent = (agent: Agent) => {
		setSelectedAgent(agent);
		setMessages([
			{
				id: Date.now(),
				type: "system",
				content: `Selected agent: ${agent.name}`,
				timestamp: new Date(),
			},
		]);
	};

	const sendMessage = (message: string) => {
		if (!message.trim() || !selectedAgent) return;

		addMessage("user", message);
		sendMessageMutation.mutate(message);
	};

	const refreshAgents = () => {
		queryClient.invalidateQueries({ queryKey: ["agents", apiUrl] });
	};

	return {
		agents,
		selectedAgent,
		messages,
		agentStatus,
		connected,
		loading,
		error,
		// Actions
		startAgent: startAgentMutation.mutate,
		stopAgent: stopAgentMutation.mutate,
		sendMessage,
		selectAgent,
		refreshAgents,
		// Loading states for individual actions
		isStartingAgent: startAgentMutation.isPending,
		isStoppingAgent: stopAgentMutation.isPending,
		isSendingMessage: sendMessageMutation.isPending,
	};
}
