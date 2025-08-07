"use client";

import { AgentsPanel } from "@/components/agents-panel";
import { ChatPanel } from "@/components/chat-panel";
import { Header } from "@/components/header";
import { ErrorState, LoadingState } from "@/components/ui/states";
import { useAgents } from "@/hooks/useAgents";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

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
		startAgent,
		stopAgent,
		sendMessage,
		selectAgent,
		refreshAgents,
		isStartingAgent,
		isStoppingAgent,
		isSendingMessage,
	} = useAgents(finalApiUrl);

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
		<div className="container mx-auto p-6 h-screen flex flex-col">
			<Header apiUrl={finalApiUrl} />

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
				<AgentsPanel
					agents={agents}
					selectedAgent={selectedAgent}
					agentStatus={agentStatus}
					onSelectAgent={selectAgent}
					onStartAgent={startAgent}
					onStopAgent={stopAgent}
					isStartingAgent={isStartingAgent}
					isStoppingAgent={isStoppingAgent}
				/>

				<ChatPanel
					selectedAgent={selectedAgent}
					messages={messages}
					agentStatus={agentStatus}
					onSendMessage={sendMessage}
					isSendingMessage={isSendingMessage}
				/>
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
