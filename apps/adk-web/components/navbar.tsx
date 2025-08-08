import type { Agent } from "@/app/(dashboard)/_schema";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Bot } from "lucide-react";
import Image from "next/image";

interface NavbarProps {
	apiUrl: string;
	agents: Agent[];
	selectedAgent: Agent | null;
	agentStatus: Record<string, "running" | "stopped" | "error">;
	onSelectAgent: (agent: Agent) => void;
}

export function Navbar({
	apiUrl,
	agents,
	selectedAgent,
	agentStatus,
	onSelectAgent,
}: NavbarProps) {
	const getAgentStatus = (agent: Agent) => {
		return agentStatus[agent.relativePath] || "stopped";
	};

	const getStatusColor = (status: "running" | "stopped" | "error") => {
		switch (status) {
			case "running":
				return "bg-green-500";
			case "error":
				return "bg-red-500";
			default:
				return "bg-gray-500";
		}
	};

	return (
		<nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="container mx-auto px-6 py-3">
				<div className="flex items-center justify-between">
					{/* Logo and Title */}
					<div className="flex items-center space-x-3">
						<div className="relative">
							<Image
								src="/adk.png"
								alt="ADK Logo"
								width={32}
								height={32}
								className="dark:hidden"
							/>
							<Image
								src="/dark-adk.png"
								alt="ADK Logo"
								width={32}
								height={32}
								className="hidden dark:block"
							/>
						</div>
						<div className="flex flex-col">
							<h1 className="text-xl font-bold">ADK-TS Web</h1>
							<p className="text-xs text-muted-foreground">
								Connected to {new URL(apiUrl).host}
							</p>
						</div>
					</div>

					{/* Agent Selector */}
					<div className="flex items-center space-x-4">
						{agents.length > 0 && (
							<div className="flex items-center space-x-2">
								<Select
									value={selectedAgent?.relativePath || ""}
									onValueChange={(value) => {
										const agent = agents.find((a) => a.relativePath === value);
										if (agent) onSelectAgent(agent);
									}}
								>
									<SelectTrigger className="w-[200px]">
										<SelectValue placeholder="Select an agent">
											{selectedAgent && (
												<div className="flex items-center space-x-2 justify-between">
													<Bot className="h-4 w-4 text-muted-foreground" />
													<span>{selectedAgent.name}</span>
													<div
														className={cn(
															"h-2 w-2 rounded-full",
															getStatusColor(getAgentStatus(selectedAgent)),
														)}
													/>
												</div>
											)}
										</SelectValue>
									</SelectTrigger>
									<SelectContent>
										{agents.map((agent) => (
											<SelectItem
												key={agent.relativePath}
												value={agent.relativePath}
											>
												<div className="flex items-center space-x-2">
													<div
														className={cn(
															"h-2 w-2 rounded-full",
															getStatusColor(getAgentStatus(agent)),
														)}
													/>
													<span>{agent.name}</span>
												</div>
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						<ThemeToggle />
					</div>
				</div>
			</div>
		</nav>
	);
}
