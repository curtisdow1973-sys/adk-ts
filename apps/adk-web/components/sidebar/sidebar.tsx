"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Activity, Database } from "lucide-react";

interface SidebarProps {
	selectedPanel: "sessions" | "events" | null;
	onPanelSelect: (panel: "sessions" | "events" | null) => void;
	className?: string;
}

export function Sidebar({
	selectedPanel,
	onPanelSelect,
	className,
}: SidebarProps) {
	const navigationItems = [
		{
			id: "sessions" as const,
			label: "Sessions",
			icon: Database,
			description: "Manage agent sessions",
		},
		{
			id: "events" as const,
			label: "Events",
			icon: Activity,
			description: "View agent events",
		},
	];

	return (
		<div className={cn("w-16 border-r bg-card flex flex-col", className)}>
			{/* Navigation */}
			<div className="flex-1 flex flex-col items-center py-4 space-y-2">
				{navigationItems.map((item) => {
					const Icon = item.icon;
					const isSelected = selectedPanel === item.id;

					return (
						<Button
							key={item.id}
							variant={isSelected ? "secondary" : "ghost"}
							size="sm"
							className={cn(
								"w-10 h-10 p-0",
								isSelected && "bg-accent",
							)}
							onClick={() => onPanelSelect(isSelected ? null : item.id)}
							title={item.label}
						>
							<Icon className="h-4 w-4" />
						</Button>
					);
				})}
			</div>
		</div>
	);
}
