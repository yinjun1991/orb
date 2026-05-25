import { findProjectRoot, parseOrbConfig } from '../core/config.js';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

export async function cleanCommand(issueId: string): Promise<void> {
  const projectRoot = findProjectRoot();
  if (!projectRoot) {
    console.error(chalk.red('Error: Not in an orb project.'));
    process.exit(1);
  }

  const configPath = path.join(projectRoot, '.orb.yaml');
  const config = fs.existsSync(configPath)
    ? parseOrbConfig(fs.readFileSync(configPath, 'utf-8'))
    : null;

  // Clean worktree (if exists)
  const worktreeDir = path.join(projectRoot, 'worktrees', issueId);
  if (fs.existsSync(worktreeDir)) {
    if (config) {
      for (const repo of config.repos) {
        const repoPath = path.resolve(projectRoot, repo.path);
        const wtPath = path.join(worktreeDir, path.basename(repo.path));
        if (!fs.existsSync(wtPath)) continue;
        runOrWarn(`git worktree remove ${wtPath} --force`, repoPath);
      }
    }
    fs.removeSync(worktreeDir);
    console.log(`${chalk.gray('Removed')} worktrees/${issueId}/`);
  }

  // Delete local branch (always try, even if worktree is gone)
  if (config) {
    for (const repo of config.repos) {
      const repoPath = path.resolve(projectRoot, repo.path);
      runOrWarn(`git branch -D ${issueId}`, repoPath);
    }
  }

  updateIssueStatus(projectRoot, issueId, 'done');
  console.log(chalk.green(`${issueId} cleaned.`));
}

/** Run a shell command, print a warning on failure instead of crashing. */
function runOrWarn(cmd: string, cwd: string): void {
  try {
    execSync(cmd, { cwd, stdio: 'pipe' });
  } catch (err: any) {
    console.error(chalk.yellow(`  Warning: ${err.stderr?.toString().trim() || err.message}`));
  }
}

function updateIssueStatus(projectRoot: string, issueId: string, newStatus: string): void {
  const indexPath = path.join(projectRoot, 'issues', 'issues.md');
  if (!fs.existsSync(indexPath)) return;

  const content = fs.readFileSync(indexPath, 'utf-8');
  const lines = content.split('\n');
  const updated = lines.map(line => {
    const match = line.match(new RegExp(`^\\|\\s*${issueId}\\s*\\|`));
    if (!match) return line;
    const parts = line.split('|').map(c => c.trim());
    parts[3] = newStatus;
    return `| ${parts[1]} | ${parts[2]} | ${parts[3]} | ${parts[4] || ''} |`;
  });

  fs.writeFileSync(indexPath, updated.join('\n'));
}
