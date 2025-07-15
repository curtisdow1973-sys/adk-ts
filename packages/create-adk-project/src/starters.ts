export interface StarterOption {
	value: string;
	label: string;
	hint: string;
	template: string;
}

export const starters: StarterOption[] = [
	{
		value: "adk-agent-starter",
		label: "🤖 ADK Agent Starter",
		hint: "Complete agent development starter template",
		template: "github:IQAIcom/adk-agent-starter",
	},
];
