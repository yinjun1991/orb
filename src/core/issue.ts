import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
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
      execSync(`git remote get-url ${remote}`, { cwd: repoPath, stdio: 'pipe' });
      execSync(`git fetch ${remote}`, { cwd: repoPath, stdio: 'pipe' });
      const output = execSync(`git rev-parse remotes/${remote}/${baseBranch}`, { cwd: repoPath, encoding: 'utf-8' });
      return output.trim();
    } catch {
      // remote unreachable or branch doesn't track it — fall back to local
    }
  }

  const output = execSync(`git rev-parse ${baseBranch}`, { cwd: repoPath, encoding: 'utf-8' });
  return output.trim();
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

  // Create directories
  fs.ensureDirSync(issueDir);
  fs.ensureDirSync(bugsDir);

  // Write standard files from templates
  fs.writeFileSync(path.join(issueDir, ISSUE_FILE), renderTemplate(TEMPLATE_ISSUE, title));
  fs.writeFileSync(path.join(issueDir, TECH_DESIGN_FILE), renderTemplate(TEMPLATE_TECH_DESIGN, title));
  fs.writeFileSync(path.join(issueDir, IMPLEMENTION_PLAN_FILE), renderTemplate(TEMPLATE_IMPLEMENTION_PLAN, title));

  // Write bugs.md index
  fs.writeFileSync(path.join(issueDir, BUGS_INDEX), generateBugsIndex());

  // Collect base versions and create worktrees
  const baseVersions: BaseVersion = {};
  const worktreesDir = path.join(projectRoot, WORKTREES_DIR, issueId);
  fs.ensureDirSync(worktreesDir);

  for (const repo of repos) {
    const repoPath = path.resolve(projectRoot, repo.path);
    const commit = getRepoHeadCommit(repoPath, repo.base_branch, repo.remote);
    baseVersions[path.basename(repo.path)] = commit;

    // Create git worktree
    const worktreePath = path.join(worktreesDir, path.basename(repo.path));
    execSync(`git worktree add -b ${issueId} ${worktreePath} ${commit}`, { cwd: repoPath, stdio: 'inherit' });

    // Copy untracked files/directories (e.g. .env, .vscode) from source repo to worktree
    for (const file of repo.copy_files || []) {
      const src = path.join(repoPath, file);
      const dest = path.join(worktreePath, file);
      if (fs.existsSync(src)) {
        fs.copySync(src, dest, { overwrite: true });
      }
    }
  }

  // Write VS Code workspace file
  const workspaceFile = path.join(worktreesDir, `${issueId}.code-workspace`);
  const workspaceContent = {
    folders: repos.map(r => ({
      path: path.basename(r.path),
      name: path.basename(r.path),
    })),
  };
  fs.writeFileSync(workspaceFile, JSON.stringify(workspaceContent, null, 2) + '\n');

  // Write base_version.json
  fs.writeFileSync(path.join(issueDir, BASE_VERSION_FILE), generateBaseVersion(baseVersions));

  // Append to issues.md index
  const indexPath = path.join(issuesDir, ISSUES_INDEX);
  const entry = `| ${issueId} | ${title} | defining | |\n`;
  if (fs.existsSync(indexPath)) {
    fs.appendFileSync(indexPath, entry);
  } else {
    fs.writeFileSync(indexPath, readTemplate(TEMPLATE_ISSUES_INDEX) + '\n' + entry);
  }
}
