import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Agent, Message } from "@/lib/api";
import { Loader2, MessageCircle } from "lucide-react";
import { useState } from "react";

interface ChatPanelProps {
	selectedAgent: Agent | null;
	messages: Message[];
	agentStatus: Record<string, "running" | "stopped" | "error">;
	onSendMessage: (message: string) => void;
	isSendingMessage?: boolean;
}

export function ChatPanel({
	selectedAgent,
	messages,
	agentStatus,
	onSendMessage,
	isSendingMessage = false,
}: ChatPanelProps) {
	const [inputMessage, setInputMessage] = useState("");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!inputMessage.trim()) return;

		onSendMessage(inputMessage);
		setInputMessage("");
	};

	return (
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
									<ChatMessage key={message.id} message={message} />
								))}
							</div>
						</ScrollArea>
						<Separator />
						<form onSubmit={handleSubmit} className="p-4">
							<div className="flex gap-2">
								<Input
									placeholder="Type your message..."
									value={inputMessage}
									onChange={(e) => setInputMessage(e.target.value)}
									className="flex-1"
								/>
								<Button
									type="submit"
									disabled={!inputMessage.trim() || isSendingMessage}
								>
									{isSendingMessage ? (
										<>
											<Loader2 className="h-4 w-4 animate-spin mr-2" />
											Sending...
										</>
									) : (
										"Send"
									)}
								</Button>
							</div>
						</form>
					</>
				) : (
					<EmptyChat />
				)}
			</CardContent>
		</Card>
	);
}

interface ChatMessageProps {
	message: Message;
}

function ChatMessage({ message }: ChatMessageProps) {
	const getMessageStyle = (type: Message["type"]) => {
		switch (type) {
			case "user":
				return "bg-primary text-primary-foreground";
			case "system":
				return "bg-yellow-50 text-yellow-800 border border-yellow-200";
			default:
				return "bg-muted";
		}
	};

	return (
		<div
			className={`flex ${
				message.type === "user" ? "justify-end" : "justify-start"
			}`}
		>
			<div
				className={`max-w-[80%] p-3 rounded-lg ${getMessageStyle(message.type)}`}
			>
				<p className="text-sm">{message.content}</p>
			</div>
		</div>
	);
}

function EmptyChat() {
	return (
		<div className="flex-1 flex items-center justify-center">
			<div className="text-center text-muted-foreground">
				<MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
				<p>Select an agent to start chatting</p>
			</div>
		</div>
	);
}
