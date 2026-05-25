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

  const worktreeDir = path.join(projectRoot, 'worktrees', issueId);
  if (fs.existsSync(worktreeDir)) {
    if (config) {
      for (const repo of config.repos) {
        const repoPath = path.resolve(projectRoot, repo.path);
        const wtPath = path.join(worktreeDir, path.basename(repo.path));
        if (!fs.existsSync(wtPath)) continue;
        try {
          execSync(`git worktree remove ${wtPath} --force`, { cwd: repoPath, stdio: 'pipe' });
        } catch {
          // already removed
        }
      }
    }
    fs.removeSync(worktreeDir);
    console.log(`${chalk.gray('Removed')} worktrees/${issueId}/`);
  }

  updateIssueStatus(projectRoot, issueId, 'done');
  console.log(chalk.green(`${issueId} cleaned.`));
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
