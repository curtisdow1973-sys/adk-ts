"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "../_schema/types";

interface AgentApiResponse {
	agents: Agent[];
}

export function useAgents(apiUrl: string | null) {
	return useQuery({
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
		staleTime: 30000, // 30 seconds
		retry: 2,
	});
}

export function useAgentAction(apiUrl: string) {
	const queryClient = useQueryClient();

	const startAgent = useMutation({
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
		onSuccess: () => {
			// Invalidate and refetch agents
			queryClient.invalidateQueries({ queryKey: ["agents", apiUrl] });
			queryClient.invalidateQueries({ queryKey: ["running-agents", apiUrl] });
		},
	});

	const stopAgent = useMutation({
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
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agents", apiUrl] });
			queryClient.invalidateQueries({ queryKey: ["running-agents", apiUrl] });
		},
	});

	const sendMessage = useMutation({
		mutationFn: async ({
			agent,
			message,
		}: { agent: Agent; message: string }) => {
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
	});

	return {
		startAgent,
		stopAgent,
		sendMessage,
	};
}
