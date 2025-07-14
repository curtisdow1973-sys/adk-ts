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

	private colorize(message: string): string {
		// Framework logs are colored blue, user logs are default
		return chalk.blue(message);
	}

	debug(message: string, ...args: any[]) {
		if (this.isDebugEnabled) {
			const time = new Date().toLocaleTimeString();
			console.log(
				this.colorize(`[${time}] 🐛 [${this.name}] ${message}`),
				...args,
			);
		}
	}

	info(message: string, ...args: any[]) {
		const time = new Date().toLocaleTimeString();
		console.info(
			this.colorize(`[${time}] ℹ️ [${this.name}] ${message}`),
			...args,
		);
	}

	warn(message: string, ...args: any[]) {
		const time = new Date().toLocaleTimeString();
		console.warn(
			this.colorize(`[${time}] 🚧 [${this.name}] ${message}`),
			...args,
		);
	}

	error(message: string, ...args: any[]) {
		const time = new Date().toLocaleTimeString();
		console.error(
			this.colorize(`[${time}] ❌ [${this.name}] ${message}`),
			...args,
		);
	}
}
export function isDebugEnabled(): boolean {
	return (
		process.env.NODE_ENV === "development" || process.env.ADK_DEBUG === "true"
	);
}
