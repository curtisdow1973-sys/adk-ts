/**
 * A reusable function to handle asking questions to an agent runner.
 * It logs the question and returns the response.
 *
 * @param runner The agent runner function that takes a string question and returns a promise
 * @param question The question to ask the agent
 * @returns The agent's response
 */
export async function ask<T>(
	runner: (question: string) => Promise<T>,
	question: string,
): Promise<T> {
	console.log(`\n👤 User:  ${question}`);
	return runner(question);
}
