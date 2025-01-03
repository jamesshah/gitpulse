# GitPulse

![License](https://img.shields.io/badge/license-MIT-blue.svg)

GitPulse is a VS Code extension that provides insightful visualizations of your git repository's activity. It helps you understand your team's contribution patterns and code changes through interactive charts and metrics.

## Features

### 1. Commit Activity Dashboard

Track commit patterns with an interactive dashboard showing:

-   Your commits vs. team commits over time
-   Daily, weekly, and monthly views
-   Interactive bar charts showing commit distribution

### 2. File Type Analysis

Understand where changes are happening in your codebase:

-   Radar chart showing distribution of changes across different file types
-   Percentage breakdown of contributions by file extension
-   Automatically aggregates less common file types for clarity

### 3. Theme Integration

-   Seamlessly adapts to your VS Code theme
-   Supports both light and dark modes
-   Maintains consistent visual experience

## Getting Started

1. Install the extension from the VS Code Marketplace
2. Open a folder containing a Git repository
3. Access GitPulse by:
    - Using the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and searching for "Show GitPulse Dashboard"
    - Clicking the GitPulse icon in the activity bar (Coming soon!)

## Requirements

-   VS Code version 1.60.0 or higher
-   Git installed and available in path
-   Active Git repository in workspace

## Extension Settings

This extension contributes the following settings:

-   `gitpulse.dashboard.showOthersContributions`: Compare your contributions with other contributors of the repository (default: False)

## Release Notes

See [Changelog](./CHANGELOG.md).

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Credits

GitPulse uses the following open-source packages:

-   [Chart.js](https://chartjs.org) for visualization
