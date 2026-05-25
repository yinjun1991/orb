export interface OrbConfig {
  agent: 'cc' | 'codex';
  repos: RepoConfig[];
  max_review_rounds?: number;
}

export interface RepoConfig {
  path: string;
  remote?: string;       // defaults to 'origin'
  base_branch: string;   // required
}

export interface IssueEntry {
  id: string;
  title: string;
  status: IssueStatus;
}

export type IssueStatus = 'defining' | 'designing' | 'implementing' | 'reviewing' | 'done';

export interface BaseVersion {
  [repoPath: string]: string; // repo path -> commit SHA
}
