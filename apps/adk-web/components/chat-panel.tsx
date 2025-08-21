import type { Agent, Message } from "@/app/(dashboard)/_schema";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	Message as AIMessage,
	MessageAvatar,
	MessageContent,
} from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputButton,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputToolbar,
	PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	Bot,
	Camera,
	FileUp,
	MessageSquare,
	Paperclip,
	ScreenShare,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ChatPanelProps {
	selectedAgent: Agent | null;
	messages: Message[];
	onSendMessage: (message: string, attachments?: File[]) => void;
	isSendingMessage?: boolean;
}

export function ChatPanel({
	selectedAgent,
	messages,
	onSendMessage,
	isSendingMessage = false,
}: ChatPanelProps) {
	const [inputMessage, setInputMessage] = useState("");
	const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
	const [showAttachmentDropdown, setShowAttachmentDropdown] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const photoInputRef = useRef<HTMLInputElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!inputMessage.trim() || !selectedAgent) return;

		onSendMessage(inputMessage, attachedFiles);
		setInputMessage("");
		setAttachedFiles([]);
	};

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setShowAttachmentDropdown(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const handleFileAttach = () => {
		setShowAttachmentDropdown(false);
		fileInputRef.current?.click();
	};

	const handlePhotoAttach = () => {
		setShowAttachmentDropdown(false);
		photoInputRef.current?.click();
	};

	const handleScreenshot = async () => {
		setShowAttachmentDropdown(false);
		try {
			// Use the browser's screen capture API
			const stream = await navigator.mediaDevices.getDisplayMedia({
				video: true,
			});

			// Create a video element to capture the frame
			const video = document.createElement("video");
			video.srcObject = stream;
			video.play();

			video.addEventListener("loadedmetadata", () => {
				// Create canvas to capture the frame
				const canvas = document.createElement("canvas");
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				const ctx = canvas.getContext("2d");

				if (ctx) {
					ctx.drawImage(video, 0, 0);

					// Convert to blob and create file
					canvas.toBlob((blob) => {
						if (blob) {
							const file = new File([blob], `screenshot-${Date.now()}.png`, {
								type: "image/png",
							});
							setAttachedFiles((prev) => [...prev, file]);
						}

						// Stop the stream
						stream.getTracks().forEach((track) => track.stop());
					}, "image/png");
				}
			});
		} catch (error) {
			console.error("Failed to capture screenshot:", error);
		}
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(e.target.files || []);
		setAttachedFiles((prev) => [...prev, ...files]);
		e.target.value = ""; // Reset input
	};

	const removeFile = (index: number) => {
		setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
	};

	if (!selectedAgent) {
		return <EmptyChat />;
	}

	return (
		<div className="flex flex-col min-h-0 flex-1">
			{/* Container with borders */}
			<div className="flex-1 flex flex-col max-w-4xl mx-auto w-full border-l border-r border-border bg-background min-h-0">
				{/* Input Area at Top */}
				<div className="p-4">
					<PromptInput onSubmit={handleSubmit} className="overflow-visible">
						<PromptInputTextarea
							placeholder={`Message ${selectedAgent.name}...`}
							value={inputMessage}
							onChange={(e) => setInputMessage(e.target.value)}
							disabled={isSendingMessage}
							minHeight={48}
							maxHeight={164}
						/>

						{/* Show attached files */}
						{attachedFiles.length > 0 && (
							<div className="px-3 py-2 border-t border-border">
								<div className="flex flex-wrap gap-2">
									{attachedFiles.map((file, index) => (
										<div
											key={`${file.name}-${file.size}-${index}`}
											className="flex items-center gap-2 px-2 py-1 bg-secondary rounded-md text-sm"
										>
											<span className="text-secondary-foreground">
												{file.name}
											</span>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="h-4 w-4 text-muted-foreground hover:text-destructive"
												onClick={() => removeFile(index)}
											>
												×
											</Button>
										</div>
									))}
								</div>
							</div>
						)}

						<PromptInputToolbar>
							<PromptInputTools>
								<div className="relative" ref={dropdownRef}>
									<PromptInputButton
										onClick={() =>
											setShowAttachmentDropdown(!showAttachmentDropdown)
										}
										className={cn(
											"transition-colors",
											showAttachmentDropdown &&
												"bg-accent text-accent-foreground",
										)}
									>
										<Paperclip className="size-4" />
									</PromptInputButton>

									{showAttachmentDropdown && (
										<div className="absolute top-full left-0 mt-3 w-36 bg-card border border-border rounded-md shadow-lg z-50">
											<div className="p-1">
												<button
													type="button"
													onClick={handleFileAttach}
													className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-left rounded-sm"
												>
													<FileUp className="size-4" />
													Upload File
												</button>
												<button
													type="button"
													onClick={handlePhotoAttach}
													className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-left rounded-sm"
												>
													<Camera className="size-4" />
													Upload Photo
												</button>
												<button
													type="button"
													onClick={handleScreenshot}
													className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-card-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-left rounded-sm"
												>
													<ScreenShare className="size-4" />
													Screenshot
												</button>
											</div>
										</div>
									)}
								</div>
							</PromptInputTools>
							<PromptInputSubmit
								disabled={!inputMessage.trim() || isSendingMessage}
								status={isSendingMessage ? "submitted" : undefined}
							/>
						</PromptInputToolbar>
					</PromptInput>

					{/* Hidden file inputs */}
					<input
						ref={fileInputRef}
						type="file"
						multiple
						className="hidden"
						onChange={handleFileChange}
						accept="*/*"
					/>
					<input
						ref={photoInputRef}
						type="file"
						multiple
						className="hidden"
						onChange={handleFileChange}
						accept="image/*"
					/>
				</div>

				{/* Chat Messages Area */}
				<Conversation className="flex-1 min-h-0">
					<ConversationContent>
						{messages.length === 0 ? (
							<div className="flex flex-col items-center justify-center min-h-[400px] text-center text-muted-foreground">
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
								<AIMessage
									key={message.id}
									from={message.type === "user" ? "user" : "assistant"}
								>
									<MessageAvatar
										src={
											message.type === "user"
												? "/user-avatar.png"
												: "/agent-avatar.png"
										}
										name={message.type === "user" ? "You" : selectedAgent.name}
									/>
									<MessageContent>{message.content}</MessageContent>
								</AIMessage>
							))
						)}
					</ConversationContent>
					<ConversationScrollButton />
				</Conversation>
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
						<div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-primary/20 to-accent/30 flex items-center justify-center">
							<MessageSquare className="h-10 w-10 text-primary" />
						</div>
						<div className="absolute top-0 right-1/3 w-3 h-3 bg-primary/40 rounded-full animate-pulse" />
						<div className="absolute top-4 left-1/4 w-2 h-2 bg-accent/50 rounded-full animate-pulse delay-500" />
						<div className="absolute bottom-4 right-1/4 w-4 h-4 bg-secondary/60 rounded-full animate-pulse delay-1000" />
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
