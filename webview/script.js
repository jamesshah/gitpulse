function script() {
	const vscode = acquireVsCodeApi();
	let myChart = null;
	let myFileTypeChart = null;
	let currentTimeframe = "week";

	const computedStyle = window.getComputedStyle(document.body);
	const foregroundColor = computedStyle.getPropertyValue(
		"--vscode-editor-foreground"
	);
	const gridColor = computedStyle.getPropertyValue("--vscode-panel-border");

	// Common options for both charts
	const commonChartOptions = {
		plugins: {
			legend: {
				labels: {
					color: foregroundColor,
				},
			},
		},
		scales: {
			r: {
				// For radar chart
				grid: {
					color: gridColor,
				},
				ticks: {
					color: foregroundColor,
					backdropColor: "rgba(0, 0, 0, 0.0)",
				},
				angleLines: {
					color: gridColor,
				},
				pointLabels: {
					color: foregroundColor,
				},
			},
		},
	};

	function getWeekNumber(date) {
		const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
		const pastDays = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
		return Math.ceil((pastDays + firstDayOfYear.getDay() + 1) / 7);
	}

	// Helper function to get all days of week
	function getAllDaysOfWeek() {
		return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	}

	// Helper function to get 24 hour periods
	function getAllHoursOfDay() {
		const hours = [];
		for (let i = 0; i < 24; i++) {
			hours.push(i.toString().padStart(2, "0") + ":00");
		}
		return hours;
	}

	// fix this function. It has a bug that cause it to not work in the first month of the year since endWeek is always less than currentWeek
	// Helper function to get all weeks in the last month
	function getAllWeeksInLastMonth() {
		const weeks = [];
		const today = new Date();
		const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
		let currentWeek = getWeekNumber(lastMonth);
		const endWeek = getWeekNumber(today);

		if (currentWeek > endWeek) {
			const totalWeeksInYear = getWeekNumber(
				new Date(today.getFullYear(), 11, 31)
			);
			while (currentWeek <= totalWeeksInYear) {
				weeks.push(`Week ${currentWeek}`);
				currentWeek++;
			}
			currentWeek = 1;
		}

		while (currentWeek <= endWeek) {
			weeks.push(`Week ${currentWeek}`);
			currentWeek++;
		}
		return weeks;
	}

	function getCompleteTimeframePeriods(timeframe) {
		switch (timeframe) {
			case "day":
				return getAllHoursOfDay();
			case "week":
				return getAllDaysOfWeek();
			case "month":
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
		allPeriods.forEach((period) => {
			grouped[period] = [];
		});

		// Group the actual commits
		commits.forEach((commit) => {
			const date = new Date(commit.date);
			let key;

			if (timeframe === "week") {
				key = date.toLocaleDateString([], { weekday: "short" });
			} else if (timeframe === "month") {
				const weekNum = getWeekNumber(date);
				key = `Week ${weekNum}`;
			} else {
				key = date
					.toLocaleTimeString([], {
						hour: "2-digit",
						minute: "2-digit",
						hour12: false,
					})
					.replace(/:\d\d$/, ":00"); // Round to hour
			}

			if (grouped.hasOwnProperty(key)) {
				grouped[key].push(commit);
			}
		});

		return grouped;
	}

	function initChart(userCommits, otherCommits, timeframe) {
		const ctx = document.getElementById("commitsChart").getContext("2d");

		const userCommitsGrouped = groupCommitsByTimeframe(
			userCommits,
			timeframe
		);

		let labels = Object.keys(userCommitsGrouped);
		const userCommitsData = labels.map(
			(label) => userCommitsGrouped[label].length
		);

		const datasets = [
			{
				label: "Your commits",
				data: userCommitsData,
				backgroundColor: "rgba(54, 162, 235, 0.5)",
			},
		];

		if (otherCommits) {
			const otherCommitsGrouped = groupCommitsByTimeframe(
				otherCommits,
				timeframe
			);

			// Add other's commits to labels
			Object.keys(otherCommitsGrouped).forEach((key) => {
				if (!labels.includes(key)) {
					labels.push(key);
				}
			});

			const otherCommitsData = labels.map(
				(label) => otherCommitsGrouped[label].length
			);

			datasets.push({
				label: "Other's commits",
				data: otherCommitsData,
				backgroundColor: "rgba(255, 99, 132, 0.2)",
			});
		}

		if (myChart) {
			myChart.destroy();
		}

		const canvas = document.getElementById("commitsChart");
		const loader = document.getElementById("commitsChart-loader");
		canvas.style.display = "block";
		loader.style.display = "none";

		myChart = new Chart(ctx, {
			type: "bar",
			data: {
				labels: labels,
				datasets: datasets,
			},
			plugins: [emptyChartPlugin],
			options: {
				...commonChartOptions,
				responsive: true,
				maintainAspectRatio: false,
				scales: {
					x: {
						// For bar chart
						grid: {
							color: gridColor,
						},
						ticks: {
							color: foregroundColor,
						},
					},
					y: {
						// For bar chart
						beginAtZero: true,
						grid: {
							color: gridColor,
						},
						ticks: {
							color: foregroundColor,
							stepSize: 1,
						},
					},
				},
			},
		});
	}

	function normalizeForRadarChart(fileStats) {
		// Method 1: Min-Max scaling to range 1-10
		// const minValue = Math.min(...fileStats.map((stat) => stat.pctChange));
		// const maxValue = Math.max(...fileStats.map((stat) => stat.pctChange));

		/* Alternative Method: Min-Max scaling
        return fileStats.map(stat => ({
            label: stat.extension,
            // Scale to 1-10 range
            value: 1 + ((stat.pctChange - minValue) / (maxValue - minValue)) * 9,
            originalPercentage: stat.pctChange
        }));
        */

		/* Alternative Method: Logarithmic transformation
        return fileStats.map(stat => ({
            label: stat.extension,
            value: Math.log10(stat.pctChange + 1) * 5,  // *5 to amplify the differences
            originalPercentage: stat.pctChange
        }));
        */

		// Alternative Method: Square root transformation
		return fileStats.map((stat) => ({
			label: stat.extension,
			value: Math.sqrt(stat.pctChange) * 3, // *3 to amplify the differences
			originalPercentage: stat.pctChange,
		}));
	}

	function initContributionsByFileTypesChart(
		userStats,
		otherStats,
		timeframe
	) {
		const ctx = document
			.getElementById("contributionsByFileTypesChart")
			.getContext("2d");
		if (myFileTypeChart) {
			myFileTypeChart.destroy();
		}

		let labels = userStats.map((stat) => stat.extension);
		const userStatsData = userStats.map((stat) => stat.pctChange);

		const datasets = [
			{
				label: "Your contribution in %",
				data: userStatsData,
				fill: true,
				backgroundColor: "rgba(54, 162, 235, 0.5)",
				borderColor: "rgb(54, 162, 235)",
				pointBackgroundColor: "rgb(54, 162, 235)",
				pointBorderColor: "#fff",
				pointHoverBackgroundColor: "#fff",
				pointHoverBorderColor: "rgb(54, 162, 235)",
			},
		];

		if (otherStats) {
			const otherStatsData = otherStats.map((stat) => stat.pctChange);

			otherStats
				.map((stat) => stat.extension)
				.filter((ext) => !labels.includes(ext))
				.forEach((ext) => labels.push(ext));

			datasets.push({
				label: "Other's contribution in %",
				data: otherStatsData,
				fill: true,
				backgroundColor: "rgba(255, 99, 132, 0.2)",
				borderColor: "rgb(255, 99, 132)",
				pointBackgroundColor: "rgb(255, 99, 132)",
				pointBorderColor: "#fff",
				pointHoverBackgroundColor: "#fff",
				pointHoverBorderColor: "rgb(255, 99, 132)",
			});
		}

		const canvas = document.getElementById("contributionsByFileTypesChart");
		const loader = document.getElementById(
			"contributionsByFileTypesChart-loader"
		);
		canvas.style.display = "block";
		loader.style.display = "none";

		myFileTypeChart = new Chart(ctx, {
			type: "radar",
			data: {
				labels: labels,
				datasets: datasets,
			},
			plugins: [emptyChartPlugin],
			options: {
				...commonChartOptions,
				elements: {
					line: {
						borderWidth: 3,
					},
				},
			},
		});
	}

	// Handle timeframe changes
	document.getElementById("timeframe").addEventListener("change", (e) => {
		currentTimeframe = e.target.value;
		vscode.postMessage({
			command: "getStats",
			timeframe: currentTimeframe,
		});
	});

	// Handle messages from extension
	window.addEventListener("message", (event) => {
		const message = event.data;
		switch (message.command) {
			case "updateStats":
				// console.log("updateCommits message", message);
				if (message.commits) {
					initChart(
						message.commits.currentUser,
						message.commits.others ?? null,
						currentTimeframe
					);
				}
				if (message.fileTypeStats) {
					initContributionsByFileTypesChart(
						message.fileTypeStats.currentUser,
						message.fileTypeStats.others ?? null,
						currentTimeframe
					);
				}
				break;
		}
	});

	setTimeout(() => {
		vscode.postMessage({
			command: "getStats",
			timeframe: "week",
		});
	}, 1000);
}

const emptyChartPlugin = {
	id: "emptyChart",
	afterDraw(chart, args, options) {
		const { datasets } = chart.data;
		let hasData = false;

		datasets
			.filter((dataset) => dataset.data.length > 0)
			.forEach((dataset) => {
				if (dataset.data.some((item) => item !== 0)) {
					hasData = true;
				}
			});

		if (!hasData) {
			const {
				chartArea: { left, top, right, bottom },
				ctx,
			} = chart;
			const centerX = (left + right) / 2;
			const centerY = (top + bottom) / 2;

			chart.clear();
			ctx.save();
			ctx.textAlign = "center";
			ctx.textBaseline = "middle";
			ctx.fillStyle = getComputedStyle(document.body).getPropertyValue(
				"--vscode-editor-foreground"
			);
			ctx.fillText(
				"No commits found. Start making commits and see stats",
				centerX,
				centerY
			);
			ctx.restore();
		}
	},
};

script();
