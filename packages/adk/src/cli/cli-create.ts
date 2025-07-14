import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { promisify } from "node:util";
import { VERSION } from "../index";

const AGENT_TS_TEMPLATE = `import { env } from "node:process";
import { FunctionTool, LlmAgent } from "@iqai/adk";

// --- Tool Functions ---

/**
 * Gets the current weather for a specified city
 * @param city The city to get weather for
 * @returns Weather information for the city
 */
async function getWeather(city: string): Promise<Record<string, any>> {
  console.log(\`Getting weather for: \${city}\`);
  
  // Mock weather data - replace with real API call
  const weatherData: Record<string, any> = {
    newyork: { temperature: "25°C", condition: "sunny", humidity: "60%" },
    london: { temperature: "15°C", condition: "cloudy", humidity: "75%" },
    tokyo: { temperature: "18°C", condition: "light rain", humidity: "80%" }
  };
  
  const normalizedCity = city.toLowerCase().replace(/\s+/g, "");
  return weatherData[normalizedCity] || { 
    error: \`Weather data not available for \${city}\` 
  };
}

/**
 * Gets the current local time and timezone
 * @returns Current time information
 */
function getCurrentTime(): Record<string, any> {
  console.log("Getting current time");
  const now = new Date();
  return {
    currentTime: now.toLocaleTimeString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    date: now.toLocaleDateString()
  };
}

// --- Create Function Tools ---

function createTools() {
  const weatherTool = new FunctionTool(getWeather, {
    name: "get_weather",
    description: "Gets current weather information for a city",
  });

  const timeTool = new FunctionTool(getCurrentTime, {
    name: "get_current_time",
    description: "Gets the current local time and timezone",
  });

  return [weatherTool, timeTool];
}

// --- Agent Definition ---

export const rootAgent = new LlmAgent({
  name: "{agent_name}",
  model: env.LLM_MODEL || "{model_name}",
  description: "A helpful assistant that can provide weather and time information",
  instruction: 
    "You are a helpful assistant that can check the weather and get the current time. " +
    "Use the get_weather tool for weather queries and the get_current_time tool for time queries. " +
    "Provide clear and informative responses based on the tool results.",
  tools: createTools(),
});
`;

const PACKAGE_JSON_TEMPLATE = `{
  "name": "adk-project",
  "version": "1.0.0",
  "description": "Project with agents created with ADK TypeScript",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "@iqai/adk": "^${VERSION}",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "ts-node": "^10.9.1",
    "typescript": "^5.1.6",
    "@types/node": "^20.0.0"
  }
}
`;

const TSCONFIG_JSON_TEMPLATE = `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "Node16",
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node16",
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
`;

const GOOGLE_API_MSG = `\nDon't have API Key? Create one in AI Studio: https://aistudio.google.com/apikey\n`;
const GOOGLE_CLOUD_SETUP_MSG =
	"\nYou need an existing Google Cloud account and project, check out this link for details:\nhttps://google.github.io/adk-docs/get-started/quickstart/#gemini---google-cloud-vertex-ai\n";
const OTHER_MODEL_MSG =
	"\nPlease see below guide to configure other models:\nhttps://google.github.io/adk-docs/agents/models\n";
const SUCCESS_MSG = `\nAgent project created successfully!

Project structure:
├── .env                    # Environment variables
├── package.json            # Shared dependencies  
├── tsconfig.json          # TypeScript configuration
├── {agent_name}/          # Your agent folder
│   └── agent.ts           # Agent definition

Next steps:
1. npm install              # Install dependencies
2. npm run build            # Build the project
3. npx adk run {agent_name}  # Run your agent in terminal
4. npx adk web {agent_name}  # OR try the dev UI in browser

To add more agents: create new folders with agent.ts files!
`;

function askQuestion(
	rl: readline.Interface,
	question: string,
	defaultValue?: string,
): Promise<string> {
	return new Promise((resolve) => {
		rl.question(
			defaultValue ? `${question} (${defaultValue}): ` : `${question}: `,
			(answer) => {
				resolve(answer?.trim() ? answer.trim() : defaultValue || "");
			},
		);
	});
}

async function promptStr(
	rl: readline.Interface,
	promptPrefix: string,
	priorMsg?: string,
	defaultValue?: string,
): Promise<string> {
	if (priorMsg) {
		console.log(priorMsg);
	}

	// No need for a loop here as we will resolve only when we have a valid value
	const value = await askQuestion(rl, promptPrefix, defaultValue);
	return value?.trim() ? value.trim() : defaultValue || "";
}

async function promptForGoogleCloud(
	rl: readline.Interface,
	googleCloudProject?: string,
): Promise<string> {
	googleCloudProject =
		googleCloudProject || process.env.GOOGLE_CLOUD_PROJECT || "";
	return promptStr(
		rl,
		"Enter Google Cloud project ID",
		undefined,
		googleCloudProject,
	);
}

async function promptForGoogleCloudRegion(
	rl: readline.Interface,
	googleCloudRegion?: string,
): Promise<string> {
	googleCloudRegion =
		googleCloudRegion || process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
	return promptStr(
		rl,
		"Enter Google Cloud region",
		undefined,
		googleCloudRegion,
	);
}

async function promptForGoogleApiKey(
	rl: readline.Interface,
	googleApiKey?: string,
): Promise<string> {
	googleApiKey = googleApiKey || process.env.GOOGLE_API_KEY || "";
	return promptStr(rl, "Enter Google API key", GOOGLE_API_MSG, googleApiKey);
}

async function promptForModel(rl: readline.Interface): Promise<string> {
	// Ask once and handle response
	const modelChoice = await askQuestion(
		rl,
		"Choose a model for the root agent:\n1. gemini-2.0-flash (recommended)\n2. gemini-2.5-pro\n3. Other models (fill later)\nChoose model",
		"1",
	);

	if (modelChoice === "1") {
		return "gemini-2.0-flash";
	}
	if (modelChoice === "2") {
		return "gemini-2.5-pro";
	}
	if (modelChoice === "3") {
		console.log(OTHER_MODEL_MSG);
		return "<FILL_IN_MODEL>";
	}

	// Default fallback
	return "gemini-2.0-flash";
}

async function promptToChooseBackend(
	rl: readline.Interface,
	googleApiKey?: string,
	googleCloudProject?: string,
	googleCloudRegion?: string,
): Promise<{
	googleApiKey?: string;
	googleCloudProject?: string;
	googleCloudRegion?: string;
}> {
	// Ask once and handle response
	const backendChoice = await askQuestion(
		rl,
		"1. Google AI\n2. Vertex AI\nChoose a backend",
		"1",
	);

	if (backendChoice === "1") {
		googleApiKey = await promptForGoogleApiKey(rl, googleApiKey);
		return { googleApiKey };
	}
	if (backendChoice === "2") {
		console.log(GOOGLE_CLOUD_SETUP_MSG);
		googleCloudProject = await promptForGoogleCloud(rl, googleCloudProject);
		googleCloudRegion = await promptForGoogleCloudRegion(rl, googleCloudRegion);
		return { googleCloudProject, googleCloudRegion };
	}

	// Default fallback to Google AI
	googleApiKey = await promptForGoogleApiKey(rl, googleApiKey);
	return { googleApiKey };
}

/**
 * Sanitizes an agent name to use only alphanumeric characters and underscores
 * @param name The original agent name
 * @returns Sanitized name with non-alphanumeric characters replaced with underscores
 */
function sanitizeAgentName(name: string): string {
	// Replace any non-alphanumeric character (except underscores) with underscores
	return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

async function generateFiles(
	agentName: string,
	opts: {
		googleApiKey?: string;
		googleCloudProject?: string;
		googleCloudRegion?: string;
		model?: string;
	},
) {
	const currentDir = process.cwd();
	const agentFolder = path.join(currentDir, agentName);

	const rootPackageJsonPath = path.join(currentDir, "package.json");
	const rootTsconfigJsonPath = path.join(currentDir, "tsconfig.json");

	const hasPackageJson = fs.existsSync(rootPackageJsonPath);
	const hasTsconfigJson = fs.existsSync(rootTsconfigJsonPath);

	// --- Create Agent-Specific Files ---
	await fs.promises.mkdir(agentFolder, { recursive: true });

	const agentFilePath = path.join(agentFolder, "agent.ts");
	const agentCode = AGENT_TS_TEMPLATE.replace(
		/{model_name}/g,
		opts.model || "gemini-2.0-flash",
	).replace(/{agent_name}/g, agentName);
	await fs.promises.writeFile(agentFilePath, agentCode, "utf-8");

	// Create agent-specific .env file
	const dotenvFilePath = path.join(agentFolder, ".env");
	const envLines: string[] = [];
	if (opts.googleApiKey) {
		envLines.push("GOOGLE_GENAI_USE_VERTEXAI=0");
		envLines.push(`GOOGLE_API_KEY=${opts.googleApiKey}`);
	} else if (opts.googleCloudProject && opts.googleCloudRegion) {
		envLines.push("GOOGLE_GENAI_USE_VERTEXAI=1");
		envLines.push(`GOOGLE_CLOUD_PROJECT=${opts.googleCloudProject}`);
		envLines.push(`GOOGLE_CLOUD_LOCATION=${opts.googleCloudRegion}`);
	}
	await fs.promises.writeFile(dotenvFilePath, envLines.join("\n"), "utf-8");

	// --- Create Root-Level Project Files (if they don't exist) ---
	if (!hasPackageJson) {
		await fs.promises.writeFile(
			rootPackageJsonPath,
			PACKAGE_JSON_TEMPLATE,
			"utf-8",
		);
	}

	if (hasTsconfigJson) {
		console.warn(`
[ADK] WARNING: An existing tsconfig.json was found.
The ADK requires specific compiler options to function correctly.
Please ensure your tsconfig.json includes the following settings:

  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "node16",
    "outDir": "./dist",
    ...
  },
  "include": ["**/*.ts"]`);
	} else {
		await fs.promises.writeFile(
			rootTsconfigJsonPath,
			TSCONFIG_JSON_TEMPLATE,
			"utf-8",
		);
	}

	// --- Log Success Message ---
	if (!hasPackageJson) {
		console.log(`
ADK project initialized and agent '${agentName}' created.

Project structure:
- package.json
- tsconfig.json
- ${agentName}/
  - agent.ts
  - .env

Next steps:
1. Install dependencies:
   npm install

2. Build the project:
   npm run build

3. Run your agent:
   npx adk run ${agentName}`);
	} else {
		console.log(`
New agent '${agentName}' created in existing project.

Directory created:
- ${agentName}/
  - agent.ts
  - .env

Next steps:
1. Build the project (if you made changes):
   npm run build

2. Run your new agent:
   npx adk run ${agentName}`);
	}
}

export async function runCmd({
	agentName,
	model,
	googleApiKey,
	googleCloudProject,
	googleCloudRegion,
}: {
	agentName: string;
	model?: string;
	googleApiKey?: string;
	googleCloudProject?: string;
	googleCloudRegion?: string;
}) {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	// Sanitize the agent name
	const sanitizedAgentName = sanitizeAgentName(agentName);
	if (sanitizedAgentName !== agentName) {
		console.log(
			`Agent name has been sanitized from "${agentName}" to "${sanitizedAgentName}" (only alphanumeric characters and underscores allowed)`,
		);
	}

	if (!model) {
		model = await promptForModel(rl);
	}
	const backend = await promptToChooseBackend(
		rl,
		googleApiKey,
		googleCloudProject,
		googleCloudRegion,
	);
	await generateFiles(sanitizedAgentName, {
		googleApiKey: backend.googleApiKey,
		googleCloudProject: backend.googleCloudProject,
		googleCloudRegion: backend.googleCloudRegion,
		model,
	});
	rl.close();
}
