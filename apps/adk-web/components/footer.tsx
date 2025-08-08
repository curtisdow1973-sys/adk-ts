import { Brain } from "lucide-react";

export function Footer() {
	return (
		<footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 mt-auto">
			<div className="container mx-auto px-6 py-4">
				<div className="flex items-center justify-between text-sm text-muted-foreground">
					<div>© 2025 ADK TypeScript. Released under the MIT License.</div>
					<div className="flex items-center space-x-1">
						<Brain className="h-4 w-4" />
						<span>Powered by IQ</span>
					</div>
				</div>
			</div>
		</footer>
	);
}
