import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { LlmAgent } from "@iqai/adk";

export class AgentLoader {
	constructor(private quiet = false) {}

	/**
	 * Import a TypeScript file by compiling it on-demand
	 */
	async importTypeScriptFile(filePath: string): Promise<any> {
		// Determine project root (for tsconfig and resolving deps)
		const startDir = dirname(filePath);
		let projectRoot = startDir;
		while (projectRoot !== "/" && projectRoot !== dirname(projectRoot)) {
			if (
				existsSync(join(projectRoot, "package.json")) ||
				existsSync(join(projectRoot, ".env"))
			) {
				break;
			}
			projectRoot = dirname(projectRoot);
		}
		// If we reached root without finding markers, use the original start directory
		if (projectRoot === "/") {
			projectRoot = startDir;
		}

		// Transpile with esbuild and import (bundles local files, preserves tools)
		try {
			const { build } = await import("esbuild");
			const cacheDir = join(projectRoot, ".adk-cache");
			if (!existsSync(cacheDir)) {
				mkdirSync(cacheDir, { recursive: true });
			}
			const outFile = join(cacheDir, `agent-${Date.now()}.mjs`);
			// Externalize bare module imports (node_modules), bundle relative/local files
			const plugin = {
				name: "externalize-bare-imports",
				setup(build: any) {
					build.onResolve({ filter: /.*/ }, (args: any) => {
						if (
							args.path.startsWith(".") ||
							args.path.startsWith("/") ||
							args.path.startsWith("..")
						) {
							return; // use default resolve (to get bundled)
						}
						return { path: args.path, external: true };
					});
				},
			};

			const tsconfigPath = join(projectRoot, "tsconfig.json");
			await build({
				entryPoints: [filePath],
				outfile: outFile,
				bundle: true,
				format: "esm",
				platform: "node",
				target: ["node22"],
				sourcemap: false,
				logLevel: "silent",
				plugins: [plugin],
				absWorkingDir: projectRoot,
				// Use tsconfig if present for path aliases
				...(existsSync(tsconfigPath) ? { tsconfig: tsconfigPath } : {}),
			});

			const mod = await import(
				`${pathToFileURL(outFile).href}?t=${Date.now()}`
			);
			let agentExport = (mod as any)?.agent;
			if (!agentExport && (mod as any)?.default) {
				agentExport = (mod as any).default.agent ?? (mod as any).default;
			}
			try {
				unlinkSync(outFile);
			} catch {}
			if (agentExport) {
				const isPrimitive = (v: any) =>
					v == null || ["string", "number", "boolean"].includes(typeof v);
				if (isPrimitive(agentExport)) {
					// Primitive named 'agent' export (e.g., a string) isn't a real agent; fall through to full-module scan
					if (!this.quiet) {
						console.log(
							`ℹ️ Ignoring primitive 'agent' export in ${filePath}; scanning module for factory...`,
						);
					}
				} else {
					if (!this.quiet) {
						console.log(`✅ TS agent imported via esbuild: ${filePath}`);
					}
					return { agent: agentExport };
				}
			}
			// Fallback: return full module so downstream resolver can inspect named exports (e.g., getFooAgent)
			return mod;
		} catch (e) {
			throw new Error(
				`Failed to import TS agent via esbuild: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}

	loadEnvironmentVariables(agentFilePath: string): void {
		// Load environment variables from the project directory before importing
		let projectRoot = dirname(agentFilePath);
		while (projectRoot !== "/" && projectRoot !== dirname(projectRoot)) {
			if (
				existsSync(join(projectRoot, "package.json")) ||
				existsSync(join(projectRoot, ".env"))
			) {
				break;
			}
			projectRoot = dirname(projectRoot);
		}

		// Check for multiple env files in priority order
		const envFiles = [
			".env.local",
			".env.development.local",
			".env.production.local",
			".env.development",
			".env.production",
			".env",
		];

		for (const envFile of envFiles) {
			const envPath = join(projectRoot, envFile);
			if (existsSync(envPath)) {
				try {
					const envContent = readFileSync(envPath, "utf8");
					const envLines = envContent.split("\n");
					for (const line of envLines) {
						const trimmedLine = line.trim();
						if (trimmedLine && !trimmedLine.startsWith("#")) {
							const [key, ...valueParts] = trimmedLine.split("=");
							if (key && valueParts.length > 0) {
								const value = valueParts.join("=").replace(/^"(.*)"$/, "$1");
								// Set environment variables in current process (only if not already set)
								if (!process.env[key.trim()]) {
									process.env[key.trim()] = value.trim();
								}
							}
						}
					}
				} catch (error) {
					console.warn(
						`⚠️ Warning: Could not load ${envFile} file: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}
		}
	}

	// Minimal resolution logic for agent exports: supports
	// 1) export const agent = new LlmAgent(...)
	// 2) export function agent() { return new LlmAgent(...) }
	// 3) export async function agent() { return new LlmAgent(...) }
	// 4) default export (object or function) returning or containing .agent
	async resolveAgentExport(mod: any): Promise<{ agent: LlmAgent }> {
		let candidate = mod?.agent ?? mod?.default?.agent ?? mod?.default ?? mod;

		const isLikelyAgentInstance = (obj: any) =>
			obj && typeof obj === "object" && typeof obj.name === "string";
		const isPrimitive = (v: any) =>
			v == null || ["string", "number", "boolean"].includes(typeof v);

		const invokeMaybe = async (fn: any) => {
			let out = fn();
			if (out && typeof out === "object" && "then" in out) {
				out = await out;
			}
			return out;
		};

		// If initial candidate is invalid primitive (e.g., exported const agent = "foo"), or
		// the entire module namespace (no direct agent), then probe named exports.
		if (
			(!isLikelyAgentInstance(candidate) && isPrimitive(candidate)) ||
			(!isLikelyAgentInstance(candidate) && candidate && candidate === mod)
		) {
			candidate = mod; // ensure we iterate full namespace
			for (const [key, value] of Object.entries(mod)) {
				if (key === "default") continue;
				// Prefer keys containing 'agent'
				const keyLower = key.toLowerCase();
				if (isPrimitive(value)) continue; // skip obvious non-candidates
				if (isLikelyAgentInstance(value)) {
					candidate = value;
					break;
				}
				// Handle static container object: export const container = { agent: <LlmAgent> }
				if (
					value &&
					typeof value === "object" &&
					(value as any).agent &&
					isLikelyAgentInstance((value as any).agent)
				) {
					candidate = (value as any).agent;
					break;
				}
				if (
					typeof value === "function" &&
					(/(agent|build|create)/i.test(keyLower) ||
						(value.name &&
							/(agent|build|create)/i.test(value.name.toLowerCase())))
				) {
					try {
						const maybe = await invokeMaybe(value);
						if (isLikelyAgentInstance(maybe)) {
							candidate = maybe;
							break;
						}
						if (
							maybe &&
							typeof maybe === "object" &&
							maybe.agent &&
							isLikelyAgentInstance(maybe.agent)
						) {
							candidate = maybe.agent;
							break;
						}
					} catch (e) {
						// Swallow and continue trying other exports
					}
				}
			}
		}

		// If candidate is a function (sync or async), invoke it
		if (typeof candidate === "function") {
			try {
				candidate = await invokeMaybe(candidate);
			} catch (e) {
				throw new Error(
					`Failed executing exported agent function: ${e instanceof Error ? e.message : String(e)}`,
				);
			}
		}
		// Handle built structure { agent, runner, session }
		if (
			candidate &&
			typeof candidate === "object" &&
			candidate.agent &&
			isLikelyAgentInstance(candidate.agent)
		) {
			candidate = candidate.agent;
		}
		// Unwrap { agent: ... } pattern if present
		if (candidate?.agent && isLikelyAgentInstance(candidate.agent)) {
			candidate = candidate.agent;
		}
		if (!candidate || !isLikelyAgentInstance(candidate)) {
			throw new Error(
				"No agent export resolved (expected variable, function, or function returning an agent)",
			);
		}
		return { agent: candidate as LlmAgent };
	}
}
