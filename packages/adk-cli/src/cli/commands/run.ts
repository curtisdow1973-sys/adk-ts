import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, extname, basename } from "node:path";
import { spawn } from "node:child_process";
import chalk from "chalk";
import chokidar from "chokidar";

interface AgentFile {
	path: string;
	name: string;
	directory: string;
}

function findAgentFiles(directory: string): AgentFile[] {
	const agents: AgentFile[] = [];
	
	if (!existsSync(directory)) {
		return agents;
	}

	function scanDirectory(dir: string, baseDir: string = directory) {
		try {
			const entries = readdirSync(dir);
			
			for (const entry of entries) {
				const fullPath = join(dir, entry);
				const stat = statSync(fullPath);
				
				if (stat.isDirectory()) {
					// Recursively scan subdirectories
					scanDirectory(fullPath, baseDir);
				} else if (stat.isFile()) {
					// Check if it's an agent file (agent.ts or agent.js)
					const name = basename(entry, extname(entry));
					if (name === 'agent' && (extname(entry) === '.ts' || extname(entry) === '.js')) {
						const relativePath = dir.replace(baseDir, '').replace(/^\//, '');
						agents.push({
							path: fullPath,
							name: relativePath ? `${relativePath}/agent` : 'agent',
							directory: dir,
						});
					}
				}
			}
		} catch (error) {
			// Ignore errors for directories we can't access
		}
	}
	
	scanDirectory(directory);
	return agents;
}

function findBestAgentFile(agentPath?: string): string | null {
	if (agentPath) {
		// Use provided path
		const resolvedPath = resolve(agentPath);
		if (existsSync(resolvedPath)) {
			return resolvedPath;
		}
		return null;
	}

	// Look for agent files in current directory and ./agents directory
	const searchPaths = [
		process.cwd(),
		join(process.cwd(), 'agents'),
	];

	for (const searchPath of searchPaths) {
		const agents = findAgentFiles(searchPath);
		if (agents.length > 0) {
			// If multiple agents found, prefer the one in the root of the search path
			const rootAgent = agents.find(agent => agent.name === 'agent');
			return rootAgent ? rootAgent.path : agents[0].path;
		}
	}

	return null;
}

async function runAgentFile(agentPath: string, options: { port?: string }): Promise<any> {
	const isTypeScript = extname(agentPath) === '.ts';
	const command = isTypeScript ? 'npx' : 'node';
	const args = isTypeScript ? ['tsx', agentPath] : [agentPath];

	// Set environment variables
	const env = {
		...process.env,
		PORT: options.port || '3000',
		NODE_ENV: 'development',
	};

	console.log(chalk.blue(`🚀 Starting agent: ${chalk.cyan(agentPath)}`));
	console.log(chalk.gray(`Command: ${command} ${args.join(' ')}`));
	
	const child = spawn(command, args, {
		cwd: process.cwd(),
		env,
		stdio: 'inherit',
	});

	child.on('error', (error) => {
		console.error(chalk.red('Failed to start agent:'), error.message);
		process.exit(1);
	});

	child.on('exit', (code) => {
		if (code !== 0) {
			console.error(chalk.red(`Agent exited with code ${code}`));
			process.exit(code || 1);
		}
	});

	// Handle Ctrl+C gracefully
	process.on('SIGINT', () => {
		console.log(chalk.yellow('\n🛑 Stopping agent...'));
		child.kill('SIGTERM');
		process.exit(0);
	});

	return child;
}

export async function runAgent(agentPath?: string, options: { watch?: boolean; port?: string } = {}) {
	const resolvedAgentPath = findBestAgentFile(agentPath);
	
	if (!resolvedAgentPath) {
		console.error(chalk.red('❌ No agent file found.'));
		console.log(chalk.yellow('Looking for:'));
		console.log(chalk.gray('  - agent.ts or agent.js in current directory'));
		console.log(chalk.gray('  - agent.ts or agent.js in ./agents directory and subdirectories'));
		console.log(chalk.gray('  - Or specify a path: adk run path/to/your/agent.ts'));
		process.exit(1);
	}

	if (!existsSync(resolvedAgentPath)) {
		console.error(chalk.red(`❌ Agent file not found: ${resolvedAgentPath}`));
		process.exit(1);
	}

	console.log(chalk.green(`✅ Found agent: ${chalk.cyan(resolvedAgentPath)}`));

	if (options.watch) {
		console.log(chalk.blue('👀 Watch mode enabled. Agent will restart on file changes...'));
		
		let childProcess: any = null;
		
		const startAgent = async () => {
			if (childProcess) {
				childProcess.kill('SIGTERM');
				childProcess = null;
			}
			
			// Small delay to ensure process is killed
			setTimeout(() => {
				childProcess = runAgentFile(resolvedAgentPath, { port: options.port });
			}, 100);
		};

		// Watch the agent file and its directory
		const watchPaths = [
			resolvedAgentPath,
			join(process.cwd(), 'agents'),
			join(process.cwd(), 'src'),
		].filter(existsSync);

		const watcher = chokidar.watch(watchPaths, {
			ignored: /node_modules|\.git|dist|build/,
			persistent: true,
		});

		watcher.on('change', (path) => {
			console.log(chalk.yellow(`📝 File changed: ${path}`));
			console.log(chalk.blue('🔄 Restarting agent...'));
			startAgent();
		});

		watcher.on('error', (error) => {
			console.error(chalk.red('Watcher error:'), error);
		});

		// Start the agent initially
		await startAgent();
		
		// Handle Ctrl+C gracefully
		process.on('SIGINT', () => {
			console.log(chalk.yellow('\n🛑 Stopping watch mode...'));
			watcher.close();
			if (childProcess) {
				childProcess.kill('SIGTERM');
			}
			process.exit(0);
		});
	} else {
		await runAgentFile(resolvedAgentPath, { port: options.port });
	}
}
