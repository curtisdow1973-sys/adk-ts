import {
	AgentBuilder,
	InMemorySessionService,
	LlmAgent,
	Runner,
	createTool,
} from "@iqai/adk";
import * as z from "zod";
import dedent from "dedent";
import { env } from "node:process";

/**
 * 10 - Advanced Workflows and Complex Orchestration
 *
 * Learn how to build sophisticated multi-agent workflows that handle
 * complex business processes, decision trees, and advanced orchestration
 * patterns. This example demonstrates enterprise-grade agent architectures.
 *
 * Concepts covered:
 * - Complex agent orchestration patterns
 * - LangGraph-style state machines
 * - Multi-step workflow management
 * - Conditional branching and decision trees
 * - Agent handoffs and task delegation
 * - Workflow state management
 * - Error recovery and retry patterns
 */

// Workflow state management
const workflowStateTool = createTool({
	name: "update_workflow_state",
	description: "Update the current workflow state and progress",
	schema: z.object({
		stage: z.string().describe("Current workflow stage"),
		status: z
			.enum(["pending", "in_progress", "completed", "failed"])
			.describe("Stage status"),
		data: z.record(z.any()).optional().describe("Stage-specific data"),
		nextStage: z.string().optional().describe("Next stage to execute"),
	}),
	fn: ({ stage, status, data, nextStage }, context) => {
		const workflow = context.state.get("workflow", {
			stages: {},
			currentStage: null,
			progress: [],
		});

		// Update stage status
		workflow.stages[stage] = {
			status,
			data: data || {},
			timestamp: new Date().toISOString(),
			nextStage,
		};

		// Update progress log
		workflow.progress.push({
			stage,
			status,
			timestamp: new Date().toISOString(),
			message: `Stage '${stage}' marked as ${status}`,
		});

		// Update current stage
		if (status === "completed" && nextStage) {
			workflow.currentStage = nextStage;
		} else if (status === "in_progress") {
			workflow.currentStage = stage;
		}

		context.state.set("workflow", workflow);

		return {
			success: true,
			workflow,
			message: `Workflow updated: ${stage} -> ${status}`,
		};
	},
});

// Decision making tool
const makeDecisionTool = createTool({
	name: "make_decision",
	description:
		"Make a decision based on criteria and update workflow accordingly",
	schema: z.object({
		decision: z.string().describe("The decision made"),
		criteria: z.array(z.string()).describe("Criteria used for decision"),
		confidence: z.number().min(0).max(1).describe("Confidence level (0-1)"),
		nextActions: z.array(z.string()).describe("Next actions to take"),
	}),
	fn: ({ decision, criteria, confidence, nextActions }, context) => {
		const decisions = context.state.get("decisions", []);

		const newDecision = {
			id: Date.now(),
			decision,
			criteria,
			confidence,
			nextActions,
			timestamp: new Date().toISOString(),
		};

		decisions.push(newDecision);
		context.state.set("decisions", decisions);

		return {
			success: true,
			decision: newDecision,
			totalDecisions: decisions.length,
			message: `Decision made: ${decision} (confidence: ${(confidence * 100).toFixed(1)}%)`,
		};
	},
});

async function demonstrateBasicWorkflow() {
	console.log("📝 Part 1: Basic Workflow Orchestration");
	console.log("═══════════════════════════════════════\n");

	// Create workflow coordinator
	const coordinator = new LlmAgent({
		name: "workflow_coordinator",
		description: "Coordinates multi-step workflows",
		instruction: dedent`
			You are a workflow coordinator that manages complex multi-step processes.
			Break down complex tasks into stages, track progress, and coordinate execution.
			Use the workflow state tool to track progress and the decision tool when choices are needed.
		`,
		tools: [workflowStateTool, makeDecisionTool],
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	// Create specialized workers
	const researchAgent = new LlmAgent({
		name: "research_specialist",
		description: "Conducts research and gathers information",
		instruction: dedent`
			You are a research specialist. When given research tasks:
			1. Break down the research into specific questions
			2. Provide comprehensive, well-sourced information
			3. Highlight key findings and insights
			4. Suggest additional research directions
		`,
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	const analysisAgent = new LlmAgent({
		name: "analysis_specialist",
		description: "Analyzes data and provides insights",
		instruction: dedent`
			You are an analysis specialist. When given data or information:
			1. Identify patterns and trends
			2. Provide statistical insights
			3. Draw logical conclusions
			4. Recommend actionable next steps
		`,
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	const reportingAgent = new LlmAgent({
		name: "reporting_specialist",
		description: "Creates comprehensive reports and summaries",
		instruction: dedent`
			You are a reporting specialist. When creating reports:
			1. Structure information clearly
			2. Include executive summaries
			3. Present data visually when possible
			4. Provide actionable recommendations
		`,
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	// Create workflow system
	const sessionService = new InMemorySessionService();
	const { runner } = await AgentBuilder.create("workflow_orchestrator")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("Workflow orchestration system")
		.withInstruction(dedent`
			You coordinate complex multi-stage workflows using specialized agents.
			Break down complex tasks and manage the flow between research, analysis, and reporting.
		`)
		.withSubAgents([coordinator, researchAgent, analysisAgent, reportingAgent])
		.withSessionService(sessionService, {
			userId: "demo-user",
			appName: "advanced-workflow",
		})
		.build();

	console.log("🔄 Testing basic workflow orchestration:");
	const workflowRequest = dedent`
		I need a comprehensive market analysis for electric vehicle charging stations.
		
		Please coordinate this as a multi-stage workflow:
		1. Research current market size and growth trends
		2. Analyze key players and competitive landscape  
		3. Identify market opportunities and challenges
		4. Create a final report with recommendations
		
		Track progress through each stage and make decisions as needed.
	`;

	console.log(`Workflow Request: ${workflowRequest}`);
	console.log("\n🏗️ Workflow Execution:");

	const workflowResult = await runner.ask(workflowRequest);
	console.log(workflowResult);
	console.log();
}

async function demonstrateLangGraphStyleWorkflow() {
	console.log("📝 Part 2: LangGraph-Style State Machine Workflow");
	console.log("═══════════════════════════════════════════════════\n");

	// State machine workflow with conditional branching
	const stateMachineAgent = new LlmAgent({
		name: "state_machine_controller",
		description: "Controls state machine workflows with conditional branching",
		instruction: dedent`
			You are a state machine controller that manages workflows with conditional logic.
			
			Available states: INIT, GATHER_REQUIREMENTS, ANALYZE_COMPLEXITY, SIMPLE_PATH, COMPLEX_PATH, REVIEW, COMPLETE
			
			State transitions:
			- INIT -> GATHER_REQUIREMENTS
			- GATHER_REQUIREMENTS -> ANALYZE_COMPLEXITY
			- ANALYZE_COMPLEXITY -> SIMPLE_PATH (if simple) or COMPLEX_PATH (if complex)
			- SIMPLE_PATH -> REVIEW
			- COMPLEX_PATH -> REVIEW  
			- REVIEW -> COMPLETE (if approved) or back to previous state (if needs work)
			
			Use the workflow state tool to track current state and the decision tool for branching logic.
		`,
		tools: [workflowStateTool, makeDecisionTool],
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	const requirementsAgent = new LlmAgent({
		name: "requirements_gatherer",
		description: "Gathers and analyzes requirements",
		instruction:
			"You gather detailed requirements and assess their completeness and clarity.",
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	const complexityAnalyzer = new LlmAgent({
		name: "complexity_analyzer",
		description: "Analyzes task complexity and determines appropriate approach",
		instruction:
			"You analyze complexity and recommend simple vs complex processing paths.",
		tools: [makeDecisionTool],
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	const simpleProcessor = new LlmAgent({
		name: "simple_processor",
		description: "Handles simple, straightforward tasks",
		instruction: "You handle simple tasks efficiently with minimal overhead.",
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	const complexProcessor = new LlmAgent({
		name: "complex_processor",
		description: "Handles complex, multi-faceted tasks",
		instruction:
			"You handle complex tasks with detailed analysis and comprehensive solutions.",
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	const reviewer = new LlmAgent({
		name: "quality_reviewer",
		description: "Reviews work quality and completeness",
		instruction:
			"You review work for quality, completeness, and accuracy. Provide constructive feedback.",
		tools: [makeDecisionTool],
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	// Create state machine workflow
	const sessionService = new InMemorySessionService();
	const { runner } = await AgentBuilder.create("state_machine_orchestrator")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("State machine workflow orchestrator")
		.withInstruction(dedent`
			You orchestrate state machine-based workflows with multiple specialized agents.
			Manage state transitions and coordinate the flow between different processing stages.
		`)
		.withSubAgents([
			stateMachineAgent,
			requirementsAgent,
			complexityAnalyzer,
			simpleProcessor,
			complexProcessor,
			reviewer,
		])
		.withSessionService(sessionService, {
			userId: "demo-user",
			appName: "state-machine-workflow",
		})
		.build();

	console.log("🔀 Testing state machine workflow:");
	const stateMachineRequest = dedent`
		I need help creating a customer onboarding system.
		
		Process this through the state machine workflow:
		1. Start in INIT state
		2. Gather requirements for the onboarding system
		3. Analyze if this is a simple or complex implementation
		4. Route to appropriate processing path
		5. Review the final solution
		6. Complete the workflow
		
		Track all state transitions and decisions made.
	`;

	console.log(`State Machine Request: ${stateMachineRequest}`);
	console.log("\n🔄 State Machine Execution:");

	const stateMachineResult = await runner.ask(stateMachineRequest);
	console.log(stateMachineResult);
	console.log();
}

async function demonstrateErrorRecoveryWorkflow() {
	console.log("📝 Part 3: Error Recovery and Retry Patterns");
	console.log("═══════════════════════════════════════════\n");

	// Error recovery coordinator
	const errorRecoveryAgent = new LlmAgent({
		name: "error_recovery_coordinator",
		description: "Manages error recovery and retry logic",
		instruction: dedent`
			You are an error recovery coordinator that handles failures gracefully.
			
			When errors occur:
			1. Assess the type and severity of the error
			2. Determine if retry is appropriate
			3. Try alternative approaches if retries fail
			4. Escalate to human intervention if needed
			5. Track all recovery attempts
			
			Use workflow state and decision tools to manage recovery processes.
		`,
		tools: [workflowStateTool, makeDecisionTool],
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	// Resilient worker that can fail and recover
	const resilientWorker = new LlmAgent({
		name: "resilient_worker",
		description: "A worker that demonstrates error scenarios and recovery",
		instruction: dedent`
			You are a resilient worker that can simulate various failure scenarios.
			
			When processing tasks:
			- Sometimes simulate "network errors" for external API calls
			- Sometimes simulate "timeout errors" for long operations
			- Sometimes simulate "validation errors" for invalid inputs
			- Always provide details about what went wrong
			- Suggest recovery strategies when failures occur
		`,
		model: env.LLM_MODEL || "gemini-2.5-flash",
	});

	const sessionService = new InMemorySessionService();
	const { runner } = await AgentBuilder.create("error_recovery_orchestrator")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("Error recovery workflow orchestrator")
		.withInstruction(dedent`
			You orchestrate error recovery workflows using resilient agents.
			Handle failures gracefully and coordinate retry and recovery strategies.
		`)
		.withSubAgents([errorRecoveryAgent, resilientWorker])
		.withSessionService(sessionService, {
			userId: "demo-user",
			appName: "error-recovery-workflow",
		})
		.build();

	console.log("🛠️ Testing error recovery workflow:");
	const errorRecoveryRequest = dedent`
		Simulate a workflow that processes customer data with potential failures:
		
		1. Attempt to fetch customer data (simulate network error)
		2. Implement retry logic with exponential backoff
		3. Try alternative data source if retries fail
		4. Validate the data (simulate validation error)
		5. Implement data cleaning/correction process
		6. Complete processing or escalate if unrecoverable
		
		Demonstrate how error recovery and retry patterns work in practice.
	`;

	console.log(`Error Recovery Request: ${errorRecoveryRequest}`);
	console.log("\n🔧 Error Recovery Execution:");

	const errorRecoveryResult = await runner.ask(errorRecoveryRequest);
	console.log(errorRecoveryResult);
	console.log();
}

async function demonstrateAdvancedOrchestrationPatterns() {
	console.log("📝 Part 4: Advanced Orchestration Patterns");
	console.log("═══════════════════════════════════════════\n");

	console.log(dedent`
		🏗️ Advanced Workflow and Orchestration Patterns:

		**State Machine Patterns:**

		🔄 **Finite State Machines**
		   - Explicit state definitions
		   - Controlled state transitions
		   - State validation and enforcement
		   - History tracking and rollback
		   - Parallel state execution

		🌳 **Decision Trees**
		   - Conditional branching logic
		   - Multi-criteria decision making
		   - Confidence-based routing
		   - Fallback path handling
		   - Dynamic path optimization

		**Orchestration Strategies:**

		📋 **Sequential Workflows**
		   - Linear task progression
		   - Dependency management
		   - Checkpoint creation
		   - Progress tracking
		   - Stage rollback capabilities

		⚡ **Parallel Workflows**
		   - Concurrent task execution
		   - Resource coordination
		   - Result aggregation
		   - Synchronization points
		   - Load balancing

		🔀 **Hybrid Workflows**
		   - Mixed sequential/parallel execution
		   - Dynamic workflow generation
		   - Adaptive routing
		   - Resource-aware scheduling
		   - Priority-based execution

		**Error Handling Patterns:**

		🛡️ **Resilience Strategies**
		   - Circuit breaker patterns
		   - Exponential backoff
		   - Timeout management
		   - Graceful degradation
		   - Alternative path routing

		🔄 **Recovery Mechanisms**
		   - Automatic retry logic
		   - State restoration
		   - Partial result preservation
		   - Human-in-the-loop escalation
		   - Disaster recovery procedures

		**Workflow State Management:**

		💾 **State Persistence**
		   - Checkpoint creation
		   - State serialization
		   - Recovery point management
		   - State migration
		   - Version compatibility

		🔍 **State Monitoring**
		   - Real-time state tracking
		   - Performance metrics
		   - Bottleneck identification
		   - Resource utilization
		   - Progress visualization

		**Agent Coordination:**

		🤝 **Communication Patterns**
		   - Message passing
		   - Shared state coordination
		   - Event-driven architecture
		   - Publish-subscribe patterns
		   - Request-response protocols

		🎯 **Task Distribution**
		   - Work queue management
		   - Load balancing
		   - Capability-based routing
		   - Priority queuing
		   - Resource allocation

		**Performance Optimization:**

		⚡ **Efficiency Strategies**
		   - Caching mechanisms
		   - Result memoization
		   - Lazy evaluation
		   - Batch processing
		   - Pipeline optimization

		📊 **Monitoring and Metrics**
		   - Workflow performance tracking
		   - Agent utilization metrics
		   - Bottleneck analysis
		   - SLA monitoring
		   - Cost optimization

		**Business Applications:**

		💼 **Enterprise Use Cases**
		   - Document processing pipelines
		   - Customer service workflows
		   - Compliance checking systems
		   - Quality assurance processes
		   - Supply chain management

		🏭 **Industry Examples**
		   - Financial transaction processing
		   - Healthcare patient workflows
		   - Manufacturing quality control
		   - Legal document review
		   - Scientific research pipelines

		**Best Practices:**

		✅ **Design Principles**
		   - Clear separation of concerns
		   - Idempotent operations
		   - Stateless agent design
		   - Explicit error handling
		   - Comprehensive logging

		📚 **Implementation Guidelines**
		   - Start simple, add complexity gradually
		   - Design for failure scenarios
		   - Implement comprehensive testing
		   - Document workflow logic clearly
		   - Plan for scalability requirements
	`);
}

async function main() {
	console.log("🏗️ 10 - Advanced Workflows and Complex Orchestration");
	console.log("═══════════════════════════════════════════════════\n");

	try {
		await demonstrateBasicWorkflow();
		await demonstrateLangGraphStyleWorkflow();
		await demonstrateErrorRecoveryWorkflow();
		await demonstrateAdvancedOrchestrationPatterns();

		console.log("✅ Advanced Workflows examples completed!");
		console.log("\n🎓 Key Takeaways:");
		console.log(
			"- Complex workflows require careful orchestration and state management",
		);
		console.log(
			"- State machines provide predictable workflow execution patterns",
		);
		console.log(
			"- Error recovery and retry patterns are essential for production systems",
		);
		console.log(
			"- Advanced orchestration enables sophisticated business process automation",
		);

		console.log("\n🎓 Next Steps:");
		console.log(
			"- Run example 11-mcp-integrations for protocol-based integrations",
		);
		console.log("- Design workflows for your specific business processes");
		console.log(
			"- Implement error handling and recovery for production systems",
		);
		console.log("- Explore LangGraph for more advanced workflow patterns");
	} catch (error) {
		console.error("❌ Error in advanced workflows example:", error);
		process.exit(1);
	}
}

main().catch(console.error);
