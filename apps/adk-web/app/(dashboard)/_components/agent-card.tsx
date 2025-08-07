import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Play, Square } from "lucide-react";
import type { Agent } from "../_schema";

interface AgentCardProps {
	agent: Agent;
	isSelected: boolean;
	isRunning: boolean;
	onSelect: (agent: Agent) => void;
	onStart: (agent: Agent) => void;
	onStop: (agent: Agent) => void;
	isStarting?: boolean;
	isStopping?: boolean;
}

export function AgentCard({
	agent,
	isSelected,
	isRunning,
	onSelect,
	onStart,
	onStop,
	isStarting = false,
	isStopping = false,
}: AgentCardProps) {
	return (
		<button
			type="button"
			className={cn(
				"w-full p-3 rounded-lg border cursor-pointer transition-colors text-left",
				isSelected ? "bg-primary/10 border-primary" : "hover:bg-muted",
			)}
			onClick={() => onSelect(agent)}
		>
			<div className="flex items-center justify-between">
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2">
						<div
							className={cn(
								"w-2 h-2 rounded-full",
								isRunning ? "bg-green-500" : "bg-red-500",
							)}
						/>
						<p className="font-medium truncate">{agent.name}</p>
					</div>
					<p className="text-sm text-muted-foreground truncate">
						{agent.relativePath}
					</p>
				</div>
				<div className="flex gap-1">
					{isRunning ? (
						<Button
							size="sm"
							variant="outline"
							onClick={(e) => {
								e.stopPropagation();
								onStop(agent);
							}}
							disabled={isStopping}
						>
							<Square className="h-3 w-3" />
						</Button>
					) : (
						<Button
							size="sm"
							onClick={(e) => {
								e.stopPropagation();
								onStart(agent);
							}}
							disabled={isStarting}
						>
							<Play className="h-3 w-3" />
						</Button>
					)}
				</div>
			</div>
		</button>
	);
}
