// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { exec } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";

const execAsync = promisify(exec);

// Interface for commit data
interface CommitData {
	hash: string;
	date: Date;
	message: string;
	author: string;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "gitpulse" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand(
		"gitpulse.showDashboard",
		() => {
			// The code you place here will be executed every time your command is executed
			GitPulsePanel.createOrShow(context.extensionUri);
		}
	);

	context.subscriptions.push(disposable);
}

class GitPulsePanel {
	public static currentPanel: GitPulsePanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;

		this.updateContent();

		// handle panel disposal
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case "getCommits":
						try {
							// commits from current user
							const userCommits = await this._getCommits(
								message.timeframe,
								true
							);
							// commits from other users
							const otherCommits = await this._getCommits(
								message.timeframe
							);
							if (this._panel) {
								await this._panel.webview.postMessage({
									command: "updateCommits",
									userCommits: userCommits,
									otherCommits: otherCommits,
								});
							}
						} catch (error) {
							console.error("Error processing commits:", error);
							if (this._panel) {
								vscode.window.showErrorMessage(
									"Failed to fetch git commits"
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

	public static createOrShow(extensionUri: vscode.Uri) {
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

		console.log("Getting commits for", timeframe);

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
			const { stdout: userEmail } = await execAsync(
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

			console.log("Command:", command);

			// Get commits from all branches for current user
			const { stdout } = await execAsync(command, {
				cwd: workspace.uri.fsPath,
			});

			return stdout
				.split("\n")
				.filter((line) => line.trim())
				.map((line) => {
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

	private updateContent() {
		if (!this._panel) {
			return;
		}

		this._panel.webview.html = this._getWebviewContent();
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

	private _getWebviewContent() {
		return `<!DOCTYPE html>
        <html>
        <head>
            <title>GitPulse Dashboard</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.7.0/chart.min.js"></script>
            <style>
                body { padding: 20px; font-family: Arial, sans-serif; }
                .controls { margin-bottom: 20px; }
                .chart-container { height: 400px; margin-bottom: 20px; }
                .commits-list { margin-top: 20px; }
                .commit-item { 
                    padding: 10px; 
                    border-bottom: 1px solid #ccc;
                    display: flex;
                    justify-content: space-between;
                }
                .group-header {
                    background-color: #f5f5f5;
                    padding: 10px;
                    margin-top: 20px;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="controls">
                <select id="timeframe">
                    <option value="day">Last 24 Hours</option>
                    <option value="week" selected>Last Week</option>
                    <option value="month">Last Month</option>
                </select>
            </div>
            <div class="chart-container">
                <canvas id="commitsChart"></canvas>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    let myChart = null;
                    let currentTimeframe = 'week';

                    function getWeekNumber(date) {
                        const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
                        const pastDays = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
                        return Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
                    }

                    function formatDateLabel(date, timeframe) {
                        if (timeframe === 'day') {
                            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        } else if (timeframe === 'week') {
                            return date.toLocaleDateString([], { weekday: 'short' });
                        } else {
                            const weekNum = getWeekNumber(date);
                            return \`Week \${weekNum}\`;
                        }
                    }

					// Helper function to get all days of week
                    function getAllDaysOfWeek() {
                        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    }

                    // Helper function to get 24 hour periods
                    function getAllHoursOfDay() {
                        const hours = [];
                        for (let i = 0; i < 24; i++) {
                            hours.push(i.toString().padStart(2, '0') + ':00');
                        }
                        return hours;
                    }

                    // Helper function to get all weeks in the last month
                    function getAllWeeksInLastMonth() {
                        const weeks = [];
                        const today = new Date();
                        const lastMonth = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
                        let currentWeek = getWeekNumber(lastMonth);
                        const endWeek = getWeekNumber(today);

                        while (currentWeek <= endWeek) {
                            weeks.push(\`Week \${currentWeek}\`);
                            currentWeek++;
                        }
                        return weeks;
                    }

                    function getCompleteTimeframePeriods(timeframe) {
                        switch(timeframe) {
                            case 'day':
                                return getAllHoursOfDay();
                            case 'week':
                                return getAllDaysOfWeek();
                            case 'month':
                                return getAllWeeksInLastMonth();
                            default:
                                return [];
                        }
                    }

                    function groupCommitsByTimeframe(commits, timeframe) {
                        // First, get all possible time periods
                        const allPeriods = getCompleteTimeframePeriods(timeframe);
                        const grouped = {};
                        
                        // Initialize all periods with empty arrays
                        allPeriods.forEach(period => {
                            grouped[period] = [];
                        });

                        // Group the actual commits
                        commits.forEach(commit => {
                            const date = new Date(commit.date);
                            let key;
                            
                            if (timeframe === 'week') {
                                key = date.toLocaleDateString([], { weekday: 'short' });
                            } else if (timeframe === 'month') {
                                const weekNum = getWeekNumber(date);
                                key = \`Week \${weekNum}\`;
                            } else {
                                key = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                    .replace(/:\d\d /, ':00 '); // Round to hour
                            }
                            
                            if (grouped.hasOwnProperty(key)) {
                                grouped[key].push(commit);
                            }
                        });
                        
                        return grouped;
                    }

                    function initChart(userCommits, otherCommits, timeframe) {
                        const ctx = document.getElementById('commitsChart').getContext('2d');
                        if (myChart) {
                            myChart.destroy();
                        }
                        
                        const userCommitsGrouped = groupCommitsByTimeframe(userCommits, timeframe);
						const otherCommitsGrouped = groupCommitsByTimeframe(otherCommits, timeframe);
                        const labels = Object.keys(userCommitsGrouped);
                        const userCommitsData = labels.map(label => userCommitsGrouped[label].length);
						const otherCommitsData = labels.map(label => otherCommitsGrouped[label].length);

                        myChart = new Chart(ctx, {
                            type: 'bar',
                            data: {
                                labels: labels,
                                datasets: [{
                                    label: 'Your commits',
                                    data: userCommitsData,
                                    backgroundColor: 'rgba(54, 162, 235, 0.5)'
                                },
								{
                                    label: "Other's commits",
                                    data: otherCommitsData,
                                    backgroundColor: 'rgba(255, 99, 132, 0.2)'
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        ticks: {
                                            stepSize: 1
                                        }
                                    }
                                }
                            }
                        });
                    }

                    function updateCommitsList(commits, timeframe) {
                        const list = document.getElementById('commitsList');
                        const grouped = groupCommitsByTimeframe(commits, timeframe);
                        
                        const html = Object.entries(grouped).map(([group, groupCommits]) => {
                            const commitsHtml = groupCommits.map(commit => 
                                '<div class="commit-item">' +
                                    '<div>' +
                                        '<strong>' + commit.message + '</strong>' +
                                        '<div>Branch: ' + commit.branch + '</div>' +
                                    '</div>' +
                                    '<div>' + new Date(commit.date).toLocaleString() + '</div>' +
                                '</div>'
                            ).join('');
                            
                            return \`
                                <div class="group-header">\${group} (\${groupCommits.length} commits)</div>
                                \${commitsHtml}
                            \`;
                        }).join('');
                        
                        list.innerHTML = html;
                    }

                    // Handle timeframe changes
                    document.getElementById('timeframe').addEventListener('change', (e) => {
                        currentTimeframe = e.target.value;
                        vscode.postMessage({ 
                            command: 'getCommits',
                            timeframe: currentTimeframe
                        });
                    });

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'updateCommits':
                                if (message.userCommits) {
									console.log("message", message);
                                    initChart(message.userCommits, message.otherCommits, currentTimeframe);
                                }
                                break;
                        }
                    });

                    // Initial load request
                    setTimeout(() => {
                        vscode.postMessage({ 
                            command: 'getCommits',
                            timeframe: currentTimeframe
                        });
                    }, 1000);
                })();
            </script>
        </body>
        </html>`;
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
