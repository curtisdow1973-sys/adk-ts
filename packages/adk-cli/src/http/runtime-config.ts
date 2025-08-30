export interface RuntimeConfig {
	host: string;
	port: number;
	agentsDir: string;
	quiet: boolean;
}

export const RUNTIME_CONFIG = "RUNTIME_CONFIG";
