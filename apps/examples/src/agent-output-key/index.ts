import { AgentBuilder, LlmAgent } from "@iqai/adk";
import dedent from "dedent";

/**
 * Restaurant Order Processing System
 *
 * This example demonstrates:
 * 1. OutputKey: Each agent stores specific data in shared state
 * 2. Common State: All agents can access data from previous agents
 * 3. Instruction Injection: Agents use data from state in their instructions
 */

async function main() {
	// Agent 1: Extract customer preferences and dietary restrictions
	const customerAnalyzer = new LlmAgent({
		name: "customer_analyzer",
		description:
			"Analyzes customer order request for preferences and restrictions",
		instruction: dedent`
			You are a customer service agent that analyzes customer food orders.
			Extract the following information from the customer's request:
			- Items they want to order
			- Any dietary restrictions (allergic, vegetarian, vegan, gluten-free, etc.)
			- Any special preferences (spicy level, cooking style, etc.)
			- Budget constraints if mentioned

			Return only the extracted information in a clear, structured format.
		`,
		outputKey: "customer_preferences", // This data will be available to subsequent agents
		model: "gemini-2.5-flash",
	});

	// Agent 2: Check menu availability and suggest alternatives
	const menuValidator = new LlmAgent({
		name: "menu_validator",
		description: "Validates items against menu and suggests alternatives",
		instruction: dedent`
			You are a restaurant menu specialist. Based on the customer preferences: {customer_preferences}

			Our restaurant menu includes:
			- Burgers (beef, chicken, veggie, black bean)
			- Pizzas (margherita, pepperoni, veggie supreme, vegan cheese)
			- Salads (caesar, greek, quinoa power bowl)
			- Pasta (spaghetti, penne, gluten-free options available)
			- Desserts (cheesecake, chocolate cake, fruit sorbet)

			Check if the requested items are available. If not available or if dietary restrictions conflict,
			suggest suitable alternatives from our menu. Consider their budget if mentioned.
		`,
		outputKey: "menu_validation", // Stores validation results and suggestions
		model: "gemini-2.5-flash",
	});

	// Agent 3: Calculate pricing and create final order
	const orderProcessor = new LlmAgent({
		name: "order_processor",
		description: "Processes final order with pricing and preparation time",
		instruction: dedent`
			You are the order processing agent. Using the information:
			- Customer Preferences: {customer_preferences}
			- Menu Validation: {menu_validation}

			Create a final order summary with:
			1. Final items to be prepared (considering alternatives if needed)
			2. Total estimated price (use realistic restaurant prices)
			3. Estimated preparation time
			4. Any special preparation notes based on dietary restrictions
			5. A friendly confirmation message for the customer

			Make sure the order respects all dietary restrictions identified earlier.
		`,
		outputKey: "final_order", // Final processed order
		model: "gemini-2.5-flash",
	});

	// Agent 4: Generate kitchen instructions
	const kitchenInstructor = new LlmAgent({
		name: "kitchen_instructor",
		description: "Creates detailed kitchen preparation instructions",
		instruction: dedent`
			You are the head chef. Based on all the order information:
			- Customer Preferences: {customer_preferences}
			- Menu Validation: {menu_validation}
			- Final Order: {final_order}

			Create detailed kitchen instructions including:
			1. Preparation sequence (what to start first)
			2. Special handling for dietary restrictions
			3. Plating and presentation notes
			4. Quality check points
			5. Estimated cooking times for each item

			Focus on food safety and ensuring dietary restrictions are properly handled.
		`,
		// No outputKey - this is the final agent, returns the kitchen instructions
		model: "gemini-2.5-flash",
	});

	console.log("🍽️  Processing Restaurant Order...\n");

	const { runner } = await AgentBuilder.create("restaurant_order_system")
		.asSequential([
			customerAnalyzer,
			menuValidator,
			orderProcessor,
			kitchenInstructor,
		])
		.withModel("gemini-2.5-flash")
		.build();

	const response = await runner.ask(dedent`
		Hi! I'd like to order something for lunch. I'm vegetarian and allergic to nuts.
		I'm craving something Italian, maybe pasta or pizza? I prefer mild flavors,
		not too spicy. My budget is around $15-20.

		Also, I'm dining with a friend who loves meat dishes and spicy food,
		so we need something for them too.
	`);

	return response;
}

main().then(console.log).catch(console.error);
