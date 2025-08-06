import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, Bot, Loader2 } from "lucide-react";

interface LoadingStateProps {
	message: string;
}

export function LoadingState({ message }: LoadingStateProps) {
	return (
		<div className="flex items-center justify-center min-h-screen">
			<div className="text-center">
				<Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
				<p>{message}</p>
			</div>
		</div>
	);
}

interface ErrorStateProps {
	title: string;
	message: string;
	actionLabel?: string;
	onAction?: () => void;
}

export function ErrorState({
	title,
	message,
	actionLabel,
	onAction,
}: ErrorStateProps) {
	return (
		<div className="container mx-auto p-8">
			<div className="max-w-2xl mx-auto text-center">
				<div className="flex items-center justify-center mb-4">
					<div className="bg-gray-100 rounded-full p-4 flex items-center justify-center">
						<Bot className="h-8 w-8 text-gray-700" />
					</div>
				</div>
				<h1 className="text-3xl font-bold mb-4">{title}</h1>
				<Alert>
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{message}</AlertDescription>
				</Alert>
				{actionLabel && onAction && (
					<Button onClick={onAction} className="mt-4">
						{actionLabel}
					</Button>
				)}
			</div>
		</div>
	);
}
