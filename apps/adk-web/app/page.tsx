"use client";

import { ChatPanel } from "@/components/chat-panel";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useAgents } from "@/hooks/useAgents";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function HomeContent() {
	const searchParams = useSearchParams();
	const apiUrl = searchParams.get("apiUrl");
	const port = searchParams.get("port");

	// Support both legacy apiUrl and new port parameter
	// Default to port 8042 if neither is provided
	const finalApiUrl =
		apiUrl || (port ? `http://localhost:${port}` : "http://localhost:8042");

	const {
		agents,
		selectedAgent,
		messages,
		agentStatus,
		connected,
		loading,
		error,
		sendMessage,
		selectAgent,
		refreshAgents,
		isSendingMessage,
	} = useAgents(finalApiUrl);

	// Auto-select first agent if none selected and agents are available
	useEffect(() => {
		if (agents.length > 0 && !selectedAgent) {
			selectAgent(agents[0]);
		}
	}, [agents, selectedAgent, selectAgent]);

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
		<div className="min-h-screen flex flex-col bg-background">
			<Navbar
				apiUrl={finalApiUrl}
				agents={agents}
				selectedAgent={selectedAgent}
				agentStatus={agentStatus}
				onSelectAgent={selectAgent}
			/>

			<main className="flex-1 flex flex-col min-h-0">
				<ChatPanel
					selectedAgent={selectedAgent}
					messages={messages}
					agentStatus={agentStatus}
					onSendMessage={sendMessage}
					isSendingMessage={isSendingMessage}
				/>
			</main>

			<Footer />
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
