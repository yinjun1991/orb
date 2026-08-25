import fs from 'fs-extra';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { RepoConfig, BaseVersion } from '../types.js';

const ISSUES_DIR = 'issues';
const WORKTREES_DIR = 'worktrees';
const ISSUES_INDEX = 'issues.md';
const BUGS_INDEX = 'bugs.md';
const ISSUE_FILE = 'issue.md';
const TECH_DESIGN_FILE = 'tech_design.md';
const IMPLEMENTION_PLAN_FILE = 'code_plan.md';
const BASE_VERSION_FILE = 'base_version.json';

const TEMPLATE_ISSUE = 'issue.md';
const TEMPLATE_TECH_DESIGN = 'tech_design.md';
const TEMPLATE_IMPLEMENTION_PLAN = 'code_plan.md';
const TEMPLATE_ISSUES_INDEX = 'issues.md';

/** Resolve the orb package root (for reading templates). */
function getOrbRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  // dist/core/issue.js → package root
  return path.resolve(path.dirname(__filename), '..', '..');
}

/** Read a template file and return its content. */
function readTemplate(name: string): string {
  // In dev: templates are at package root. In production: copied alongside dist.
  const pkgRoot = getOrbRoot();
  const distPath = path.join(pkgRoot, 'dist', 'templates', name);
  const devPath = path.join(pkgRoot, 'templates', name);
  const templatePath = fs.existsSync(distPath) ? distPath : devPath;
  return fs.readFileSync(templatePath, 'utf-8');
}

/**
 * Get the next issue number by scanning existing issue directories.
 */
export function getNextIssueId(projectRoot: string): string {
  const issuesDir = path.join(projectRoot, ISSUES_DIR);
  if (!fs.existsSync(issuesDir)) return 'f1';

  let maxNum = 0;
  for (const entry of fs.readdirSync(issuesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(/^f(\d+)$/);
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `f${maxNum + 1}`;
}

/**
 * Read a template and replace {{TITLE}} with the given title.
 */
function renderTemplate(templateName: string, title: string): string {
  return readTemplate(templateName).replace('{{TITLE}}', title);
}

/**
 * Read bugs.md from template.
 */
export function generateBugsIndex(): string {
  return readTemplate(BUGS_INDEX);
}

/**
 * Get the current commit SHA for a repo on its base branch.
 * Fetches from the remote first if one is configured and reachable,
 * so the worktree is always based on the latest upstream state.
 */
export function getRepoHeadCommit(repoPath: string, baseBranch: string, remote?: string): string {
  if (remote) {
    try {
      execFileSync('git', ['remote', 'get-url', remote], { cwd: repoPath, stdio: 'pipe' });
      execFileSync('git', ['fetch', remote], { cwd: repoPath, stdio: 'pipe' });
      const output = execFileSync('git', ['rev-parse', `remotes/${remote}/${baseBranch}`], {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return output.trim();
    } catch {
      // remote unreachable or branch doesn't track it — fall back to local
    }
  }

  try {
    const output = execFileSync('git', ['rev-parse', baseBranch], {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return output.trim();
  } catch (err: any) {
    throw new Error(`Cannot resolve base branch "${baseBranch}" in repository ${repoPath}: ${getCommandError(err)}`);
  }
}

interface PreparedRepo {
  config: RepoConfig;
  name: string;
  path: string;
  worktreePath: string;
  commit: string;
}

function prepareRepos(projectRoot: string, issueId: string, repos: RepoConfig[], worktreesDir: string): PreparedRepo[] {
  const names = new Set<string>();

  const preparedRepos = repos.map(repo => {
    const repoPath = path.resolve(projectRoot, repo.path);
    const repoName = path.basename(repoPath);

    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository path does not exist: ${repo.path} (${repoPath})`);
    }
    if (!fs.statSync(repoPath).isDirectory()) {
      throw new Error(`Repository path is not a directory: ${repo.path} (${repoPath})`);
    }
    if (names.has(repoName)) {
      throw new Error(`Repository name "${repoName}" is duplicated in .orb.yaml`);
    }
    names.add(repoName);

    try {
      const output = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (output.trim() !== 'true') throw new Error('not a worktree');
    } catch (err: any) {
      throw new Error(`Repository path is not a Git worktree: ${repo.path} (${repoPath}): ${getCommandError(err)}`);
    }

    const worktreePath = path.join(worktreesDir, repoName);
    if (fs.existsSync(worktreePath)) {
      throw new Error(`Worktree path already exists: ${worktreePath}`);
    }
    if (gitBranchExists(repoPath, issueId)) {
      throw new Error(`Branch "${issueId}" already exists in repository ${repo.path}`);
    }

    return { config: repo, name: repoName, path: repoPath, worktreePath };
  });

  return preparedRepos.map(repo => ({
    ...repo,
    commit: getRepoHeadCommit(repo.path, repo.config.base_branch, repo.config.remote),
  }));
}

function gitBranchExists(repoPath: string, branch: string): boolean {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: repoPath, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function rollbackIssue(issueDir: string, worktreesDir: string, issueId: string, attemptedRepos: PreparedRepo[]): string[] {
  const repos = [...attemptedRepos].reverse();
  const errors: string[] = [];

  for (const repo of repos) {
    try {
      execFileSync('git', ['worktree', 'remove', repo.worktreePath, '--force'], { cwd: repo.path, stdio: 'pipe' });
    } catch {
      // Cleanup below handles worktrees that were only partially registered.
    }
  }

  for (const target of [issueDir, worktreesDir]) {
    try {
      fs.removeSync(target);
    } catch (err: any) {
      errors.push(`cannot remove ${target}: ${getCommandError(err)}`);
    }
  }

  for (const repo of repos) {
    try {
      execFileSync('git', ['worktree', 'prune'], { cwd: repo.path, stdio: 'pipe' });
      if (gitBranchExists(repo.path, issueId)) {
        execFileSync('git', ['branch', '-D', issueId], { cwd: repo.path, stdio: 'pipe' });
      }
    } catch (err: any) {
      errors.push(`cannot clean ${repo.config.path}: ${getCommandError(err)}`);
    }
  }

  return errors;
}

function getCommandError(err: any): string {
  return String(err.stderr || err.message || err).trim();
}

/**
 * Generate base_version.json content.
 * Key: repo name (basename of repo path), Value: base commit SHA.
 */
export function generateBaseVersion(baseVersions: BaseVersion): string {
  return JSON.stringify(baseVersions, null, 2) + '\n';
}

/**
 * Create the full issue directory structure.
 */
export function createIssue(projectRoot: string, issueId: string, title: string, repos: RepoConfig[]): void {
  const issuesDir = path.join(projectRoot, ISSUES_DIR);
  const issueDir = path.join(issuesDir, issueId);
  const bugsDir = path.join(issueDir, 'bugs');
  const worktreesDir = path.join(projectRoot, WORKTREES_DIR, issueId);

  if (fs.existsSync(issueDir) || fs.existsSync(worktreesDir)) {
    throw new Error(`Issue ${issueId} already has files in issues/ or worktrees/`);
  }

  // Resolve every repo before writing files or creating branches, so invalid
  // configuration cannot leave a partially-created issue behind.
  const preparedRepos = prepareRepos(projectRoot, issueId, repos, worktreesDir);
  const attemptedRepos: PreparedRepo[] = [];

  try {
    fs.ensureDirSync(bugsDir);
    fs.ensureDirSync(worktreesDir);

    // Write standard files from templates
    fs.writeFileSync(path.join(issueDir, ISSUE_FILE), renderTemplate(TEMPLATE_ISSUE, title));
    fs.writeFileSync(path.join(issueDir, TECH_DESIGN_FILE), renderTemplate(TEMPLATE_TECH_DESIGN, title));
    fs.writeFileSync(path.join(issueDir, IMPLEMENTION_PLAN_FILE), renderTemplate(TEMPLATE_IMPLEMENTION_PLAN, title));

    // Write bugs.md index
    fs.writeFileSync(path.join(issueDir, BUGS_INDEX), generateBugsIndex());

    // Collect base versions and create worktrees
    const baseVersions: BaseVersion = {};

    for (const repo of preparedRepos) {
      baseVersions[repo.name] = repo.commit;
      attemptedRepos.push(repo);

      // Create git worktree
      execFileSync('git', ['worktree', 'add', '-b', issueId, repo.worktreePath, repo.commit], {
        cwd: repo.path,
        stdio: 'inherit',
      });

      // Copy untracked files/directories (e.g. .env, .vscode) from source repo to worktree
      for (const file of repo.config.copy_files || []) {
        const src = path.join(repo.path, file);
        const dest = path.join(repo.worktreePath, file);
        if (fs.existsSync(src)) {
          fs.copySync(src, dest, { overwrite: true });
        }
      }
    }

    // Write VS Code workspace file
    const workspaceFile = path.join(worktreesDir, `${issueId}.code-workspace`);
    const workspaceContent = {
      folders: preparedRepos.map(repo => ({
        path: repo.name,
        name: repo.name,
      })),
    };
    fs.writeFileSync(workspaceFile, JSON.stringify(workspaceContent, null, 2) + '\n');

    // Write base_version.json
    fs.writeFileSync(path.join(issueDir, BASE_VERSION_FILE), generateBaseVersion(baseVersions));

    // Append to issues.md index only after the issue is complete.
    const indexPath = path.join(issuesDir, ISSUES_INDEX);
    const entry = `| ${issueId} | ${title} | defining | |\n`;
    if (fs.existsSync(indexPath)) {
      fs.appendFileSync(indexPath, entry);
    } else {
      fs.writeFileSync(indexPath, readTemplate(TEMPLATE_ISSUES_INDEX) + '\n' + entry);
    }
  } catch (err) {
    const rollbackErrors = rollbackIssue(issueDir, worktreesDir, issueId, attemptedRepos);
    if (rollbackErrors.length > 0) {
      throw new Error(`${getCommandError(err)}; rollback incomplete: ${rollbackErrors.join('; ')}`);
    }
    throw err;
  }
}
