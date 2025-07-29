import { env } from "node:process";
import { AgentBuilder, type EnhancedRunner, TelemetryService } from "@iqai/adk";
import dedent from "dedent";

/**
 * 09 - Observability and Telemetry
 *
 * Learn how to monitor, trace, and observe your AI agents in production.
 * This example demonstrates comprehensive observability patterns including
 * telemetry collection, performance monitoring, and debugging capabilities.
 *
 * Concepts covered:
 * - TelemetryService integration
 * - Langfuse monitoring setup
 * - Performance tracking and metrics
 * - Error monitoring and alerting
 * - Custom telemetry events
 * - Production monitoring best practices
 */

const APP_NAME = "observability-example";

function validateTelemetryEnvironment(): boolean {
	const hasLangfuseKeys = env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY;
	const hasLangfuseHost = env.LANGFUSE_HOST;

	if (!hasLangfuseKeys) {
		console.log("⚠️  Note: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY not set");
		console.log("   Telemetry will use default configuration");
		return false;
	}

	if (hasLangfuseHost) {
		console.log(`📊 Using Langfuse host: ${env.LANGFUSE_HOST}`);
	}

	return true;
}

function initializeTelemetryService(): TelemetryService | null {
	const hasExternalTelemetry = validateTelemetryEnvironment();

	if (hasExternalTelemetry) {
		console.log("📊 Configuring external telemetry with Langfuse...");
		const telemetryService = new TelemetryService();

		const authString = Buffer.from(
			`${env.LANGFUSE_PUBLIC_KEY}:${env.LANGFUSE_SECRET_KEY}`,
		).toString("base64");

		telemetryService.initialize({
			appName: APP_NAME,
			appVersion: "1.0.0",
			otlpEndpoint: `${env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com"}/api/public/otel/v1/traces`,
			otlpHeaders: {
				Authorization: `Basic ${authString}`,
			},
		});

		return telemetryService;
	}

	return null;
}

async function demonstrateBasicTelemetry() {
	console.log("📝 Part 1: Basic Telemetry Setup");
	console.log("═══════════════════════════════════\n");

	const telemetryService = initializeTelemetryService();

	// Create agent with telemetry
	const { runner } = await AgentBuilder.create("monitored_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("An agent with comprehensive telemetry monitoring")
		.withInstruction(dedent`
			You are a helpful assistant being monitored for performance and quality.
			Provide clear, helpful responses while your performance is being tracked.
		`)
		.build();

	console.log("📊 Testing basic telemetry collection:");
	const response1 = await runner.ask(
		"Explain what observability means in AI systems",
	);
	console.log(`Response: ${response1}\n`);

	console.log("📈 Testing conversation tracking:");
	const response2 = await runner.ask(
		"What are the key metrics to monitor for AI agents?",
	);
	console.log(`Response: ${response2}\n`);

	console.log("🔍 Testing error scenarios:");
	try {
		const response3 = await runner.ask(
			`This is a very complex question that might cause issues: ${"x".repeat(1000)}`,
		);
		console.log(`Response: ${response3}\n`);
	} catch (error) {
		console.log(`Error captured by telemetry: ${error}\n`);
	}

	if (telemetryService) {
		console.log("✅ Telemetry data has been sent to Langfuse dashboard");
		console.log("🔗 Check your Langfuse dashboard to see the traces");
	} else {
		console.log(
			"ℹ️  Telemetry simulation completed (no external service configured)",
		);
	}
}

async function demonstrateAdvancedTelemetry() {
	console.log("📝 Part 2: Advanced Telemetry Patterns");
	console.log("════════════════════════════════════════\n");

	const telemetryService = initializeTelemetryService();

	// Create multiple agents for complex monitoring
	const { runner: primaryAgent } = await AgentBuilder.create("primary_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("Primary agent with detailed telemetry")
		.withInstruction("You are a primary agent that coordinates complex tasks")
		.build();

	const { runner: specialistAgent } = await AgentBuilder.create(
		"specialist_agent",
	)
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("Specialist agent for specific tasks")
		.withInstruction("You are a specialist that handles technical questions")
		.build();

	console.log("🔄 Testing multi-agent telemetry:");

	console.log("Primary agent processing:");
	const primaryResponse = await primaryAgent.ask(dedent`
		I need help with a technical architecture decision.
		Should I use microservices or a monolith for a new application?
	`);
	console.log(`Primary: ${primaryResponse}\n`);

	console.log("Specialist agent processing:");
	const specialistResponse = await specialistAgent.ask(dedent`
		Provide technical details about microservices vs monolith trade-offs,
		including performance, scalability, and maintenance considerations.
	`);
	console.log(`Specialist: ${specialistResponse}\n`);

	// Simulate performance monitoring
	console.log("⏱️ Performance monitoring simulation:");
	const startTime = Date.now();
	const performanceTest = await primaryAgent.ask(
		"Generate a detailed project plan for implementing observability",
	);
	const endTime = Date.now();
	const responseTime = endTime - startTime;

	console.log(`Response Time: ${responseTime}ms`);
	console.log(`Response: ${performanceTest}\n`);

	// Simulate custom metrics
	if (telemetryService) {
		console.log("📊 Custom metrics would be tracked:");
		console.log("- Response times for each agent");
		console.log("- Token usage per interaction");
		console.log("- Error rates and types");
		console.log("- User satisfaction scores");
		console.log("- Feature usage patterns");
	}
}

async function demonstrateProductionMonitoring() {
	console.log("📝 Part 3: Production Monitoring Simulation");
	console.log("═══════════════════════════════════════════\n");

	const telemetryService = initializeTelemetryService();

	// Create production-ready agent with comprehensive monitoring
	const { runner } = await AgentBuilder.create("production_agent")
		.withModel(env.LLM_MODEL || "gemini-2.5-flash")
		.withDescription("Production agent with full observability stack")
		.withInstruction(dedent`
			You are a production AI assistant with comprehensive monitoring.
			Handle requests professionally while maintaining high performance.
			All interactions are being monitored for quality and performance.
		`)
		.build();

	// Simulate production workload
	console.log("🏭 Simulating production workload:");

	const requests = [
		"Help me write a business proposal",
		"Analyze market trends for tech companies",
		"Create a project timeline for Q2",
		"Explain cloud architecture best practices",
		"Generate a risk assessment template",
	];

	const metrics = {
		totalRequests: 0,
		successfulRequests: 0,
		errors: 0,
		totalResponseTime: 0,
		avgResponseTime: 0,
	};

	for (const [index, request] of requests.entries()) {
		console.log(`\n🔄 Request ${index + 1}: ${request.substring(0, 50)}...`);

		try {
			const startTime = Date.now();
			const response = await runner.ask(request);
			const endTime = Date.now();
			const responseTime = endTime - startTime;

			metrics.totalRequests++;
			metrics.successfulRequests++;
			metrics.totalResponseTime += responseTime;

			console.log(
				`✅ Success (${responseTime}ms): ${response.substring(0, 100)}...`,
			);
		} catch (error) {
			metrics.totalRequests++;
			metrics.errors++;
			console.log(`❌ Error: ${error}`);
		}
	}

	// Calculate metrics
	metrics.avgResponseTime =
		metrics.totalResponseTime / metrics.successfulRequests;

	console.log("\n📊 Production Metrics Summary:");
	console.log(`Total Requests: ${metrics.totalRequests}`);
	console.log(`Successful: ${metrics.successfulRequests}`);
	console.log(`Errors: ${metrics.errors}`);
	console.log(
		`Success Rate: ${((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)}%`,
	);
	console.log(`Average Response Time: ${metrics.avgResponseTime.toFixed(2)}ms`);

	if (telemetryService) {
		console.log("\n🔗 Production telemetry includes:");
		console.log("- Request/response traces");
		console.log("- Performance metrics");
		console.log("- Error tracking");
		console.log("- User session analysis");
		console.log("- Model performance stats");
	}
}

async function demonstrateTelemetryBestPractices() {
	console.log("📝 Part 4: Telemetry and Observability Best Practices");
	console.log("═══════════════════════════════════════════════════\n");

	console.log(dedent`
		📊 Observability and Telemetry Best Practices:

		**Telemetry Strategy:**

		🎯 **Key Metrics to Track**
		   - Response times (p50, p95, p99)
		   - Token usage and costs
		   - Error rates by type
		   - User satisfaction scores
		   - Feature adoption rates
		   - Model performance drift

		📈 **Performance Monitoring**
		   - Real-time dashboards
		   - Automated alerting
		   - Trend analysis
		   - Capacity planning
		   - Performance regression detection

		**Langfuse Integration:**

		🔧 **Setup Configuration**
		   - Environment variable management
		   - Authentication setup
		   - Proper flush intervals
		   - Error handling
		   - Rate limiting awareness

		📋 **Trace Management**
		   - Meaningful trace names
		   - Structured metadata
		   - Session correlation
		   - User context tracking
		   - Custom event logging

		**Production Monitoring:**

		🚨 **Alerting Strategy**
		   - Error rate thresholds
		   - Response time SLAs
		   - Token usage limits
		   - Availability monitoring
		   - Custom business metrics

		🔍 **Debugging and Troubleshooting**
		   - Detailed error logging
		   - Request/response tracing
		   - Performance profiling
		   - User session replay
		   - A/B testing insights

		**Data Privacy and Security:**

		🛡️ **Privacy Considerations**
		   - PII data handling
		   - Data retention policies
		   - Anonymization strategies
		   - Compliance requirements
		   - User consent management

		🔐 **Security Monitoring**
		   - Authentication failures
		   - Rate limiting violations
		   - Suspicious patterns
		   - Data access auditing
		   - Vulnerability scanning

		**Cost Optimization:**

		💰 **Resource Management**
		   - Token usage optimization
		   - Model selection strategies
		   - Caching implementations
		   - Batch processing
		   - Auto-scaling policies

		📊 **Analytics and Insights**
		   - Usage pattern analysis
		   - Feature performance comparison
		   - User journey mapping
		   - ROI measurement
		   - Predictive analytics

		**Operational Excellence:**

		🔄 **Continuous Improvement**
		   - Regular metric reviews
		   - Performance optimization cycles
		   - User feedback integration
		   - Model retraining triggers
		   - Automated quality gates

		📚 **Documentation and Training**
		   - Monitoring playbooks
		   - Alert response procedures
		   - Performance baseline documentation
		   - Team training materials
		   - Incident post-mortems

		**Tools and Platforms:**

		🛠️ **Observability Stack**
		   - Langfuse: LLM-specific observability
		   - Prometheus/Grafana: Metrics and dashboards
		   - Jaeger/Zipkin: Distributed tracing
		   - ELK Stack: Log management
		   - Sentry: Error tracking

		📱 **Integration Patterns**
		   - OpenTelemetry standards
		   - Custom metric collectors
		   - Real-time streaming
		   - Batch data processing
		   - Multi-environment monitoring

		**Use Cases:**

		✅ **Essential For**
		   - Production AI applications
		   - High-traffic systems
		   - Mission-critical services
		   - Regulated industries
		   - Multi-tenant platforms

		🎯 **Business Value**
		   - Improved user experience
		   - Reduced operational costs
		   - Faster issue resolution
		   - Data-driven optimization
		   - Compliance demonstration
	`);
}

async function main() {
	console.log("📊 Observability and telemetry:");

	await demonstrateBasicTelemetry();
	await demonstrateAdvancedTelemetry();
	await demonstrateProductionMonitoring();
	await demonstrateTelemetryBestPractices();
}

main().catch(console.error);
