import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Edit, X } from "lucide-react";
import { useState } from "react";

interface StateCardProps {
	stateKey: string;
	value: any;
	onUpdate: (key: string, value: any) => Promise<void>;
	onDelete: (key: string) => Promise<void>;
}

export function StateCard({
	stateKey,
	value,
	onUpdate,
	onDelete,
}: StateCardProps) {
	const [editingKey, setEditingKey] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");

	const startEditing = (key: string, value: any) => {
		setEditingKey(key);
		setEditValue(JSON.stringify(value, null, 2));
	};

	const cancelEditing = () => {
		setEditingKey(null);
		setEditValue("");
	};

	const handleSave = async () => {
		try {
			const parsedValue = JSON.parse(editValue);
			await onUpdate(stateKey, parsedValue);
			setEditingKey(null);
			setEditValue("");
		} catch (error) {
			console.error("Invalid JSON:", error);
			// You might want to show an error message here
		}
	};

	const handleDelete = async () => {
		await onDelete(stateKey);
	};

	return (
		<Card className="border border-border/50">
			<CardContent className="px-3 py-1">
				<div className="flex items-start justify-between gap-2 mb-2">
					<span className="text-xs font-mono text-muted-foreground truncate">
						{stateKey}
					</span>
					<div className="flex items-center gap-0.5 shrink-0">
						<Button
							variant="ghost"
							size="sm"
							className="h-6 w-6 p-0 hover:bg-muted/60"
							onClick={() => startEditing(stateKey, value)}
						>
							<Edit className="h-3 w-3" />
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
							onClick={handleDelete}
						>
							<X className="h-3 w-3" />
						</Button>
					</div>
				</div>

				{editingKey === stateKey ? (
					<div className="space-y-2">
						<Textarea
							value={editValue}
							onChange={(e) => setEditValue(e.target.value)}
							rows={2}
							className="font-mono text-xs min-h-[60px] resize-y"
							placeholder="Enter valid JSON..."
						/>
						<div className="flex justify-end gap-1">
							<Button
								variant="outline"
								size="sm"
								className="h-7 px-2 text-xs"
								onClick={cancelEditing}
							>
								Cancel
							</Button>
							<Button
								size="sm"
								className="h-7 px-2 text-xs"
								onClick={handleSave}
							>
								Save
							</Button>
						</div>
					</div>
				) : (
					<pre className="text-xs bg-muted/40 p-2 rounded-sm overflow-x-auto max-h-32 overflow-y-auto border border-border/30">
						{JSON.stringify(value, null, 2)}
					</pre>
				)}
			</CardContent>
		</Card>
	);
}
