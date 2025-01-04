import * as vscode from "vscode";
import { CommitData, FileTypeStats } from "./models";

export class GitPulsePanel {
	public static currentPanel: GitPulsePanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private readonly _extensionUri: vscode.Uri;
	private static execAsync: any;

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;
		this._extensionUri = extensionUri;

		this.updateContent();

		// handle panel disposal
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		const showOtherContributions = vscode.workspace
			.getConfiguration("gitpulse.dashboard")
			.get<boolean>("showOthersContributions", false);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case "getStats":
						try {
							const response: {
								command: string;
								commits: Record<string, CommitData[]>;
								fileTypeStats: Record<string, FileTypeStats[]>;
							} = {
								command: "updateStats",
								commits: {},
								fileTypeStats: {},
							};

							// commits from current user
							response.commits["currentUser"] =
								await this._getCommits(message.timeframe, true);

							response.fileTypeStats["currentUser"] =
								await this._getFileTypeStats(
									message.timeframe,
									true
								);

							if (showOtherContributions) {
								response.commits["others"] =
									await this._getCommits(message.timeframe);

								response.fileTypeStats["others"] =
									await this._getFileTypeStats(
										message.timeframe
									);
							}

							if (this._panel) {
								await this._panel.webview.postMessage(response);
							}
						} catch (error) {
							console.error("Error processing commits:", error);
							if (this._panel) {
								vscode.window.showErrorMessage(
									"GitPulse : Failed to fetch git commits. Please try again later."
								);
							}
						}
						break;
				}
			},
			null,
			this._disposables
		);
	}

	public static createOrShow(extensionUri: vscode.Uri, execAsync: any) {
		GitPulsePanel.execAsync = execAsync;

		// If we already have a panel, dispose of it first
		if (GitPulsePanel.currentPanel) {
			GitPulsePanel.currentPanel._panel.dispose();
			GitPulsePanel.currentPanel = undefined;
		}

		// Create a new panel
		const panel = vscode.window.createWebviewPanel(
			"gitPulse",
			"GitPulse Dashboard",
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(extensionUri, "src", "webview"),
				],
			}
		);

		GitPulsePanel.currentPanel = new GitPulsePanel(panel, extensionUri);
	}

	private async _getCommits(
		timeframe: "day" | "week" | "month",
		forCurrentUser: boolean = false
	): Promise<CommitData[]> {
		const workspace = vscode.workspace.workspaceFolders?.[0];
		if (!workspace) {
			return [];
		}

		try {
			// Construct git log command based on timeframe
			let since = "";
			switch (timeframe) {
				case "day":
					since = '--since="1 day ago"';
					break;
				case "week":
					since = '--since="1 week ago"';
					break;
				case "month":
					since = '--since="1 month ago"';
					break;
			}

			// Get current user's email from git config
			const { stdout: userEmail } = await GitPulsePanel.execAsync(
				"git config user.email",
				{
					cwd: workspace.uri.fsPath,
				}
			);
			let command = "";
			if (forCurrentUser) {
				command = `git log --all --format="%H|%ad|%s|%ae" --date=iso ${since} --author="${userEmail.trim()}"`;
			} else {
				command = `git log --all --format="%H|%ad|%s|%ae" --date=iso ${since} | grep -v "${userEmail.trim()}"`;
			}

			// Get commits from all branches for current user
			const { stdout } = await GitPulsePanel.execAsync(command, {
				cwd: workspace.uri.fsPath,
			});

			return stdout
				.split("\n")
				.filter((line: string) => line.trim())
				.map((line: string) => {
					const [hash, date, message, author] = line.split("|");
					return {
						hash,
						date: new Date(date),
						message,
						author,
					};
				});
		} catch (error) {
			console.error("Error getting commits:", error);
			return [];
		}
	}

	private async _getFileTypeStats(
		timeframe: "day" | "week" | "month",
		forCurrentUser: boolean = false
	): Promise<FileTypeStats[]> {
		const workspace = vscode.workspace.workspaceFolders?.[0];
		if (!workspace) {
			return [];
		}
		try {
			// Construct git log command based on timeframe
			let since = "";
			switch (timeframe) {
				case "day":
					since = '--since="1 day ago"';
					break;
				case "week":
					since = '--since="1 week ago"';
					break;
				case "month":
					since = '--since="1 month ago"';
					break;
			}

			// Get current user's email from git config
			const { stdout: userEmail } = await GitPulsePanel.execAsync(
				"git config user.email",
				{
					cwd: workspace.uri.fsPath,
				}
			);

			const authorFilter = forCurrentUser
				? `--author="${userEmail.trim()}"`
				: ` | grep -v "${userEmail.trim()}"`;

			const command = `git log --all ${since} --numstat --format="" ${authorFilter}`;

			// Get commits from all branches for current user
			const { stdout } = await GitPulsePanel.execAsync(command, {
				cwd: workspace.uri.fsPath,
			});

			// Process the output
			const extensionStats = new Map<string, number>();
			let totalLines = 0;

			stdout
				.split("\n")
				.filter((line: string) => line.trim())
				.forEach((line: string) => {
					const [additions, deletions, filepath] = line.split("\t");

					// Skip binary files or renamed files
					if (additions === "-" || deletions === "-" || !filepath) {
						return;
					}

					// Get file extension and normalize it
					const extension =
						filepath.split(".").pop()?.toLowerCase() ||
						"no-extension";
					const changes = parseInt(additions) + parseInt(deletions);

					// Update stats
					extensionStats.set(
						extension,
						(extensionStats.get(extension) || 0) + changes
					);
					totalLines += changes;
				});

			// Convert to array and sort by number of lines
			let results: FileTypeStats[] = Array.from(extensionStats.entries())
				.map(([ext, lines]) => ({
					extension: ext,
					lines: lines,
					pctChange: parseFloat(
						((lines / totalLines) * 100).toFixed(2)
					),
				}))
				.sort((a, b) => b.lines - a.lines);

			// Take top 6 extensions and aggregate the rest
			if (results.length > 6) {
				const topSix = results.slice(0, 6);
				const others = results.slice(6);

				// Calculate total lines and percentage for "other"
				const otherLines = others.reduce(
					(sum, item) => sum + item.lines,
					0
				);
				const otherPercentage = parseFloat(
					((otherLines / totalLines) * 100).toFixed(2)
				);

				// Add "other" category
				results = [
					...topSix,
					{
						extension: "other",
						lines: otherLines,
						pctChange: otherPercentage,
					},
				];
			}

			// Recalculate percentages to ensure they sum to 100
			const totalPercentage = results.reduce(
				(sum, item) => sum + item.pctChange,
				0
			);
			if (totalPercentage !== 100) {
				const adjustmentFactor = 100 / totalPercentage;
				results = results.map((item) => ({
					...item,
					pctChange: parseFloat(
						(item.pctChange * adjustmentFactor).toFixed(2)
					),
				}));
			}
			return results;
		} catch (error) {
			console.error("Error analyzing file types:", error);
			return [];
		}
	}

	private updateContent() {
		if (!this._panel) {
			return;
		}

		this._panel.webview.html = this._getWebviewContent(this._panel.webview);
	}

	private dispose() {
		GitPulsePanel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}

	private getNonce() {
		let text = "";
		const possible =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(
				Math.floor(Math.random() * possible.length)
			);
		}
		return text;
	}

	private _getWebviewContent(webview: vscode.Webview) {
		const stylesPath = vscode.Uri.joinPath(
			this._extensionUri,
			"src",
			"webview",
			"style.css"
		);
		const stylesMainUri = webview.asWebviewUri(stylesPath);

		const scriptPath = vscode.Uri.joinPath(
			this._extensionUri,
			"src",
			"webview",
			"script.js"
		);
		const chartjsPath = vscode.Uri.joinPath(
			this._extensionUri,
			"src",
			"webview",
			"chart.min.js"
		);
		const scriptUri = webview.asWebviewUri(scriptPath);
		const chartJsUri = webview.asWebviewUri(chartjsPath);

		const nonce = this.getNonce();

		return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
            <title>GitPulse Dashboard</title>
            <link href="${stylesMainUri}" rel="stylesheet">
        </head>
        <body>
            <div class="controls">
                <label> Show commits from: </label>
                <select id="timeframe">
                    <option value="day">Last 24 Hours</option>
                    <option value="week" selected>Last Week</option>
                    <option value="month">Last Month</option>
                </select>
            </div>

            <div class="chart-container">
                <h1 id="label-header">Total Commits</h1>
                <canvas id="commitsChart"></canvas>

                <h1> Contribution % by file types </h1>
				<canvas id="contributionsByFileTypesChart"></canvas>
			</div>

            <script src="${scriptUri}" nonce="${nonce}"></script>
            <script src="${chartJsUri}" nonce="${nonce}"></script>
        </body>
        </html>`;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
