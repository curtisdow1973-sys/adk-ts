"use client";

import { ChatPanel } from "@/components/chat-panel";
import { EventsPanel } from "@/components/events-panel";
import { Navbar } from "@/components/navbar";
import { SessionsPanel } from "@/components/sessions-panel";
import { Sidebar } from "@/components/sidebar/sidebar";
import { StatePanel } from "@/components/state-panel";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useAgents } from "@/hooks/useAgents";
import { useEvents } from "@/hooks/useEvents";
import { useSessions } from "@/hooks/useSessions";
import { X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

function HomeContent() {
	const searchParams = useSearchParams();
	const apiUrl = searchParams.get("apiUrl");
	const port = searchParams.get("port");

	// Support both legacy apiUrl and new port parameter
	// Default to port 8042 if neither is provided
	const finalApiUrl =
		apiUrl || (port ? `http://localhost:${port}` : "http://localhost:8042");

	// Panel and session state
	const [selectedPanel, setSelectedPanel] = useState<
		"sessions" | "events" | "state" | null
	>(null);
	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [selectedEvent, setSelectedEvent] = useState<any | null>(null);

	const {
		agents,
		selectedAgent,
		messages,
		connected,
		loading,
		error,
		sendMessage,
		selectAgent,
		refreshAgents,
		isSendingMessage,
	} = useAgents(finalApiUrl, currentSessionId);

	// Sessions and events hooks
	const {
		sessions,
		isLoading: sessionsLoading,
		createSession,
		deleteSession,
		switchSession,
	} = useSessions(finalApiUrl, selectedAgent);

	const { events, isLoading: eventsLoading } = useEvents(
		finalApiUrl,
		selectedAgent,
		currentSessionId,
	);

	// Clear selected event when switching away from events panel or when session changes
	useEffect(() => {
		setSelectedEvent(null);
	});

	// Panel action handlers
	const handlePanelSelect = (panel: "sessions" | "events" | "state" | null) => {
		setSelectedPanel(panel);
	};

	const handleCreateSession = useCallback(
		async (state?: Record<string, any>, sessionId?: string) => {
			await createSession({ state, sessionId });
		},
		[createSession],
	);

	// Auto-select first agent if none selected and agents are available
	useEffect(() => {
		if (agents.length > 0 && !selectedAgent) {
			console.log("Auto-selecting first agent:", agents[0].name);
			selectAgent(agents[0]);
		}
	}, [agents, selectedAgent, selectAgent]);

	// Auto-select first session when sessions are loaded
	useEffect(() => {
		if (sessions.length > 0 && !currentSessionId) {
			const firstSessionId = sessions[0].id;
			setCurrentSessionId(firstSessionId);
			console.log("Auto-selected session:", firstSessionId);
		}
	}, [sessions, currentSessionId]);

	// Create initial session if agent is loaded but no sessions exist
	useEffect(() => {
		if (selectedAgent && sessions.length === 0 && !sessionsLoading) {
			console.log("Creating initial session for agent:", selectedAgent.name);
			handleCreateSession();
		}
	}, [selectedAgent, sessions.length, sessionsLoading, handleCreateSession]);

	const handleDeleteSession = async (sessionId: string) => {
		await deleteSession(sessionId);
		if (currentSessionId === sessionId) {
			setCurrentSessionId(null);
		}
	};

	const handleSwitchSession = async (sessionId: string) => {
		await switchSession(sessionId);
		setCurrentSessionId(sessionId);
	};

	if (loading) {
		return <LoadingState message="Connecting to ADK server..." />;
	}

	if (!finalApiUrl) {
		return (
			<ErrorState
				title="ADK-TS Web"
				message="This interface needs to be launched from the ADK CLI. Run adk web to start."
			/>
		);
	}

	if (!connected || error) {
		return (
			<ErrorState
				title="ADK-TS Web"
				message={`Failed to connect to ADK server at ${finalApiUrl}. Make sure the server is running.`}
				actionLabel="Retry Connection"
				onAction={refreshAgents}
			/>
		);
	}

	return (
		<div className="h-screen flex bg-background">
			{/* Sidebar */}
			<div className="flex-shrink-0 h-full">
				<Sidebar
					selectedPanel={selectedPanel}
					onPanelSelect={handlePanelSelect}
				/>
			</div>

			{/* Main Content Area */}
			<div className="flex-1 flex min-h-0">
				{/* Panel Content */}
				{selectedPanel && (
					<div className="w-80 border-r bg-background flex flex-col">
						{/* Panel Header */}
						<div className="flex h-[60px] items-center justify-between p-4 border-b">
							<h2 className="text-lg font-semibold">
								{selectedPanel === "sessions"
									? "Sessions"
									: selectedPanel === "events"
										? "Events"
										: "State"}
							</h2>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => setSelectedPanel(null)}
								className="h-6 w-6 p-0"
								aria-label="Close panel"
							>
								<X className="size-4" />
							</Button>
						</div>

						{/* Panel Content */}
						<div className="flex-1 overflow-hidden">
							{selectedPanel === "sessions" && (
								<SessionsPanel
									sessions={sessions}
									currentSessionId={currentSessionId}
									onCreateSession={handleCreateSession}
									onDeleteSession={handleDeleteSession}
									onSwitchSession={handleSwitchSession}
									isLoading={sessionsLoading}
								/>
							)}
							{selectedPanel === "events" && (
								<EventsPanel
									events={events}
									isLoading={eventsLoading}
									onSelectEvent={(e) => setSelectedEvent(e)}
									selectedEventId={selectedEvent?.id}
								/>
							)}
							{selectedPanel === "state" && (
								<StatePanel
									selectedAgent={selectedAgent}
									currentSessionId={currentSessionId}
								/>
							)}
						</div>
					</div>
				)}

				{/* Chat Panel - Always visible, takes remaining space */}
				<div className="flex-1 flex flex-col min-h-0">
					{/* Navbar above chat */}
					<div className="flex-shrink-0">
						<Navbar
							apiUrl={finalApiUrl}
							agents={agents}
							selectedAgent={selectedAgent}
							onSelectAgent={selectAgent}
						/>
					</div>

					{/* Chat Content */}
					<div className="flex-1 min-h-0 overflow-hidden">
						<ChatPanel
							selectedAgent={selectedAgent}
							messages={messages}
							onSendMessage={sendMessage}
							isSendingMessage={isSendingMessage}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function Home() {
	return (
		<Suspense fallback={<LoadingState message="Loading..." />}>
			<HomeContent />
		</Suspense>
	);
}
