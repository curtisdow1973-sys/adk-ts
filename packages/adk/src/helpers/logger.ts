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
			console.log(`[${time}] 🐛 [${this.name}] ${message}`, ...args);
		}
	}

	info(message: string, ...args: any[]) {
		const time = new Date().toLocaleTimeString();
		console.info(`[${time}] ℹ️ [${this.name}] ${message}`, ...args);
	}

	warn(message: string, ...args: any[]) {
		const time = new Date().toLocaleTimeString();
		console.warn(`[${time}] 🚧 [${this.name}] ${message}`, ...args);
	}

	error(message: string, ...args: any[]) {
		const time = new Date().toLocaleTimeString();
		console.error(`[${time}] ❌ [${this.name}] ${message}`, ...args);
	}

	group(label: string) {
		if (this.isDebugEnabled) {
			const time = new Date().toLocaleTimeString();
			console.group(`[${time}] 📁 [${this.name}] ${label}`);
		}
	}

	groupEnd() {
		if (this.isDebugEnabled) {
			console.groupEnd();
		}
	}
}
export function isDebugEnabled(): boolean {
	return process.env.NODE_ENV === "development" || process.env.DEBUG === "true";
}
