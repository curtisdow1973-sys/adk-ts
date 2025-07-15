import { existsSync } from "node:fs";
import { join } from "node:path";
import { confirm, intro, outro, select, spinner, text } from "@clack/prompts";
import chalk from "chalk";
import dedent from "dedent";
import { downloadTemplate } from "giget";
import { starters } from "./starters";

async function main() {
	console.clear();

	// Cool ASCII art intro
	console.log(
		chalk.magentaBright(dedent`
    ╔══════════════════════════════════════════════════════╗
    ║                                                      ║
    ║     █████╗ ██████╗ ██╗  ██╗    ████████╗███████╗     ║
    ║    ██╔══██╗██╔══██╗██║ ██╔╝    ╚══██╔══╝██╔════╝     ║
    ║    ███████║██║  ██║█████╔╝        ██║   ███████╗     ║
    ║    ██╔══██║██║  ██║██╔═██╗        ██║   ╚════██║     ║
    ║    ██║  ██║██████╔╝██║  ██╗       ██║   ███████║     ║
    ║    ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝       ╚═╝   ╚══════╝     ║
    ║                                                      ║
    ╚══════════════════════════════════════════════════════╝
  `),
	);

	intro(chalk.bgMagenta.bold(" ✨ Let's build something amazing! "));

	const projectName = await text({
		message: "What is your project name?",
		placeholder: "my-adk-project",
		validate: (value) => {
			if (!value) return "Project name is required";
			if (value.includes(" ")) return "Project name cannot contain spaces";
			if (existsSync(value)) return `Directory "${value}" already exists`;
			return undefined;
		},
	});

	if (typeof projectName === "symbol") {
		outro("Operation cancelled");
		process.exit(0);
	}

	const framework = await select({
		message: "Which framework would you like to use?",
		options: starters,
	});

	if (typeof framework === "symbol") {
		outro("Operation cancelled");
		process.exit(0);
	}

	const selectedStarter = starters.find(s => s.value === framework);
	if (!selectedStarter) {
		outro("Invalid starter selected");
		process.exit(1);
	}

	const installDeps = await confirm({
		message: "Install dependencies?",
		initialValue: true,
	});

	if (typeof installDeps === "symbol") {
		outro("Operation cancelled");
		process.exit(0);
	}

	const s = spinner();

	try {
		s.start("Creating project...");

		const templatePath = selectedStarter.template;
		const targetDir = join(process.cwd(), projectName);

		await downloadTemplate(templatePath, {
			dir: targetDir,
			offline: false,
			preferOffline: false,
		});

		s.stop("Project created successfully!");

		if (installDeps) {
			s.start("Installing dependencies...");

			const { spawn } = await import("node:child_process");

			await new Promise<void>((resolve, reject) => {
				const child = spawn("npm", ["install"], {
					cwd: targetDir,
					stdio: "pipe",
				});

				child.on("close", (code) => {
					if (code === 0) {
						resolve();
					} else {
						reject(new Error(`npm install failed with code ${code}`));
					}
				});

				child.on("error", reject);
			});

			s.stop("Dependencies installed!");
		}

		const envFile = ".env";

		console.log(
			chalk.green(`
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║  ${chalk.bold.yellow("🎉 SUCCESS!")} Your ADK project has been created!           ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
    `),
		);

		outro(
			chalk.cyan(
				dedent`
          ${chalk.bold("🚀 Next steps:")}

            ${chalk.yellow("1.")} ${chalk.bold(`cd ${projectName}`)}
            ${installDeps ? "" : `${chalk.yellow("2.")} ${chalk.bold("npm install")}`}
            ${chalk.yellow(installDeps ? "2." : "3.")} ${chalk.bold(`cp .env.example ${envFile}`)}
            ${chalk.yellow(installDeps ? "3." : "4.")} ${chalk.gray(`# Add your API keys to the ${envFile} file`)}
            ${chalk.yellow(installDeps ? "4." : "5.")} ${chalk.bold("npm run dev")}

          ${chalk.bold.green("🤖 Your AI agent is ready to go!")}
          ${chalk.gray("Documentation: https://docs.iqai.com")}
        `,
			),
		);
	} catch (error) {
		s.stop("Failed to create project");
		console.error(chalk.red("Error:"), error);
		process.exit(1);
	}
}

main().catch(console.error);
