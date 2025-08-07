import type { Agent, Message } from "@/app/(dashboard)/_schema/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Loader2, MessageSquare, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!inputMessage.trim() || !selectedAgent) return;

		onSendMessage(inputMessage);
		setInputMessage("");
	};

	// Auto-scroll to bottom when new messages arrive
	useEffect(() => {
		if (messages.length > 0) {
			messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [messages.length]);

	if (!selectedAgent) {
		return <EmptyChat />;
	}

	return (
		<div className="flex flex-col min-h-0 flex-1">
			{/* Container with borders */}
			<div className="flex-1 flex flex-col max-w-4xl mx-auto w-full border-l border-r border-border bg-background min-h-0">
				{/* Input Area at Top */}
				<div className="border-b bg-muted/30 p-4">
					<form onSubmit={handleSubmit} className="flex gap-3">
						<Input
							placeholder={`Message ${selectedAgent.name}...`}
							value={inputMessage}
							onChange={(e) => setInputMessage(e.target.value)}
							className="flex-1 min-h-[44px] bg-background border-muted"
							disabled={isSendingMessage}
						/>
						<Button
							type="submit"
							disabled={!inputMessage.trim() || isSendingMessage}
							size="icon"
							className="min-w-[44px] h-[44px]"
						>
							{isSendingMessage ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<Send className="h-4 w-4" />
							)}
						</Button>
					</form>
				</div>

				{/* Chat Messages Area */}
				<ScrollArea className="flex-1 min-h-0" ref={scrollAreaRef}>
					<div className="divide-y divide-border">
						{messages.length === 0 ? (
							<div className="flex flex-col items-center justify-center min-h-[400px] text-center text-muted-foreground p-8">
								<MessageSquare className="h-12 w-12 mb-4 opacity-50" />
								<h3 className="text-lg font-medium mb-2">
									Start a conversation
								</h3>
								<p className="text-sm">
									Send a message to {selectedAgent.name} to get started
								</p>
							</div>
						) : (
							messages.map((message) => (
								<ChatMessage
									key={message.id}
									message={message}
									agentName={selectedAgent.name}
								/>
							))
						)}
					</div>
					<div ref={messagesEndRef} />
				</ScrollArea>
			</div>
		</div>
	);
}

interface ChatMessageProps {
	message: Message;
	agentName: string;
}

function ChatMessage({ message, agentName }: ChatMessageProps) {
	const isUser = message.type === "user";
	const isSystem = message.type === "system";

	return (
		<div
			className={`w-full p-4 hover:bg-muted/20 transition-colors ${
				isUser ? "bg-primary/5" : isSystem ? "bg-yellow-50/50" : "bg-muted/10"
			}`}
		>
			<div className="flex gap-3 w-full">
				{/* Avatar */}
				<Avatar className="h-10 w-10 flex-shrink-0">
					<AvatarFallback
						className={`text-xs font-medium ${
							isUser
								? "bg-primary text-primary-foreground"
								: isSystem
									? "bg-yellow-100 text-yellow-800"
									: "bg-muted text-muted-foreground"
						}`}
					>
						{isUser ? (
							<User className="h-4 w-4" />
						) : (
							<Bot className="h-4 w-4" />
						)}
					</AvatarFallback>
				</Avatar>

				{/* Message Content */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1">
						<span className="font-medium text-sm">
							{isUser ? "You" : isSystem ? "System" : agentName}
						</span>
						<span className="text-xs text-muted-foreground">
							{/* You could add timestamp here if available */}
							now
						</span>
					</div>
					<div className="text-sm leading-relaxed text-foreground break-words">
						{message.content}
					</div>
				</div>
			</div>
		</div>
	);
}

function EmptyChat() {
	return (
		<div className="flex flex-col min-h-0 flex-1">
			{/* Container with borders */}
			<div className="flex-1 flex items-center justify-center max-w-4xl mx-auto w-full border-l border-r border-border bg-background min-h-[400px]">
				<div className="text-center max-w-md p-8">
					{/* Beautiful illustration placeholder */}
					<div className="mb-8 relative">
						<div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
							<MessageSquare className="h-10 w-10 text-blue-600" />
						</div>
						<div className="absolute top-0 right-1/3 w-3 h-3 bg-blue-200 rounded-full animate-pulse" />
						<div className="absolute top-4 left-1/4 w-2 h-2 bg-purple-200 rounded-full animate-pulse delay-500" />
						<div className="absolute bottom-4 right-1/4 w-4 h-4 bg-indigo-200 rounded-full animate-pulse delay-1000" />
					</div>

					<h3 className="text-xl font-semibold text-foreground mb-3">
						Welcome to ADK Chat
					</h3>
					<p className="text-muted-foreground mb-6 leading-relaxed">
						Choose an AI agent from the dropdown above to start an intelligent
						conversation. Each agent has unique capabilities and expertise.
					</p>
					<div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
						<Bot className="h-4 w-4" />
						<span>Powered by IQ AI</span>
					</div>
				</div>
			</div>
		</div>
	);
}
