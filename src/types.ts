export interface OrbConfig {
  agent: 'cc' | 'codex';
  repos: RepoConfig[];
  max_review_rounds?: number;
}

export interface RepoConfig {
  path: string;
  remote?: string;          // defaults to 'origin'
  base_branch: string;      // required
  copy_files?: string[];    // files to copy from repo to worktree (e.g. .env)
}

export interface IssueEntry {
  id: string;
  title: string;
  status: IssueStatus;
}

export type IssueStatus = 'defining' | 'designing' | 'implementing' | 'reviewing' | 'done';

export interface BaseVersion {
  [repoName: string]: string; // repo name -> base commit SHA
}
