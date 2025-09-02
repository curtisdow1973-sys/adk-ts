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
	 * Formats a decorative boxed block with a title, description and optional extra lines.
	 * Returns the formatted string (does not log automatically) so callers can choose level.
	 *
	 * Example:
	 * logger.warn(logger.formatBox({
	 *   title: "AgentBuilder Warning",
	 *   description: "withModel() ignored because builder is locked",
	 *   lines: ["• Suggestion: Call withAgent() last", "• Context: method=withModel"]
	 * }));
	 */
	formatBox(params: {
		title: string;
		description: string;
		lines?: string[]; // Additional bullet or info lines (already formatted)
		width?: number; // Minimum inner width; will auto-expand to content and wrap to terminal width
		maxWidthPct?: number; // Max percent of terminal width (default 0.9)
		color?: (txt: string) => string; // Colorizer (default yellow)
		pad?: number; // Horizontal padding inside box (default 1)
		borderChar?: string; // Border char (default "─")
		wrap?: boolean; // Enable soft wrapping (default true)
	}): string {
		const {
			title,
			description,
			lines = [],
			width = 60,
			maxWidthPct = 0.9,
			color = chalk.yellow,
			pad = 1,
			borderChar = "─",
			wrap = true,
		} = params;

		// Terminal width (fallback 80) and max allowed width
		const termWidth = process.stdout.columns || 80;
		const maxAllowed = Math.max(20, Math.floor(termWidth * maxWidthPct));

		// Split description & extra lines on explicit newlines to preserve author intent
		const descParts = description.split(/\r?\n/);
		const extraParts = lines.flatMap((l) => l.split(/\r?\n/));
		// Keep blank lines (do not filter) to allow vertical spacing; but trim trailing empties
		let rawContent = [...descParts, ...extraParts];
		while (rawContent.length && rawContent[rawContent.length - 1] === "") {
			rawContent = rawContent.slice(0, -1);
		}

		// Determine target inner width based on longest raw line but not exceeding maxAllowed - borders - 2 (for leading │ and space)
		const longestRaw = Math.max(
			title.length + 2,
			...rawContent.map((l) => l.length),
			width,
		);
		let innerWidth = Math.min(longestRaw + pad * 2, maxAllowed - 2); // -2 because we add the leading │ and space before inner content
		innerWidth = Math.max(innerWidth, width); // ensure at least requested width

		const wrapLine = (text: string): string[] => {
			if (!wrap) return [text];
			if (text === "") return [""]; // preserve blank line
			const available = innerWidth - pad * 2;
			if (text.length <= available) return [text];
			const words = text.split(/\s+/);
			const lines: string[] = [];
			let current = "";
			for (const w of words) {
				if (!current) {
					if (w.length > available) {
						// Hard split long word
						for (let i = 0; i < w.length; i += available) {
							const slice = w.slice(i, i + available);
							if (slice.length === available) lines.push(slice);
							else current = slice; // remainder
						}
					} else {
						current = w;
					}
					continue;
				}
				if (`${current} ${w}`.length <= available) {
					current = current ? `${current} ${w}` : w;
				} else {
					lines.push(current);
					current = w.length > available ? w.slice(0, available) : w;
					if (w.length > available) {
						let remainder = w.slice(available);
						while (remainder.length) {
							lines.push(remainder.slice(0, available));
							remainder = remainder.slice(available);
						}
						current = "";
					}
				}
			}
			if (current) lines.push(current);
			return lines;
		};

		// Wrap description + extra lines
		const wrappedContent: string[] = [];
		for (const line of rawContent) {
			wrappedContent.push(...wrapLine(line));
		}

		// Recompute inner width if wrapping created longer segments (unlikely but safe)
		for (const l of wrappedContent) {
			if (l.length + pad * 2 > innerWidth) {
				innerWidth = Math.min(l.length + pad * 2, maxAllowed - 2);
			}
		}

		// Horizontal rule spans innerWidth + 2 spaces we reserve inside vertical bars.
		const horizontal = borderChar.repeat(innerWidth + 2);
		const top = `┌${horizontal}┐`;
		const mid = `├${horizontal}┤`;
		const bottom = `└${horizontal}┘`;

		// Helper to pad a line
		const padLine = (raw: string) => {
			const available = innerWidth - pad * 2;
			const truncated =
				raw.length > available ? `${raw.slice(0, available - 1)}…` : raw; // final safeguard
			const padded = `${" ".repeat(pad)}${truncated}`;
			return `${padded}${" ".repeat(innerWidth - padded.length)}`;
		};

		let box = "\n"; // Leading newline for visual separation
		box += `${color(top)}\n`;
		box += `${color(`│ ${padLine(title)} │`)}\n`;
		box += `${color(mid)}\n`;
		for (const line of wrappedContent) {
			box += `${color(`│ ${padLine(line)} │`)}\n`;
		}
		box += color(bottom);
		return box;
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
		// Convert extra args into structured lines.
		const lines: string[] = [];
		const cwd = process.cwd();
		const maxFrames = Number(process.env.ADK_ERROR_STACK_FRAMES || 8);
		const shortenFrame = (frame: string) => {
			// Remove leading 'at ' for compactness
			let f = frame.trim().replace(/^at\s+/, "");
			// Replace absolute cwd path with '.' for brevity (handle spaces in path)
			if (f.includes(cwd)) f = f.split(cwd).join(".");
			return f;
		};
		for (const arg of args) {
			if (!arg) continue;
			if (arg instanceof Error) {
				lines.push(`• ${arg.name}: ${arg.message}`);
				if (arg.stack) {
					const frames = arg.stack
						.split(/\n/)
						.slice(1) // skip error message line
						.map((l) => l.trim())
						.filter(Boolean)
						.slice(0, maxFrames);
					if (frames.length) {
						lines.push("• Stack:");
						for (const fr of frames) {
							lines.push(`  ↳ ${shortenFrame(fr)}`);
						}
						if (arg.stack.split(/\n/).length - 1 > frames.length) {
							lines.push(
								`  ↳ … ${arg.stack.split(/\n/).length - 1 - frames.length} more frames`,
							);
						}
					}
				}
			} else if (typeof arg === "object") {
				try {
					lines.push(`• ${JSON.stringify(arg)}`);
				} catch {
					lines.push(`• ${String(arg)}`);
				}
			} else {
				lines.push(`• ${String(arg)}`);
			}
		}
		const time = new Date().toLocaleTimeString();
		const box = this.formatBox({
			title: `❌ Error @ ${time} (${this.name})`,
			description: message.endsWith(":") ? message : `${message}`,
			lines,
			color: (txt: string) => chalk.red(txt),
		});
		console.error(box);
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
