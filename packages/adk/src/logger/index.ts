import chalk from "chalk";

interface LoggerOpts {
	name: string;
}
export class Logger {
	name: string;
	isDebugEnabled = isDebugEnabled();

	constructor({ name }: LoggerOpts) {
		this.name = name;
	}

	debug(message: string, ...args: any[]) {
		if (this.isDebugEnabled) {
			const time = new Date().toLocaleTimeString();
			console.log(
				chalk.blue(`[${time}] 🐛 [${this.name}] ${message}`),
				...args,
			);
		}
	}

	info(message: string, ...args: any[]) {
		const time = new Date().toLocaleTimeString();
		console.debug(chalk.cyan(`[${time}] ℹ️ [${this.name}] ${message}`), ...args);
	}

	warn(message: string, ...args: any[]) {
		const time = new Date().toLocaleTimeString();
		console.warn(
			chalk.yellow(`[${time}] 🚧 [${this.name}] ${message}`),
			...args,
		);
	}

	/**
	 * Structured warning with code, suggestion, context.
	 * Options via env:
	 *  ADK_WARN_FORMAT=pretty|json|text (default pretty when structured)
	 *  ADK_AGENT_BUILDER_WARN=verbose to include context always
	 */
	warnStructured(
		warning: {
			code: string;
			message: string;
			suggestion?: string;
			context?: Record<string, any>;
			severity?: "warn" | "info" | "error";
			timestamp?: string;
		},
		opts: { format?: "pretty" | "json" | "text"; verbose?: boolean } = {},
	): void {
		const format = (
			opts.format ||
			process.env.ADK_WARN_FORMAT ||
			"pretty"
		).toLowerCase() as "pretty" | "json" | "text";
		const verbose =
			opts.verbose || process.env.ADK_AGENT_BUILDER_WARN === "verbose";
		const timestamp = warning.timestamp || new Date().toISOString();
		const sev = warning.severity || "warn";

		if (format === "json") {
			this.warn(
				JSON.stringify({
					level: sev,
					source: this.name,
					timestamp,
					...warning,
				}),
			);
			return;
		}

		const icon = sev === "error" ? "⛔" : sev === "info" ? "ℹ️" : "⚠️";
		const base = `${icon} ${warning.code} ${warning.message}`;
		const suggestion = warning.suggestion
			? `\n   • Suggestion: ${warning.suggestion}`
			: "";
		let contextBlock = "";
		if (verbose && warning.context && Object.keys(warning.context).length) {
			const pairs = Object.entries(warning.context)
				.map(
					([k, v]) =>
						`${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
				)
				.join("  ");
			contextBlock = `\n   • Context: ${pairs}`;
		}
		if (format === "pretty") {
			this.warn(base + suggestion + contextBlock);
		} else {
			// text
			this.warn(
				`[${warning.code}] ${warning.message}${warning.suggestion ? `\n  -> ${warning.suggestion}` : ""}${contextBlock}`,
			);
		}
	}

	error(message: string, ...args: any[]) {
		const time = new Date().toLocaleTimeString();
		console.error(chalk.red(`[${time}] ❌ [${this.name}] ${message}`), ...args);
	}

	/**
	 * Logs structured data in a visually appealing table format.
	 * Uses vertical layout for better readability and respects debug settings.
	 */
	debugStructured(title: string, data: Record<string, any>): void {
		if (!this.isDebugEnabled) return;

		// Use terminal width or fallback to 60 if not available
		const terminalWidth = process.stdout.columns || 60;
		const width = Math.min(terminalWidth, 100); // Cap at 100 to avoid overly wide tables
		const contentWidth = width - 4; // Account for "│ " and " │"
		const topBorder = `┌${"─".repeat(width - 2)}┐`;
		const bottomBorder = `└${"─".repeat(width - 2)}┘`;
		const middleBorder = `├${"─".repeat(width - 2)}┤`;

		console.log(chalk.blue(topBorder));
		console.log(chalk.blue(`│ ${title.padEnd(contentWidth)} │`));
		console.log(chalk.blue(middleBorder));

		// Log each field in a clean vertical format
		Object.entries(data).forEach(([key, value]) => {
			const formattedKey = key.padEnd(20); // Consistent width for alignment
			const formattedValue = String(value);
			const availableValueSpace = contentWidth - 20 - 2; // -20 for key, -2 for ": "

			const truncatedValue =
				formattedValue.length > availableValueSpace
					? `${formattedValue.substring(0, availableValueSpace - 3)}...`
					: formattedValue;

			// Build the content line and ensure it's exactly contentWidth
			const content = `${formattedKey}: ${truncatedValue}`;
			const paddedContent = content.padEnd(contentWidth);

			console.log(chalk.blue(`│ ${paddedContent} │`));
		});

		console.log(chalk.blue(bottomBorder));
	}

	/**
	 * Logs array data in a compact, readable format.
	 */
	debugArray(title: string, items: Array<Record<string, any>>): void {
		if (!this.isDebugEnabled) return;

		// Use terminal width or fallback to 78 if not available
		const terminalWidth = process.stdout.columns || 78;
		const width = Math.min(terminalWidth, 120); // Cap at 120 to avoid overly wide tables
		const contentWidth = width - 4; // Account for "│ " and " │"
		const topBorder = `┌${"─".repeat(width - 2)}┐`;
		const bottomBorder = `└${"─".repeat(width - 2)}┘`;
		const middleBorder = `├${"─".repeat(width - 2)}┤`;

		console.log(chalk.blue(topBorder));
		console.log(chalk.blue(`│ ${title.padEnd(contentWidth)} │`));
		console.log(chalk.blue(middleBorder));

		items.forEach((item, index) => {
			const itemStr = Object.entries(item)
				.map(([k, v]) => `${k}: ${v}`)
				.join(" • ");

			const indexPart = `[${index + 1}] `;
			const availableSpace = contentWidth - indexPart.length;

			const truncatedItem =
				itemStr.length > availableSpace
					? `${itemStr.substring(0, availableSpace - 3)}...`
					: itemStr;

			// Build the content line and ensure it's exactly contentWidth
			const content = `${indexPart}${truncatedItem}`;
			const paddedContent = content.padEnd(contentWidth);

			console.log(chalk.blue(`│ ${paddedContent} │`));
		});

		console.log(chalk.blue(bottomBorder));
	}
}
export function isDebugEnabled(): boolean {
	return (
		process.env.NODE_ENV === "development" || process.env.ADK_DEBUG === "true"
	);
}
