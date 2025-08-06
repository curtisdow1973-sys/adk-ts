import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Agent } from "@/lib/api";
import { Bot, Loader2, Play, Square } from "lucide-react";

interface AgentsPanelProps {
	agents: Agent[];
	selectedAgent: Agent | null;
	agentStatus: Record<string, "running" | "stopped">;
	onSelectAgent: (agent: Agent) => void;
	onStartAgent: (agent: Agent) => void;
	onStopAgent: (agent: Agent) => void;
	isStartingAgent?: boolean;
	isStoppingAgent?: boolean;
}

export function AgentsPanel({
	agents,
	selectedAgent,
	agentStatus,
	onSelectAgent,
	onStartAgent,
	onStopAgent,
	isStartingAgent = false,
	isStoppingAgent = false,
}: AgentsPanelProps) {
	return (
		<Card className="lg:col-span-1">
			<CardHeader>
				<CardTitle>Available Agents ({agents.length})</CardTitle>
				<CardDescription>Select an agent to start testing</CardDescription>
			</CardHeader>
			<CardContent className="p-0">
								<ScrollArea className="h-[calc(100vh-300px)]">
					{agents.length === 0 ? (
						<EmptyAgentsState />
					) : (
						<div className="space-y-2 p-4">
							{agents.map((agent) => (
								<AgentItem
									key={agent.relativePath}
									agent={agent}
									isSelected={selectedAgent?.relativePath === agent.relativePath}
									status={agentStatus[agent.relativePath]}
									isStartingAgent={isStartingAgent}
									isStoppingAgent={isStoppingAgent}
									onSelect={() => onSelectAgent(agent)}
									onStart={(e) => {
										e.stopPropagation();
										onStartAgent(agent);
									}}
									onStop={(e) => {
										e.stopPropagation();
										onStopAgent(agent);
									}}
								/>
							))}
						</div>
					)}
				</ScrollArea>
			</CardContent>
		</Card>
	);
}

function EmptyAgentsState() {
	return (
		<div className="p-6 text-center text-muted-foreground">
			<Bot className="h-12 w-12 mx-auto mb-2 opacity-50" />
			<p>No agents found</p>
			<p className="text-sm">Create agent files to get started</p>
		</div>
	);
}

interface AgentItemProps {
	agent: Agent;
	isSelected: boolean;
	status?: "running" | "stopped";
	isStartingAgent?: boolean;
	isStoppingAgent?: boolean;
	onSelect: () => void;
	onStart: (e: React.MouseEvent) => void;
	onStop: (e: React.MouseEvent) => void;
}

function AgentItem({
	agent,
	isSelected,
	status,
	isStartingAgent = false,
	isStoppingAgent = false,
	onSelect,
	onStart,
	onStop,
}: AgentItemProps) {
	return (
		<button
			type="button"
			className={`w-full p-3 rounded-lg border cursor-pointer transition-colors text-left ${
				isSelected ? "bg-primary/10 border-primary" : "hover:bg-muted"
			}`}
			onClick={onSelect}
		>
			<div className="flex items-center justify-between">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<StatusIndicator status={status} />
						<p className="font-medium truncate">{agent.name}</p>
					</div>
					<p className="text-sm text-muted-foreground truncate">
						{agent.relativePath}
					</p>
				</div>
				<div className="flex gap-1">
					{status === "running" ? (
						<Button
							size="sm"
							variant="outline"
							onClick={onStop}
							disabled={isStoppingAgent}
						>
							{isStoppingAgent ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<Square className="h-3 w-3" />
							)}
						</Button>
					) : (
						<Button size="sm" onClick={onStart} disabled={isStartingAgent}>
							{isStartingAgent ? (
								<Loader2 className="h-3 w-3 animate-spin" />
							) : (
								<Play className="h-3 w-3" />
							)}
						</Button>
					)}
				</div>
			</div>
		</button>
	);
}

interface StatusIndicatorProps {
	status?: "running" | "stopped";
}

function StatusIndicator({ status }: StatusIndicatorProps) {
	return (
		<div
			className={`w-2 h-2 rounded-full ${
				status === "running" ? "bg-green-500" : "bg-red-500"
			}`}
		/>
	);
}
