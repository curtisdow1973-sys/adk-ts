"use client";

import { useState, useEffect } from "react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
	Loader2,
	Play,
	Square,
	MessageCircle,
	Bot,
	AlertCircle,
} from "lucide-react";

interface Agent {
	path: string;
	name: string;
	directory: string;
	relativePath: string;
}

interface Message {
	id: number;
	type: "user" | "assistant" | "system";
	content: string;
	timestamp: Date;
}

export default function Home() {
	const [agents, setAgents] = useState<Agent[]>([]);
	const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
	const [messages, setMessages] = useState<Message[]>([]);
	const [inputMessage, setInputMessage] = useState("");
	const [agentStatus, setAgentStatus] = useState<
		Record<string, "running" | "stopped">
	>({});
	const [apiUrl, setApiUrl] = useState<string>("");
	const [connected, setConnected] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		// Get API URL from query params
		const urlParams = new URLSearchParams(window.location.search);
		const apiUrlParam = urlParams.get("apiUrl");

		if (apiUrlParam) {
			setApiUrl(apiUrlParam);
			loadAgents(apiUrlParam);
		} else {
			setLoading(false);
		}
	}, []);

	const loadAgents = async (url: string) => {
		try {
			const response = await fetch(
				`/api/proxy?apiUrl=${encodeURIComponent(url)}&path=/api/agents`,
			);
			if (response.ok) {
				const agentsData = await response.json();
				setAgents(agentsData);
				setConnected(true);
			} else {
				throw new Error("Failed to fetch agents");
			}
		} catch (error) {
			console.error("Failed to connect to ADK server:", error);
			setConnected(false);
		} finally {
			setLoading(false);
		}
	};

	const startAgent = async (agent: Agent) => {
		try {
			const response = await fetch("/api/proxy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					apiUrl,
					path: `/api/agents/${encodeURIComponent(agent.path)}/start`,
					data: {},
				}),
			});

			if (response.ok) {
				setAgentStatus((prev) => ({ ...prev, [agent.path]: "running" }));
				if (selectedAgent?.path === agent.path) {
					addMessage("system", `Agent ${agent.name} started successfully`);
				}
			}
		} catch (error) {
			console.error("Failed to start agent:", error);
			addMessage("system", `Failed to start agent: ${error}`);
		}
	};

	const stopAgent = async (agent: Agent) => {
		try {
			const response = await fetch("/api/proxy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					apiUrl,
					path: `/api/agents/${encodeURIComponent(agent.path)}/stop`,
					data: {},
				}),
			});

			if (response.ok) {
				setAgentStatus((prev) => ({ ...prev, [agent.path]: "stopped" }));
				if (selectedAgent?.path === agent.path) {
					addMessage("system", `Agent ${agent.name} stopped`);
				}
			}
		} catch (error) {
			console.error("Failed to stop agent:", error);
		}
	};

	const sendMessage = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!inputMessage.trim() || !selectedAgent) return;

		addMessage("user", inputMessage);

		try {
			const response = await fetch("/api/proxy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					apiUrl,
					path: `/api/agents/${encodeURIComponent(selectedAgent.path)}/message`,
					data: { message: inputMessage },
				}),
			});

			if (!response.ok) {
				addMessage("system", "Failed to send message to agent");
			}
		} catch (error) {
			addMessage("system", `Error sending message: ${error}`);
		}

		setInputMessage("");
	};

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

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
					<p>Connecting to ADK server...</p>
				</div>
			</div>
		);
	}

	if (!apiUrl) {
		return (
			<div className="container mx-auto p-8">
				<div className="max-w-2xl mx-auto text-center">
					<Bot className="h-16 w-16 mx-auto mb-4" />
					<h1 className="text-3xl font-bold mb-4">
						ADK Agent Testing Interface
					</h1>
					<Alert>
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>
							This interface needs to be launched from the ADK CLI. Run{" "}
							<code className="bg-muted px-1 py-0.5 rounded">adk web</code> to
							start.
						</AlertDescription>
					</Alert>
				</div>
			</div>
		);
	}

	if (!connected) {
		return (
			<div className="container mx-auto p-8">
				<div className="max-w-2xl mx-auto text-center">
					<Bot className="h-16 w-16 mx-auto mb-4" />
					<h1 className="text-3xl font-bold mb-4">
						ADK Agent Testing Interface
					</h1>
					<Alert>
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>
							Failed to connect to ADK server at {apiUrl}. Make sure the server
							is running.
						</AlertDescription>
					</Alert>
					<Button onClick={() => loadAgents(apiUrl)} className="mt-4">
						Retry Connection
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto p-6 h-screen flex flex-col">
			<div className="flex items-center justify-between mb-6">
				<div>
					<h1 className="text-3xl font-bold">🤖 ADK Agent Testing Interface</h1>
					<p className="text-muted-foreground">Connected to {apiUrl}</p>
				</div>
				<Badge
					variant="outline"
					className="bg-green-50 text-green-700 border-green-200"
				>
					Connected
				</Badge>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
				{/* Agents Panel */}
				<Card className="lg:col-span-1">
					<CardHeader>
						<CardTitle>Available Agents ({agents.length})</CardTitle>
						<CardDescription>Select an agent to start testing</CardDescription>
					</CardHeader>
					<CardContent className="p-0">
						<ScrollArea className="h-[calc(100vh-300px)]">
							{agents.length === 0 ? (
								<div className="p-6 text-center text-muted-foreground">
									<Bot className="h-12 w-12 mx-auto mb-2 opacity-50" />
									<p>No agents found</p>
									<p className="text-sm">Create agent files to get started</p>
								</div>
							) : (
								<div className="space-y-2 p-4">
									{agents.map((agent) => (
										<button
											key={agent.path}
											type="button"
											className={`w-full p-3 rounded-lg border cursor-pointer transition-colors text-left ${
												selectedAgent?.path === agent.path
													? "bg-primary/10 border-primary"
													: "hover:bg-muted"
											}`}
											onClick={() => selectAgent(agent)}
										>
											<div className="flex items-center justify-between">
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2">
														<div
															className={`w-2 h-2 rounded-full ${
																agentStatus[agent.path] === "running"
																	? "bg-green-500"
																	: "bg-red-500"
															}`}
														/>
														<p className="font-medium truncate">{agent.name}</p>
													</div>
													<p className="text-sm text-muted-foreground truncate">
														{agent.relativePath}
													</p>
												</div>
												<div className="flex gap-1">
													{agentStatus[agent.path] === "running" ? (
														<Button
															size="sm"
															variant="outline"
															onClick={(e) => {
																e.stopPropagation();
																stopAgent(agent);
															}}
														>
															<Square className="h-3 w-3" />
														</Button>
													) : (
														<Button
															size="sm"
															onClick={(e) => {
																e.stopPropagation();
																startAgent(agent);
															}}
														>
															<Play className="h-3 w-3" />
														</Button>
													)}
												</div>
											</div>
										</button>
									))}
								</div>
							)}
						</ScrollArea>
					</CardContent>
				</Card>

				{/* Chat Panel */}
				<Card className="lg:col-span-2 flex flex-col">
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<MessageCircle className="h-5 w-5" />
							{selectedAgent
								? `Chat with ${selectedAgent.name}`
								: "Select an Agent"}
						</CardTitle>
						{selectedAgent && (
							<CardDescription>
								Status: {agentStatus[selectedAgent.path] || "stopped"}
							</CardDescription>
						)}
					</CardHeader>
					<CardContent className="flex-1 flex flex-col min-h-0 p-0">
						{selectedAgent ? (
							<>
								<ScrollArea className="flex-1 p-4">
									<div className="space-y-4">
										{messages.map((message) => (
											<div
												key={message.id}
												className={`flex ${
													message.type === "user"
														? "justify-end"
														: "justify-start"
												}`}
											>
												<div
													className={`max-w-[80%] p-3 rounded-lg ${
														message.type === "user"
															? "bg-primary text-primary-foreground"
															: message.type === "system"
																? "bg-yellow-50 text-yellow-800 border border-yellow-200"
																: "bg-muted"
													}`}
												>
													<p className="text-sm">{message.content}</p>
												</div>
											</div>
										))}
									</div>
								</ScrollArea>
								<Separator />
								<form onSubmit={sendMessage} className="p-4">
									<div className="flex gap-2">
										<Input
											placeholder="Type your message..."
											value={inputMessage}
											onChange={(e) => setInputMessage(e.target.value)}
											className="flex-1"
										/>
										<Button type="submit" disabled={!inputMessage.trim()}>
											Send
										</Button>
									</div>
								</form>
							</>
						) : (
							<div className="flex-1 flex items-center justify-center">
								<div className="text-center text-muted-foreground">
									<MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
									<p>Select an agent to start chatting</p>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
