// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { exec } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";
import { GitPulsePanel } from "./GitPulsePanel";

const execAsync = promisify(exec);

async function isGitRepository(): Promise<boolean> {
	const workspace = vscode.workspace.workspaceFolders?.[0];
	if (!workspace) {
		return false;
	}

	try {
		// Try to execute a simple git command
		await execAsync("git rev-parse --is-inside-work-tree", {
			cwd: workspace.uri.fsPath,
		});
		return true;
	} catch (error) {
		return false;
	}
}

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		"gitpulse.showDashboard",
		async () => {
			if (!(await isGitRepository())) {
				vscode.window.showErrorMessage(
					"GitPulse: Please open a Git repository to use this extension."
				);
				return;
			}
			GitPulsePanel.createOrShow(context.extensionUri, execAsync);
		}
	);
	context.subscriptions.push(disposable);
}
