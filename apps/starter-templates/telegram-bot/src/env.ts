import { config } from "dotenv";
import { z } from "zod";

config();

/**
 * Environment variable schema definition for the Telegram bot.
 *
 * Defines and validates required environment variables including:
 * - DEBUG: Optional debug mode flag (defaults to "false")
 * - GOOGLE_API_KEY: Required API key for Google/Gemini model access
 * - TELEGRAM_BOT_TOKEN: Required Telegram bot token for API authentication
 */
export const envSchema = z.object({
	DEBUG: z.string().default("false"),
	GOOGLE_API_KEY: z.string(),
	TELEGRAM_BOT_TOKEN: z.string(),
});

/**
 * Validated environment variables parsed from process.env.
 * Throws an error if required environment variables are missing or invalid.
 */
export const env = envSchema.parse(process.env);
