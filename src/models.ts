// Interface for commit data
export interface CommitData {
	hash: string;
	date: Date;
	message: string;
	author: string;
}

export interface FileTypeStats {
	extension: string;
	lines: number;
	pctChange: number;
}
