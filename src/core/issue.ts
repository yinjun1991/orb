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
const BASE_VERSION_FILE = 'base_version.md';

const TEMPLATE_ISSUE = 'issue.md';
const TEMPLATE_BASE_VERSION = 'base_version.md';

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
 * Find the project root by looking for .orb.yaml or AGENTS.md upward.
 */
export function findProjectRoot(cwd: string = process.cwd()): string | null {
  let dir = cwd;
  while (true) {
    if (fs.existsSync(path.join(dir, '.orb.yaml')) || fs.existsSync(path.join(dir, 'AGENTS.md'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
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
 * Generate the issue.md content from a title, using the template.
 */
export function generateIssueMd(title: string): string {
  const template = readTemplate(TEMPLATE_ISSUE);
  return template.replace('{{TITLE}}', title);
}

/**
 * Generate bugs.md index content.
 */
export function generateBugsIndex(): string {
  return `# Bugs

| # | Title | Severity | Status | Round |
|---|-------|----------|--------|-------|
`;
}

/**
 * Get the current commit SHA for a repo on its base branch.
 */
export function getRepoHeadCommit(repoPath: string, baseBranch: string): string {
  const output = execSync(`git rev-parse ${baseBranch}`, { cwd: repoPath, encoding: 'utf-8' });
  return output.trim();
}

/**
 * Generate base_version.md content from the template.
 */
export function generateBaseVersion(baseVersions: BaseVersion): string {
  const template = readTemplate(TEMPLATE_BASE_VERSION);
  const lines = Object.entries(baseVersions).map(
    ([repo, commit]) => `- **${repo}**: \`${commit}\``,
  );
  return template.replace('{{REPO_VERSIONS}}', lines.join('\n'));
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

  // Write issue.md from template
  fs.writeFileSync(path.join(issueDir, ISSUE_FILE), generateIssueMd(title));

  // Write bugs.md index
  fs.writeFileSync(path.join(issueDir, BUGS_INDEX), generateBugsIndex());

  // Collect base versions and create worktrees
  const baseVersions: BaseVersion = {};
  const worktreesDir = path.join(projectRoot, WORKTREES_DIR, issueId);
  fs.ensureDirSync(worktreesDir);

  for (const repo of repos) {
    const repoPath = path.resolve(projectRoot, repo.path);
    const commit = getRepoHeadCommit(repoPath, repo.base_branch);
    baseVersions[repo.path] = commit;

    // Create git worktree
    const worktreePath = path.join(worktreesDir, path.basename(repo.path));
    execSync(`git worktree add -b ${issueId} ${worktreePath} ${commit}`, { cwd: repoPath, stdio: 'inherit' });
  }

  // Write base_version.md from template
  fs.writeFileSync(path.join(issueDir, BASE_VERSION_FILE), generateBaseVersion(baseVersions));

  // Append to issues.md index
  const indexPath = path.join(issuesDir, ISSUES_INDEX);
  const entry = `| ${issueId} | ${title} | defining |\n`;
  if (fs.existsSync(indexPath)) {
    fs.appendFileSync(indexPath, entry);
  } else {
    fs.writeFileSync(indexPath, `# Issues\n\n| ID | Title | Status |\n|---|---|---|\n${entry}`);
  }
}
