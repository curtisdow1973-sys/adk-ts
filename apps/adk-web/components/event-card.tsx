"use client";

import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Bot, CheckCircle, Clock, Code, MessageSquare, User } from "lucide-react";

export interface EventLike {
	id: string;
	author: string;
	timestamp: number;
	content: any;
	actions: any;
	functionCalls: any[];
	functionResponses: any[];
	isFinalResponse: boolean;
}

function getEventIcon(event: EventLike) {
	if (event.functionCalls.length > 0) return <Clock className="h-4 w-4 text-blue-500" />;
	if (event.functionResponses.length > 0) return <CheckCircle className="h-4 w-4 text-green-500" />;
	if (event.isFinalResponse) return <MessageSquare className="h-4 w-4 text-purple-500" />;
	if (event.content?.parts?.some((p: any) => p.codeExecutionResult)) return <Code className="h-4 w-4 text-orange-500" />;
	return <MessageSquare className="h-4 w-4 text-gray-500" />;
}

function getEventTypeLabel(event: EventLike) {
	if (event.functionCalls.length > 0) return "Function Call";
	if (event.functionResponses.length > 0) return "Function Response";
	if (event.isFinalResponse) return "Final Response";
	if (event.content?.parts?.some((p: any) => p.codeExecutionResult)) return "Code Execution";
	return "Message";
}

function getEventSummary(event: EventLike) {
	if (event.functionCalls.length > 0) {
		const call = event.functionCalls[0];
		return `${call.name}(${call.args ? Object.keys(call.args).join(", ") : ""})`;
	}
	if (event.functionResponses.length > 0) return `Response from ${event.functionResponses.length} function(s)`;
	if (event.content?.parts?.[0]?.text) return event.content.parts[0].text;
	return "Event content";
}

interface EventCardProps {
	event: EventLike;
	onClick?: () => void;
}

export function EventCard({ event, onClick }: EventCardProps) {
	return (
		<Card className="transition-colors hover:bg-muted/50 cursor-pointer" onClick={onClick}>
			<CardHeader >
					<div className="flex flex-col gap-1">
						<div className="flex items-center gap-2 mb-1 justify-between">
					<div className="flex gap-1 items-center">
                <Badge variant="outline" className="text-sm">
                <div className="flex-shrink-0 mr-0.5">{getEventIcon(event)}</div>{getEventTypeLabel(event)}</Badge>
          </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
								<Clock className="h-3 w-3" />
								{formatDistanceToNow(new Date(event.timestamp * 1000), { addSuffix: true })}
							</div>
						</div>
						<div className="flex justify-between gap-2 mt-1">
							<div className="flex items-center gap-2">
                {event.author === "user" ? (
                  <User className="h-3 w-3 text-blue-500" />
                ) : (
                  <Bot className="h-3 w-3 text-green-500" />
                )}
                <span className="text-sm font-medium truncate">{event.author}</span>
              </div>

						</div>
						<p className="text-sm text-muted-foreground line-clamp-2 break-words">{getEventSummary(event)}</p>
					</div>
			</CardHeader>
		</Card>
	);
}

export default EventCard;
